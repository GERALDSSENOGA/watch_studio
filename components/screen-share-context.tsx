"use client"

import * as React from "react"
import {
  WebRTCSignal,
  WebRTCOffer,
  WebRTCAnswer,
  WebRTCIceCandidate,
} from "@/lib/webrtc/types"
import { mergeRemoteTrack } from "@/lib/webrtc/remote-stream"
import { isLivePeer, reusableGuestPeer } from "@/lib/webrtc/peer-reuse"
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
  /** Live RTCPeerConnectionState for the guest's single peer connection. */
  guestConnectionState: string
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
    connectionState: string
  }>({
    remoteStream: null,
    isSharing: false,
    sharerId: null,
    error: null,
    connectionState: "",
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
  // Guest microphones arrive as audio-only tracks; each needs an element to
  // actually play through the host's speakers.
  const guestAudioElementsRef = React.useRef<Map<string, HTMLAudioElement>>(new Map())
  const reconnectAttemptsRef = React.useRef<Map<string, number>>(new Map())
  const recreatePeerRef = React.useRef<((guestId: string, userId: string) => void) | null>(null)
  // The host's own userId, captured when the first peer is created. Needed by
  // startHostMic so it can renegotiate each guest connection with the correct
  // `from` field when the host turns their mic on mid-share.
  const hostUserIdRef = React.useRef<string | null>(null)
  // Grace timers for a transient "disconnected". A momentary blip (network
  // switch, tab throttling, an ICE candidate in flight) recovers on its own;
  // only after the grace period do we attempt an ICE restart, so a healthy
  // share is not torn down over a hiccup.
  const graceTimersRef = React.useRef<
    WeakMap<RTCPeerConnection, ReturnType<typeof setTimeout>>
  >(new WeakMap())

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

  // ------------------------------------------------------------------
  // SDP operations are async, and signals can arrive twice or out of order.
  // Running them concurrently (or applying a duplicate answer) throws
  // InvalidStateError — "Cannot set remote answer in state stable" — and
  // breaks the share, so every negotiation step is serialized per connection.
  // ------------------------------------------------------------------
  const signalingQueuesRef = React.useRef<WeakMap<RTCPeerConnection, Promise<void>>>(
    new WeakMap()
  )

  const enqueueSignaling = React.useCallback(
    (pc: RTCPeerConnection, task: () => Promise<void>) => {
      // The tail `.catch` swallows errors, so the stored queue promise never
      // rejects; a failed step therefore cannot poison the steps that follow
      // it. (The previous `.then(task, task)` also ran the task as the
      // rejection handler — redundant, since the chain never rejects.)
      const previous = signalingQueuesRef.current.get(pc) ?? Promise.resolve()
      const next = previous
        .then(task)
        .catch((err) => console.error("Failed to apply signalling step:", err))
      signalingQueuesRef.current.set(pc, next)
    },
    []
  )

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
  // Diagnostics: WebRTC exposes three independent states (signaling, ICE,
  // connection). Logging all three at every transition makes a drop visible at
  // the exact moment it happens instead of after the fact.
  // ------------------------------------------------------------------
  const logPeer = React.useCallback((label: string, pc: RTCPeerConnection) => {
    console.debug(
      `[webrtc:${label}] signaling=${pc.signalingState} ice=${pc.iceConnectionState} conn=${pc.connectionState}`
    )
  }, [])

  const clearGrace = React.useCallback((pc: RTCPeerConnection) => {
    const timer = graceTimersRef.current.get(pc)
    if (timer) {
      clearTimeout(timer)
      graceTimersRef.current.delete(pc)
    }
  }, [])

  // The host may hold one peer connection per guest. Deriving the indicator
  // from the whole map (instead of whichever peer fired last) stops it from
  // flip-flopping between "connecting" and "closed" as guests join/retry.
  const refreshHostConnectionState = React.useCallback(() => {
    const states = Array.from(peerConnectionsRef.current.values()).map(
      (peer) => peer.connectionState
    )
    const aggregate =
      states.length === 0
        ? ""
        : states.includes("connected")
          ? "connected"
          : states.includes("connecting") || states.includes("new")
            ? "connecting"
            : states.includes("disconnected")
              ? "disconnected"
              : "failed"
    setHostState((prev) =>
      prev.connectionState === aggregate ? prev : { ...prev, connectionState: aggregate }
    )
  }, [])

  // Host-initiated renegotiation. Used both by onnegotiationneeded (new track)
  // and by the ICE-restart recovery path.
  const hostRenegotiate = React.useCallback(
    (pc: RTCPeerConnection, guestId: string, userId: string, iceRestart = false) => {
      enqueueSignaling(pc, async () => {
        if (pc.signalingState !== "stable") return
        const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined)
        await pc.setLocalDescription(offer)
        if (pc.localDescription) {
          logPeer(`host:${guestId}:offer`, pc)
          sendSignal({
            type: "webrtc.offer",
            roomId: "",
            from: userId,
            to: guestId,
            sdp: pc.localDescription.sdp,
          })
        }
      })
    },
    [enqueueSignaling, sendSignal, logPeer]
  )

  // Guest-initiated renegotiation (late mic, or ICE-restart recovery). The host
  // answers via its webrtc.offer handler.
  const guestRenegotiate = React.useCallback(
    (pc: RTCPeerConnection, hostId: string, iceRestart = false) => {
      enqueueSignaling(pc, async () => {
        if (pc.signalingState !== "stable") return
        const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined)
        await pc.setLocalDescription(offer)
        if (pc.localDescription) {
          logPeer("guest:offer", pc)
          sendSignal({
            type: "webrtc.offer",
            roomId: "",
            from: "",
            to: hostId,
            sdp: pc.localDescription.sdp,
          })
        }
      })
    },
    [enqueueSignaling, sendSignal, logPeer]
  )

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
    for (const [, el] of guestAudioElementsRef.current) {
      el.pause()
      el.srcObject = null
    }
    guestAudioElementsRef.current.clear()
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
    const isFirefox =
      typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent)
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        // Chrome defaults the picker to "Window", whose GPU video layer is not
        // captured (viewers see blank frames). Ask for a browser tab with an
        // `ideal` constraint so a browser that does not know the hint falls
        // back to any surface instead of throwing. Firefox gets a plain `true`.
        video: isFirefox ? true : { displaySurface: { ideal: "browser" } },
        // Firefox's tab-capture audio path ignores processing hints and can
        // drop the track when they are present, so request plain audio there.
        audio: isFirefox
          ? true
          : {
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
      const raw = err?.message ?? "Failed to start screen sharing"
      // On Firefox the generic error hides the real cause (tab capture renders
      // blank / audio track dropped). Surface an actionable message.
      setHostState((prev) => ({
        ...prev,
        error: isFirefox
          ? `Firefox screen capture failed: ${raw}. Use Chrome for reliable sharing, or pick a Tab (not Window/Screen).`
          : raw,
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
        // Add mic track to all existing peer connections and renegotiate each
        // one so every guest receives the host's mic audio. addTrack does not
        // reliably fire onnegotiationneeded in every browser, so we trigger
        // the re-offer explicitly instead of waiting for it.
        for (const [guestId, pc] of peerConnectionsRef.current) {
          pc.addTrack(micTrack, stream)
          if (hostUserIdRef.current) {
            hostRenegotiate(pc, guestId, hostUserIdRef.current, false)
          }
        }
      }
    } catch (err: any) {
      setHostState((prev) => ({
        ...prev,
        error: err?.message ?? "Failed to access microphone",
      }))
    }
  }, [hostRenegotiate, hostUserIdRef])

  const stopHostMic = React.useCallback(() => {
    const stream = hostMicRef.current
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      hostMicRef.current = null
    }
    setHostMicState({ micStream: null, isMuted: false })
  }, [])

  const toggleHostMic = React.useCallback(() => {
    // First press turns the microphone on; later presses mute/unmute it.
    const track = hostMicRef.current?.getAudioTracks()[0]
    if (!track) {
      void startHostMic()
      return
    }
    // Derive the next state from the live track, not from stored React state:
    // after a re-negotiation or ICE restart the `isMuted` flag can be stale,
    // which left the button stuck or inverted.
    track.enabled = !track.enabled
    setHostMicState((prev) => ({ ...prev, isMuted: !track.enabled }))
  }, [startHostMic])

  // ------------------------------------------------------------------
  // Host: create peer connection for a new guest
  // ------------------------------------------------------------------
  const createPeerForGuest = React.useCallback(
    (guestId: string, userId: string) => {
      if (!localStreamRef.current) return

      // The guest already has a connection to this share (a repeated
      // "guest joined" while the share is starting, or a room re-announce).
      // Building a second one replaces an established transport mid-session,
      // which Chrome rejects with "Failed to set SSL role for the transport".
      // Renegotiation of the existing connection happens on its own.
      if (isLivePeer(peerConnectionsRef.current.get(guestId))) return

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

      // Adding a late track (host mic, guest mic) needs a fresh offer; the
      // initial one is sent explicitly below, so only renegotiate once the
      // connection already has a local description.
      pc.onnegotiationneeded = () => {
        logPeer(`host:${guestId}:negotiationneeded`, pc)
        if (!pc.localDescription) return
        hostRenegotiate(pc, guestId, userId, false)
      }

      pc.onsignalingstatechange = () => logPeer(`host:${guestId}:signaling`, pc)
      pc.oniceconnectionstatechange = () => logPeer(`host:${guestId}:ice`, pc)

      pc.onconnectionstatechange = () => {
        refreshHostConnectionState()
        logPeer(`host:${guestId}:conn`, pc)

        if (pc.connectionState === "connected") {
          reconnectAttemptsRef.current.delete(guestId)
          clearGrace(pc)
          return
        }

        // "disconnected" is routinely transient (network switch, tab
        // throttling). Give it a grace period; if it has not recovered by then,
        // attempt an ICE restart on the existing connection instead of tearing
        // it down — a brief blip must not kill a healthy share.
        if (pc.connectionState === "disconnected") {
          if (!graceTimersRef.current.has(pc)) {
            const timer = setTimeout(() => {
              graceTimersRef.current.delete(pc)
              if (
                pc.connectionState === "disconnected" &&
                peerConnectionsRef.current.get(guestId) === pc
              ) {
                console.warn(`[webrtc:host:${guestId}] grace expired — attempting ICE restart`)
                try {
                  pc.restartIce()
                } catch (err) {
                  console.error("restartIce failed:", err)
                }
                hostRenegotiate(pc, guestId, userId, true)
              }
            }, 5000)
            graceTimersRef.current.set(pc, timer)
          }
          return
        }

        if (pc.connectionState !== "failed") return

        clearGrace(pc)
        pc.close()
        peerConnectionsRef.current.delete(guestId)
        refreshHostConnectionState()
        setHostState((prev) => ({
          ...prev,
          peerCount: peerConnectionsRef.current.size,
        }))
        const attempts = reconnectAttemptsRef.current.get(guestId) ?? 0
        if (attempts >= 3 || !localStreamRef.current) return
        reconnectAttemptsRef.current.set(guestId, attempts + 1)
        recreatePeerRef.current?.(guestId, userId)
      }

      // Receive guest's mic/audio tracks and play them for the host
      pc.ontrack = (event) => {
        if (event.track.kind !== "audio") return
        const el = guestAudioElementsRef.current.get(guestId) ?? new Audio()
        el.srcObject = event.streams[0] ?? new MediaStream([event.track])
        el.autoplay = true
        guestAudioElementsRef.current.set(guestId, el)
        el.play().catch(() => {})
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
    [hostRenegotiate, logPeer, clearGrace, refreshHostConnectionState, sendSignal]
  )

  const addPeer = React.useCallback((guestId: string, userId: string) => {
    hostUserIdRef.current = userId
    createPeerForGuest(guestId, userId)
  }, [createPeerForGuest])

  // Lets the connection-state handler re-offer without depending on itself.
  React.useEffect(() => {
    recreatePeerRef.current = createPeerForGuest
  }, [createPeerForGuest])

  // ------------------------------------------------------------------
  // Host: handle incoming signal from guests
  // ------------------------------------------------------------------
  const handleHostSignal = React.useCallback(
    (signal: WebRTCSignal) => {
      switch (signal.type) {
        case "webrtc.offer": {
          // A guest re-offers when it adds a microphone; answer on the
          // existing connection so the share keeps running.
          const offer = signal as WebRTCOffer
          const pc = peerConnectionsRef.current.get(offer.from)
          if (!pc) break
          enqueueSignaling(pc, async () => {
            if (pc.signalingState === "have-local-offer") {
              // Both sides renegotiated at once: roll our offer back so the
              // guest's renegotiation can still be answered.
              await pc.setLocalDescription({ type: "rollback" })
            }
            if (pc.signalingState !== "stable" && pc.signalingState !== "have-remote-offer") return
            await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: offer.sdp }))
            flushIceCandidates(pc)
            const answer = await pc.createAnswer()
            if (pc.signalingState !== "have-remote-offer") return
            await pc.setLocalDescription(answer)
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
          break
        }
        case "webrtc.answer": {
          const answer = signal as WebRTCAnswer
          const pc = peerConnectionsRef.current.get(answer.from)
          if (!pc) break
          enqueueSignaling(pc, async () => {
            // A duplicate or stale answer must be ignored: applying it to a
            // settled connection throws InvalidStateError.
            if (pc.signalingState !== "have-local-offer") return
            await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: answer.sdp }))
            flushIceCandidates(pc)
          })
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
    [addIceCandidateWhenReady, enqueueSignaling, flushIceCandidates, sendSignal]
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
      connectionState: "",
    })
  }, [guestState.remoteStream])

  // ------------------------------------------------------------------
  // Guest: apply the host's offer on a connection and answer it
  // ------------------------------------------------------------------
  const answerOffer = React.useCallback(
    (pc: RTCPeerConnection, sdp: string, hostId: string | null) => {
      enqueueSignaling(pc, async () => {
        try {
          // A newer offer replaced this connection while it was queued.
          if (pc.signalingState === "closed") return
          if (pc.signalingState === "have-local-offer") {
            await pc.setLocalDescription({ type: "rollback" })
          }
          if (pc.signalingState !== "stable" && pc.signalingState !== "have-remote-offer") return
          await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp }))
          flushIceCandidates(pc)
          const answer = await pc.createAnswer()
          if (pc.signalingState !== "have-remote-offer") return
          await pc.setLocalDescription(answer)
          const localDesc = pc.localDescription
          if (localDesc) {
            sendSignal({
              type: "webrtc.answer",
              roomId: "",
              from: "",
              to: hostId ?? "",
              sdp: localDesc.sdp,
            })
          }
        } catch (err) {
          setGuestState((prev) => ({
            ...prev,
            error: err instanceof Error ? err.message : "Failed to join screen share",
          }))
        }
      })
    },
    [enqueueSignaling, flushIceCandidates, sendSignal]
  )

  // ------------------------------------------------------------------
  // Guest: handle incoming signal from host
  // ------------------------------------------------------------------
  const handleGuestSignal = React.useCallback(
    (signal: WebRTCSignal) => {
      switch (signal.type) {
        case "webrtc.offer": {
          const offer = signal as WebRTCOffer
          // An offer also reaches guests who joined after the share began (or
          // whose "started" broadcast was missed), so mark the share active
          // from the offer itself — otherwise their player never mounts and
          // they sit on "Waiting for the host to start screen sharing".
          setGuestState((prev) => ({
            ...prev,
            isSharing: true,
            sharerId: prev.sharerId ?? offer.from ?? null,
          }))
          // A host renegotiation (late microphone, quality change, ICE
          // restart) arrives as another offer on the connection that is
          // already receiving, and must be answered there. A rebuilt
          // connection answering an established one gives both sides the same
          // DTLS role, which Chrome rejects with "Failed to set SSL role for
          // the transport" — and every later negotiation fails the same way.
          // Only a start of sharing (no connection yet, or a dead one) builds
          // a fresh connection.
          const live = reusableGuestPeer(guestPeerConnectionRef.current)
          if (live) {
            answerOffer(live, offer.sdp, offer.from ?? null)
            break
          }

          // No usable connection: drop the old one and its stream so the
          // fresh connection replaces it.
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

          pc.onsignalingstatechange = () => logPeer("guest:signaling", pc)
          pc.oniceconnectionstatechange = () => logPeer("guest:ice", pc)

          pc.onconnectionstatechange = () => {
            logPeer("guest:conn", pc)
            // Surface the live state so the guest's connection indicator
            // reflects reality instead of staying blank.
            setGuestState((prev) =>
              prev.connectionState === pc.connectionState
                ? prev
                : { ...prev, connectionState: pc.connectionState }
            )

            // A recovered connection clears any pending grace timer.
            if (pc.connectionState === "connected") {
              clearGrace(pc)
              return
            }

            // "disconnected" is transient: wait out a grace period, then try an
            // ICE restart (re-offer) before giving up. Only a hard "failed"
            // ends the share and blanks the player.
            if (pc.connectionState === "disconnected") {
              if (!graceTimersRef.current.has(pc)) {
                const timer = setTimeout(() => {
                  graceTimersRef.current.delete(pc)
                  if (
                    pc.connectionState === "disconnected" &&
                    guestPeerConnectionRef.current === pc
                  ) {
                    console.warn("[webrtc:guest] grace expired — attempting ICE restart")
                    try {
                      pc.restartIce()
                    } catch (err) {
                      console.error("restartIce failed:", err)
                    }
                    guestRenegotiate(pc, offer.from, true)
                  }
                }, 5000)
                graceTimersRef.current.set(pc, timer)
              }
              return
            }

            if (pc.connectionState === "failed") {
              clearGrace(pc)
              stopReceiving()
            }
          }

          guestPeerConnectionRef.current = pc

          answerOffer(pc, offer.sdp, offer.from ?? null)
          break
        }
        case "webrtc.ice-candidate": {
          const candidate = signal as WebRTCIceCandidate
          const pc = guestPeerConnectionRef.current
          if (pc && candidate.candidate) {
            // Queue candidates that beat the host's offer: adding one before
            // the remote description throws and the connection stalls.
            addIceCandidateWhenReady(pc, candidate.candidate)
          }
          break
        }
        case "webrtc.answer": {
          // The host's reply to a guest renegotiation (e.g. a late mic).
          const answer = signal as WebRTCAnswer
          const pc = guestPeerConnectionRef.current
          if (!pc) break
          enqueueSignaling(pc, async () => {
            // Ignore a duplicate or stale answer to a renegotiation that has
            // already settled.
            if (pc.signalingState !== "have-local-offer") return
            await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: answer.sdp }))
            flushIceCandidates(pc)
          })
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
    [
      addIceCandidateWhenReady,
      enqueueSignaling,
      flushIceCandidates,
      sendSignal,
      stopReceiving,
      guestRenegotiate,
      logPeer,
      clearGrace,
      answerOffer,
    ]
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
          enqueueSignaling(pc, async () => {
            pc.addTrack(micTrack, stream)
            // Only one negotiation may be in flight; the host answers it.
            if (pc.signalingState !== "stable") return
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            const localDesc = pc.localDescription
            if (localDesc) {
              sendSignal({
                type: "webrtc.offer",
                roomId: "",
                from: "",
                to: guestState.sharerId ?? "",
                sdp: localDesc.sdp,
              })
            }
          })
        }
      }
    } catch (err: any) {
      setGuestState((prev) => ({
        ...prev,
        error: err?.message ?? "Failed to access microphone",
      }))
    }
  }, [enqueueSignaling, sendSignal, guestState.sharerId])

  const stopGuestMic = React.useCallback(() => {
    const stream = guestMicRef.current
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      guestMicRef.current = null
    }
    setGuestMicState({ micStream: null, isMuted: false })
  }, [])

  const toggleGuestMic = React.useCallback(() => {
    // First press turns the microphone on; later presses mute/unmute it.
    const track = guestMicRef.current?.getAudioTracks()[0]
    if (!track) {
      void startGuestMic()
      return
    }
    // Derive the next state from the live track, not stored React state, so a
    // re-negotiation cannot leave this button inverted.
    track.enabled = !track.enabled
    setGuestMicState((prev) => ({ ...prev, isMuted: !track.enabled }))
  }, [startGuestMic])

  // ------------------------------------------------------------------
  // Active speaker detection
  // ------------------------------------------------------------------
  const remoteStream = guestState.remoteStream
  const sharerId = guestState.sharerId

  React.useEffect(() => {
    const track = remoteStream?.getAudioTracks()[0]
    if (!track) {
      setActiveSpeakerId(null)
      setAudioLevels((prev) => (prev.size === 0 ? prev : new Map()))
      return
    }

    const key = sharerId || "host"
    const monitor = createAudioLevelMonitor(track)
    audioMonitorRef.current.set(key, monitor)

    // Compare before storing so an idle loop does not re-render every frame.
    const levelsMatch = (a: Map<string, number>, b: Map<string, number>) => {
      if (a.size !== b.size) return false
      for (const [id, level] of b) {
        const previous = a.get(id)
        if (previous === undefined || Math.abs(previous - level) > 0.01) return false
      }
      return true
    }

    let frame = 0
    const updateLevels = () => {
      const levels = new Map<string, number>()
      audioMonitorRef.current.forEach((mon, uid) => {
        levels.set(uid, mon.getLevel())
      })
      setAudioLevels((prev) => (levelsMatch(prev, levels) ? prev : levels))

      let maxLevel = 0
      let maxUserId: string | null = null
      levels.forEach((level, uid) => {
        if (level > maxLevel && level > 0.1) {
          maxLevel = level
          maxUserId = uid
        }
      })
      setActiveSpeakerId((prev) => (prev === maxUserId ? prev : maxUserId))

      frame = requestAnimationFrame(updateLevels)
    }

    frame = requestAnimationFrame(updateLevels)

    return () => {
      cancelAnimationFrame(frame)
      monitor.destroy()
      audioMonitorRef.current.delete(key)
    }
  }, [remoteStream, sharerId])

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
    guestConnectionState: guestState.connectionState,
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
