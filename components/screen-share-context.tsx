"use client"

import * as React from "react"
import {
  WebRTCSignal,
  WebRTCOffer,
  WebRTCAnswer,
  WebRTCIceCandidate,
} from "@/lib/webrtc/types"
import { mergeRemoteTrack } from "@/lib/webrtc/remote-stream"
import {
  getMicrophoneList,
  getSpeakerList,
  getActiveMicrophone,
  getActiveSpeaker,
  switchMicrophone,
  switchSpeaker,
  createAudioLevelMonitor,
  AudioDevice,
} from "@/lib/webrtc/audio-devices"

interface ScreenShareContextValue {
  // Host state
  isSharing: boolean
  localStream: MediaStream | null
  error: string | null
  peerCount: number
  connectionState: string
  startShare: () => Promise<void>
  stopShare: () => void
  toggleShare: () => Promise<void>
  handleHostSignal: (signal: WebRTCSignal) => void
  addPeer: (guestId: string, userId: string) => void

  // Host mic
  hostMicStream: MediaStream | null
  isHostMicMuted: boolean
  startHostMic: () => Promise<void>
  stopHostMic: () => void
  toggleHostMic: () => void

  // Guest state
  remoteStream: MediaStream | null
  isSharingFromHost: boolean
  sharerId: string | null
  receiveError: string | null
  stopReceiving: () => void
  handleGuestSignal: (signal: WebRTCSignal) => void

  // Guest mic
  guestMicStream: MediaStream | null
  isGuestMicMuted: boolean
  startGuestMic: () => Promise<void>
  stopGuestMic: () => void
  toggleGuestMic: () => void

  // Audio device management
  microphones: AudioDevice[]
  speakers: AudioDevice[]
  activeMicrophone: string | null
  activeSpeaker: string | null
  refreshDevices: () => Promise<void>
  switchMicrophoneDevice: (deviceId: string) => Promise<void>
  switchSpeakerDevice: (deviceId: string) => Promise<void>

  // Active speaker detection
  activeSpeakerId: string | null
  audioLevels: Map<string, number>

  // Screen share quality mode
  screenShareQuality: "balanced" | "performance" | "quality"
  setScreenShareQuality: (quality: "balanced" | "performance" | "quality") => void

  // Set by RoomView to route WebRTC signals via WebSocket
  setSendSignal: (send: ((signal: WebRTCSignal) => void) | null) => void
}

const ScreenShareContext = React.createContext<ScreenShareContextValue | null>(null)

export function useScreenShareGlobal() {
  const ctx = React.useContext(ScreenShareContext)
  if (!ctx) {
    throw new Error("useScreenShareGlobal must be used within ScreenShareProvider")
  }
  return ctx
}

interface ScreenShareProviderProps {
  children: React.ReactNode
}

export function ScreenShareProvider({ children }: ScreenShareProviderProps) {
  // ------------------------------------------------------------------
  // Host state
  // ------------------------------------------------------------------
  const [hostState, setHostState] = React.useState<{
    isSharing: boolean
    localStream: MediaStream | null
    error: string | null
    peerCount: number
    connectionState: string
  }>({
    isSharing: false,
    localStream: null,
    error: null,
    peerCount: 0,
    connectionState: "",
  })

  // Host microphone state
  const [hostMicState, setHostMicState] = React.useState<{
    micStream: MediaStream | null
    isMuted: boolean
  }>({
    micStream: null,
    isMuted: false,
  })

  // ------------------------------------------------------------------
  // Guest state
  // ------------------------------------------------------------------
  const [guestState, setGuestState] = React.useState<{
    remoteStream: MediaStream | null
    isSharing: boolean
    sharerId: string | null
    error: string | null
  }>({
    remoteStream: null,
    isSharing: false,
    sharerId: null,
    error: null,
  })

  // Guest microphone state
  const [guestMicState, setGuestMicState] = React.useState<{
    micStream: MediaStream | null
    isMuted: boolean
  }>({
    micStream: null,
    isMuted: false,
  })

  // Audio device management state
  const [microphones, setMicrophones] = React.useState<AudioDevice[]>([])
  const [speakers, setSpeakers] = React.useState<AudioDevice[]>([])
  const [activeMicrophone, setActiveMicrophone] = React.useState<string | null>(null)
  const [activeSpeaker, setActiveSpeaker] = React.useState<string | null>(null)

  // Active speaker detection state
  const [activeSpeakerId, setActiveSpeakerId] = React.useState<string | null>(null)
  const [audioLevels, setAudioLevels] = React.useState<Map<string, number>>(new Map())

  // Screen share quality mode
  const [screenShareQuality, setScreenShareQuality] = React.useState<"balanced" | "performance" | "quality">("balanced")

  const peerConnectionsRef = React.useRef<Map<string, RTCPeerConnection>>(new Map())
  const guestPeerConnectionRef = React.useRef<RTCPeerConnection | null>(null)
  const localStreamRef = React.useRef<MediaStream | null>(null)
  const remoteStreamRef = React.useRef<MediaStream | null>(null)
  const hostMicRef = React.useRef<MediaStream | null>(null)
  const guestMicRef = React.useRef<MediaStream | null>(null)
  const pendingCandidatesRef = React.useRef<WeakMap<RTCPeerConnection, RTCIceCandidateInit[]>>(
    new WeakMap()
  )
  const audioMonitorRef = React.useRef<Map<string, { getLevel: () => number; destroy: () => void }>>(
    new Map()
  )

  // ------------------------------------------------------------------
  // ICE candidates routinely arrive before the SDP that describes them.
  // Adding one then throws InvalidStateError ("No remoteDescription") and the
  // candidate is dropped, which can stall the connection — so hold them per
  // connection until a remote description exists, then flush.
  // ------------------------------------------------------------------
  const addIceCandidateWhenReady = React.useCallback(
    (pc: RTCPeerConnection, candidate: RTCIceCandidateInit) => {
      if (!pc.remoteDescription) {
        const pending = pendingCandidatesRef.current.get(pc) ?? []
        pending.push(candidate)
        pendingCandidatesRef.current.set(pc, pending)
        return
      }
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
        console.error("Failed to add ICE candidate:", err)
      })
    },
    []
  )

  const flushIceCandidates = React.useCallback((pc: RTCPeerConnection) => {
    const pending = pendingCandidatesRef.current.get(pc)
    if (!pending) return
    pendingCandidatesRef.current.delete(pc)
    for (const candidate of pending) {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
        console.error("Failed to add ICE candidate:", err)
      })
    }
  }, [])

  const iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ]

  const getConfiguration = (): RTCConfiguration => ({
    iceServers,
    iceCandidatePoolSize: 10,
  })

  // ------------------------------------------------------------------
  // Send signal via WebSocket (set by RoomView)
  // ------------------------------------------------------------------
  const sendSignalRef = React.useRef<((signal: WebRTCSignal) => void) | null>(null)

  const setSendSignal = React.useCallback((send: ((signal: WebRTCSignal) => void) | null) => {
    sendSignalRef.current = send
  }, [])

  const sendSignal = React.useCallback((signal: WebRTCSignal) => {
    sendSignalRef.current?.(signal)
  }, [])

  // ------------------------------------------------------------------
  // Audio device management
  // ------------------------------------------------------------------
  const refreshDevices = React.useCallback(async () => {
    try {
      const [mics, speakers] = await Promise.all([getMicrophoneList(), getSpeakerList()])
      setMicrophones(mics)
      setSpeakers(speakers)

      // Set active microphone from current host mic stream
      if (hostMicRef.current) {
        setActiveMicrophone(getActiveMicrophone(hostMicRef.current))
      }
      if (guestMicRef.current) {
        setActiveMicrophone(getActiveMicrophone(guestMicRef.current))
      }
    } catch (err) {
      console.error("Failed to refresh audio devices:", err)
    }
  }, [])

  const switchMicrophoneDevice = React.useCallback(
    async (deviceId: string) => {
      try {
        const newStream = await switchMicrophone(hostMicRef.current ?? null, deviceId)
        if (newStream) {
          hostMicRef.current = newStream
          setHostMicState({ micStream: newStream, isMuted: hostMicState.isMuted })
          setActiveMicrophone(deviceId)

          // Add mic track to all existing peer connections
          const micTrack = newStream.getAudioTracks()[0]
          if (micTrack) {
            for (const [, pc] of peerConnectionsRef.current) {
              pc.addTrack(micTrack, newStream)
            }
          }
        }
      } catch (err) {
        console.error("Failed to switch microphone:", err)
      }
    },
    [hostMicState.isMuted]
  )

  const switchSpeakerDevice = React.useCallback(async (deviceId: string) => {
    try {
      const videoEls = document.querySelectorAll("video")
      for (const el of videoEls) {
        await switchSpeaker(el as HTMLVideoElement, deviceId)
      }
      setActiveSpeaker(deviceId)
    } catch (err) {
      console.error("Failed to switch speaker:", err)
    }
  }, [])

  // ------------------------------------------------------------------
  // Host: close all peer connections
  // ------------------------------------------------------------------
  const closeAllPeers = React.useCallback(() => {
    for (const [, pc] of peerConnectionsRef.current) {
      pc.close()
    }
    peerConnectionsRef.current.clear()
    setHostState((prev) => ({ ...prev, peerCount: 0 }))
  }, [])

  // ------------------------------------------------------------------
  // Host: stop sharing (fully cleans up)
  // ------------------------------------------------------------------
  const stopShare = React.useCallback(() => {
    closeAllPeers()
    const stream = localStreamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
    }
    setHostState({
      isSharing: false,
      localStream: null,
      error: null,
      peerCount: 0,
      connectionState: "",
    })
    // Tell the room the share ended so guests tear their player down instead
    // of waiting on a silently dead peer connection.
    sendSignal({ type: "webrtc.screen-share.stopped", roomId: "", from: "" })
  }, [closeAllPeers, sendSignal])

  // ------------------------------------------------------------------
  // Host: start sharing
  // ------------------------------------------------------------------
  const startShare = React.useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000,
        },
      })
      localStreamRef.current = stream
      setHostState((prev) => ({ ...prev, isSharing: true, localStream: stream, error: null }))

      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        stopShare()
      })

      // If mic is already captured, add its track to the peer connections
      const micStream = hostMicRef.current
      if (micStream) {
        const micTrack = micStream.getAudioTracks()[0]
        if (micTrack) {
          for (const [, pc] of peerConnectionsRef.current) {
            pc.addTrack(micTrack, micStream)
          }
        }
      }
    } catch (err: any) {
      setHostState((prev) => ({
        ...prev,
        error: err?.message ?? "Failed to start screen sharing",
      }))
    }
  }, [stopShare])

  // ------------------------------------------------------------------
  // Host: toggle share
  // ------------------------------------------------------------------
  const toggleShare = React.useCallback(async () => {
    if (hostState.isSharing) stopShare()
    else await startShare()
  }, [hostState.isSharing, startShare, stopShare])

  // ------------------------------------------------------------------
  // Host mic capture
  // ------------------------------------------------------------------
  const startHostMic = React.useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      hostMicRef.current = stream
      setHostMicState({ micStream: stream, isMuted: false })

      const micTrack = stream.getAudioTracks()[0]
      if (micTrack) {
        // Add mic track to all existing peer connections
        for (const [, pc] of peerConnectionsRef.current) {
          pc.addTrack(micTrack, stream)
        }
      }
    } catch (err: any) {
      setHostState((prev) => ({
        ...prev,
        error: err?.message ?? "Failed to access microphone",
      }))
    }
  }, [])

  const stopHostMic = React.useCallback(() => {
    const stream = hostMicRef.current
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      hostMicRef.current = null
    }
    setHostMicState({ micStream: null, isMuted: false })
  }, [])

  const toggleHostMic = React.useCallback(() => {
    if (hostMicState.isMuted) {
      const stream = hostMicRef.current
      if (stream) {
        const track = stream.getAudioTracks()[0]
        if (track) {
          track.enabled = true
          setHostMicState((prev) => ({ ...prev, isMuted: false }))
        }
      }
    } else {
      const stream = hostMicRef.current
      if (stream) {
        const track = stream.getAudioTracks()[0]
        if (track) {
          track.enabled = false
          setHostMicState((prev) => ({ ...prev, isMuted: true }))
        }
      }
    }
  }, [hostMicState.isMuted])

  // ------------------------------------------------------------------
  // Host: create peer connection for a new guest
  // ------------------------------------------------------------------
  const createPeerForGuest = React.useCallback(
    (guestId: string, userId: string) => {
      if (!localStreamRef.current) return

      const pc = new RTCPeerConnection(getConfiguration())

      // Add screen tracks
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current!)
      }

      // Add mic track if available
      const micStream = hostMicRef.current
      if (micStream) {
        const micTrack = micStream.getAudioTracks()[0]
        if (micTrack) {
          pc.addTrack(micTrack, micStream)
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal({
            type: "webrtc.ice-candidate",
            roomId: "",
            from: userId,
            to: guestId,
            candidate: event.candidate.toJSON(),
          })
        }
      }

      pc.onconnectionstatechange = () => {
        setHostState((prev) => ({
          ...prev,
          connectionState: pc.connectionState,
        }))
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          pc.close()
          peerConnectionsRef.current.delete(guestId)
          setHostState((prev) => ({
            ...prev,
            peerCount: peerConnectionsRef.current.size,
          }))
        }
      }

      // Receive guest's mic/audio tracks
      pc.ontrack = (event) => {
        if (event.track.kind === "audio") {
          console.log(`[host] received audio track from guest ${guestId}:`, event.track.kind)
        }
      }

      peerConnectionsRef.current.set(guestId, pc)
      setHostState((prev) => ({ ...prev, peerCount: peerConnectionsRef.current.size }))

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          const localDesc = pc.localDescription
          if (localDesc) {
            sendSignal({
              type: "webrtc.offer",
              roomId: "",
              from: userId,
              to: guestId,
              sdp: localDesc.sdp,
            })
          }
        })
        .catch((err) => {
          console.error("Failed to create offer:", err)
        })
    },
    [sendSignal]
  )

  const addPeer = React.useCallback((guestId: string, userId: string) => {
    createPeerForGuest(guestId, userId)
  }, [createPeerForGuest])

  // ------------------------------------------------------------------
  // Host: handle incoming signal from guests
  // ------------------------------------------------------------------
  const handleHostSignal = React.useCallback(
    (signal: WebRTCSignal) => {
      switch (signal.type) {
        case "webrtc.answer": {
          const answer = signal as WebRTCAnswer
          const pc = peerConnectionsRef.current.get(answer.from)
          if (pc) {
            pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: answer.sdp }))
              .then(() => flushIceCandidates(pc))
              .catch((err) => {
                console.error("Failed to set remote answer:", err)
              })
          }
          break
        }
        case "webrtc.ice-candidate": {
          const candidate = signal as WebRTCIceCandidate
          const pc = peerConnectionsRef.current.get(candidate.from)
          if (pc && candidate.candidate) {
            addIceCandidateWhenReady(pc, candidate.candidate)
          }
          break
        }
      }
    },
    [addIceCandidateWhenReady, flushIceCandidates]
  )

  // ------------------------------------------------------------------
  // Guest: stop receiving
  // ------------------------------------------------------------------
  const stopReceiving = React.useCallback(() => {
    const pc = guestPeerConnectionRef.current
    if (pc) {
      pc.close()
      guestPeerConnectionRef.current = null
    }
    const stream = guestState.remoteStream
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
    }
    // Stop guest mic
    const micStream = guestMicRef.current
    if (micStream) {
      micStream.getTracks().forEach((track) => track.stop())
      guestMicRef.current = null
    }
    setGuestMicState({ micStream: null, isMuted: false })
    setGuestState({
      remoteStream: null,
      isSharing: false,
      sharerId: null,
      error: null,
    })
  }, [guestState.remoteStream])

  // ------------------------------------------------------------------
  // Guest: handle incoming signal from host
  // ------------------------------------------------------------------
  const handleGuestSignal = React.useCallback(
    (signal: WebRTCSignal) => {
      switch (signal.type) {
        case "webrtc.offer": {
          const offer = signal as WebRTCOffer
          // A new offer means the host re-started sharing: drop the previous
          // connection and its stream so the fresh one replaces it.
          guestPeerConnectionRef.current?.close()
          guestPeerConnectionRef.current = null
          remoteStreamRef.current = null
          const pc = new RTCPeerConnection(getConfiguration())

          // Add guest mic track if available
          const guestMicStream = guestMicRef.current
          if (guestMicStream) {
            const micTrack = guestMicStream.getAudioTracks()[0]
            if (micTrack) {
              pc.addTrack(micTrack, guestMicStream)
            }
          }

          pc.ontrack = (event) => {
            // Video and tab audio arrive as separate track events that share
            // one remote stream; merge them so adding audio never replaces the
            // stream that carries the shared video.
            const stream = mergeRemoteTrack(remoteStreamRef.current, event)
            remoteStreamRef.current = stream
            setGuestState((prev) =>
              prev.remoteStream === stream ? prev : { ...prev, remoteStream: stream }
            )
          }

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              sendSignal({
                type: "webrtc.ice-candidate",
                roomId: "",
                from: "",
                to: offer.from,
                candidate: event.candidate.toJSON(),
              })
            }
          }

          pc.onconnectionstatechange = () => {
            if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
              stopReceiving()
            }
          }

          guestPeerConnectionRef.current = pc

          pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: offer.sdp }))
            .then(() => {
              flushIceCandidates(pc)
              return pc.createAnswer()
            })
            .then((answer) => pc.setLocalDescription(answer))
            .then(() => {
              const localDesc = pc.localDescription
              if (localDesc) {
                sendSignal({
                  type: "webrtc.answer",
                  roomId: "",
                  from: "",
                  to: offer.from,
                  sdp: localDesc.sdp,
                })
              }
            })
            .catch((err) => {
              console.error("Failed to handle offer:", err)
              setGuestState((prev) => ({ ...prev, error: err?.message ?? "Failed to join screen share" }))
            })
          break
        }
        case "webrtc.ice-candidate": {
          const candidate = signal as WebRTCIceCandidate
          const pc = guestPeerConnectionRef.current
          if (pc && candidate.candidate) {
            pc.addIceCandidate(new RTCIceCandidate(candidate.candidate)).catch((err) => {
              console.error("Failed to add ICE candidate:", err)
            })
          }
          break
        }
        case "webrtc.screen-share.started": {
          setGuestState((prev) => ({
            ...prev,
            isSharing: true,
            sharerId: signal.from ?? null,
          }))
          break
        }
        case "webrtc.screen-share.stopped": {
          stopReceiving()
          break
        }
      }
    },
    [addIceCandidateWhenReady, flushIceCandidates, sendSignal, stopReceiving]
  )

  // ------------------------------------------------------------------
  // Guest mic capture
  // ------------------------------------------------------------------
  const startGuestMic = React.useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      guestMicRef.current = stream
      setGuestMicState({ micStream: stream, isMuted: false })

      const micTrack = stream.getAudioTracks()[0]
      if (micTrack) {
        const pc = guestPeerConnectionRef.current
        if (pc) {
          pc.addTrack(micTrack, stream)
          // Re-create offer to renegotiate with new track
          pc.createOffer()
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => {
              const localDesc = pc.localDescription
              if (localDesc) {
                sendSignal({
                  type: "webrtc.offer",
                  roomId: "",
                  from: "",
                  to: "", // will be filled by sender
                  sdp: localDesc.sdp,
                })
              }
            })
            .catch((err) => console.error("Failed to renegotiate with guest mic:", err))
        }
      }
    } catch (err: any) {
      setGuestState((prev) => ({
        ...prev,
        error: err?.message ?? "Failed to access microphone",
      }))
    }
  }, [sendSignal])

  const stopGuestMic = React.useCallback(() => {
    const stream = guestMicRef.current
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      guestMicRef.current = null
    }
    setGuestMicState({ micStream: null, isMuted: false })
  }, [])

  const toggleGuestMic = React.useCallback(() => {
    if (guestMicState.isMuted) {
      const stream = guestMicRef.current
      if (stream) {
        const track = stream.getAudioTracks()[0]
        if (track) {
          track.enabled = true
          setGuestMicState((prev) => ({ ...prev, isMuted: false }))
        }
      }
    } else {
      const stream = guestMicRef.current
      if (stream) {
        const track = stream.getAudioTracks()[0]
        if (track) {
          track.enabled = false
          setGuestMicState((prev) => ({ ...prev, isMuted: true }))
        }
      }
    }
  }, [guestMicState.isMuted])

  // ------------------------------------------------------------------
  // Active speaker detection
  // ------------------------------------------------------------------
  React.useEffect(() => {
    const stream = remoteStreamRef.current
    if (!stream) {
      setActiveSpeakerId(null)
      setAudioLevels(new Map())
      return
    }

    const track = stream.getAudioTracks()[0]
    if (!track) {
      setActiveSpeakerId(null)
      setAudioLevels(new Map())
      return
    }

    const monitor = createAudioLevelMonitor(track)
    audioMonitorRef.current.set(guestState.sharerId || "host", monitor)

    const updateLevels = () => {
      const levels = new Map(audioLevels)
      audioMonitorRef.current.forEach((mon, uid) => {
        levels.set(uid, mon.getLevel())
      })
      setAudioLevels(levels)

      let maxLevel = 0
      let maxUserId: string | null = null
      levels.forEach((level, uid) => {
        if (level > maxLevel && level > 0.1) {
          maxLevel = level
          maxUserId = uid
        }
      })
      setActiveSpeakerId(maxUserId)

      requestAnimationFrame(updateLevels)
    }

    updateLevels()

    return () => {
      monitor.destroy()
      audioMonitorRef.current.delete(guestState.sharerId || "host")
    }
  }, [remoteStreamRef.current, guestState.sharerId, audioLevels])

  // Refresh audio devices on mount
  React.useEffect(() => {
    refreshDevices()
  }, [refreshDevices])

  const value: ScreenShareContextValue = {
    // Host
    isSharing: hostState.isSharing,
    localStream: hostState.localStream,
    error: hostState.error,
    peerCount: hostState.peerCount,
    connectionState: hostState.connectionState,
    startShare,
    stopShare,
    toggleShare,
    handleHostSignal,
    addPeer,
    // Host mic
    hostMicStream: hostMicState.micStream,
    isHostMicMuted: hostMicState.isMuted,
    startHostMic,
    stopHostMic,
    toggleHostMic,
    // Guest
    remoteStream: guestState.remoteStream,
    isSharingFromHost: guestState.isSharing,
    sharerId: guestState.sharerId,
    receiveError: guestState.error,
    stopReceiving,
    handleGuestSignal,
    // Guest mic
    guestMicStream: guestMicState.micStream,
    isGuestMicMuted: guestMicState.isMuted,
    startGuestMic,
    stopGuestMic,
    toggleGuestMic,
    // Audio device management
    microphones,
    speakers,
    activeMicrophone,
    activeSpeaker,
    refreshDevices,
    switchMicrophoneDevice,
    switchSpeakerDevice,
    // Active speaker detection
    activeSpeakerId,
    audioLevels,
    // Screen share quality mode
    screenShareQuality,
    setScreenShareQuality,
    setSendSignal,
  }

  return (
    <ScreenShareContext.Provider value={value}>
      {children}
    </ScreenShareContext.Provider>
  )
}
