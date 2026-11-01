"use client"

import * as React from "react"
import {
  WebRTCSignal,
  WebRTCOffer,
  WebRTCAnswer,
  WebRTCIceCandidate,
} from "@/lib/webrtc/types"
import { mergeRemoteTrack } from "@/lib/webrtc/remote-stream"

interface ScreenShareContextValue {
  // Host state
  isSharing: boolean
  localStream: MediaStream | null
  error: string | null
  peerCount: number
  startShare: () => Promise<void>
  stopShare: () => void
  toggleShare: () => Promise<void>
  handleHostSignal: (signal: WebRTCSignal) => void
  addPeer: (guestId: string, userId: string) => void

  // Guest state
  remoteStream: MediaStream | null
  isSharingFromHost: boolean
  sharerId: string | null
  receiveError: string | null
  stopReceiving: () => void
  handleGuestSignal: (signal: WebRTCSignal) => void

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
  }>({
    isSharing: false,
    localStream: null,
    error: null,
    peerCount: 0,
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

  const peerConnectionsRef = React.useRef<Map<string, RTCPeerConnection>>(new Map())
  const guestPeerConnectionRef = React.useRef<RTCPeerConnection | null>(null)
  const localStreamRef = React.useRef<MediaStream | null>(null)
  const remoteStreamRef = React.useRef<MediaStream | null>(null)

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
        audio: true,
      })
      localStreamRef.current = stream
      setHostState((prev) => ({ ...prev, isSharing: true, localStream: stream, error: null }))

      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        stopShare()
      })
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
  // Host: create peer connection for a new guest
  // ------------------------------------------------------------------
  const createPeerForGuest = React.useCallback(
    (guestId: string, userId: string) => {
      if (!localStreamRef.current) return

      const pc = new RTCPeerConnection(getConfiguration())

      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current!)
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
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          pc.close()
          peerConnectionsRef.current.delete(guestId)
          setHostState((prev) => ({ ...prev, peerCount: peerConnectionsRef.current.size }))
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
            pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: answer.sdp })).catch((err) => {
              console.error("Failed to set remote answer:", err)
            })
          }
          break
        }
        case "webrtc.ice-candidate": {
          const candidate = signal as WebRTCIceCandidate
          const pc = peerConnectionsRef.current.get(candidate.from)
          if (pc && candidate.candidate) {
            pc.addIceCandidate(new RTCIceCandidate(candidate.candidate)).catch((err) => {
              console.error("Failed to add ICE candidate:", err)
            })
          }
          break
        }
      }
    },
    []
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
    remoteStreamRef.current = null
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
            .then(() => pc.createAnswer())
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
    [sendSignal, stopReceiving]
  )

  const value: ScreenShareContextValue = {
    // Host
    isSharing: hostState.isSharing,
    localStream: hostState.localStream,
    error: hostState.error,
    peerCount: hostState.peerCount,
    startShare,
    stopShare,
    toggleShare,
    handleHostSignal,
    addPeer,
    // Guest
    remoteStream: guestState.remoteStream,
    isSharingFromHost: guestState.isSharing,
    sharerId: guestState.sharerId,
    receiveError: guestState.error,
    stopReceiving,
    handleGuestSignal,
    setSendSignal,
  }

  return (
    <ScreenShareContext.Provider value={value}>
      {children}
    </ScreenShareContext.Provider>
  )
}
