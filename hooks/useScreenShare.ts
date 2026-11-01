"use client"

import * as React from "react"
import {
  ScreenShareState,
  WebRTCSignal,
  WebRTCOffer,
  WebRTCAnswer,
  WebRTCIceCandidate,
  WebRTCScreenShareStatus,
} from "@/lib/webrtc/types"

interface UseScreenShareProps {
  roomId: string
  userId: string
  isHost: boolean
  send: (payload: unknown) => void
}

interface UseScreenShareReturn extends ScreenShareState {
  startShare: () => Promise<void>
  stopShare: () => void
  toggleShare: () => Promise<void>
  /** Host-only: handle incoming WebRTC signal from a guest (answer/ICE). */
  handleSignal: (signal: WebRTCSignal) => void
  /** Host-only: create a peer connection for a newly joined guest. */
  addPeer: (guestId: string) => void
}

/**
 * Host-side screen sharing.
 *
 * - Captures the host's screen via getDisplayMedia()
 * - Creates one RTCPeerConnection per guest in the room
 * - Sends offers via WebSocket signaling
 * - Relays ICE candidates between host and each guest
 *
 * Guests join by answering the offer and exchanging ICE candidates.
 */
export function useScreenShare({
  roomId,
  userId,
  isHost,
  send,
}: UseScreenShareProps): UseScreenShareReturn {
  const [state, setState] = React.useState<ScreenShareState>({
    isSharing: false,
    localStream: null,
    error: null,
    peerCount: 0,
  })

  const peerConnectionsRef = React.useRef<Map<string, RTCPeerConnection>>(
    new Map()
  )
  const localStreamRef = React.useRef<MediaStream | null>(null)

  const iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ]

  const getConfiguration = (): RTCConfiguration => ({
    iceServers,
    iceCandidatePoolSize: 10,
  })

  const closeAllPeers = React.useCallback(() => {
    for (const [, pc] of peerConnectionsRef.current) {
      pc.close()
    }
    peerConnectionsRef.current.clear()
    setState((prev) => ({ ...prev, peerCount: 0 }))
  }, [])

  const stopShare = React.useCallback(() => {
    closeAllPeers()
    const stream = localStreamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
    }
    setState({
      isSharing: false,
      localStream: null,
      error: null,
      peerCount: 0,
    })
    send({
      type: "webrtc.screen-share.stopped",
      roomId,
      from: userId,
    })
  }, [closeAllPeers, roomId, userId, send])

  const startShare = React.useCallback(async () => {
    if (!isHost) return
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      })
      localStreamRef.current = stream
      setState((prev) => ({ ...prev, isSharing: true, localStream: stream, error: null }))

      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        // User stopped sharing via browser UI
        stopShare()
      })

      send({
        type: "webrtc.screen-share.started",
        roomId,
        from: userId,
        streamId: stream.id,
      })
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        error: err?.message ?? "Failed to start screen sharing",
      }))
    }
  }, [isHost, roomId, userId, send, stopShare])

  const toggleShare = React.useCallback(async () => {
    if (state.isSharing) stopShare()
    else await startShare()
  }, [state.isSharing, startShare, stopShare])

  // Handle incoming WebRTC signals from guests (answers + ICE candidates)
  React.useEffect(() => {
    // This hook is host-side; the socket handler in RoomView routes
    // webrtc.answer and webrtc.ice-candidate messages here via a ref.
    return () => {}
  }, [])

  // Expose a method for RoomView to inject incoming signals
  const handleSignal = React.useCallback(
    (signal: WebRTCSignal) => {
      if (!isHost) return

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
    [isHost]
  )

  // Create peer connection for a new guest
  const createPeerForGuest = React.useCallback(
    (guestId: string) => {
      if (!isHost || !localStreamRef.current) return

      const pc = new RTCPeerConnection(getConfiguration())

      // Add local stream tracks
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current!)
      }

      // Handle ICE candidates → send to guest
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const msg: WebRTCIceCandidate = {
            type: "webrtc.ice-candidate",
            roomId,
            from: userId,
            to: guestId,
            candidate: event.candidate.toJSON(),
          }
          send(msg)
        }
      }

      // Track connection state
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          pc.close()
          peerConnectionsRef.current.delete(guestId)
          setState((prev) => ({ ...prev, peerCount: peerConnectionsRef.current.size }))
        }
      }

      peerConnectionsRef.current.set(guestId, pc)
      setState((prev) => ({ ...prev, peerCount: peerConnectionsRef.current.size }))

      // Create and send offer
      pc.createOffer().then((offer) => {
        return pc.setLocalDescription(offer)
      }).then(() => {
        const localDesc = pc.localDescription
        if (localDesc) {
          const msg: WebRTCOffer = {
            type: "webrtc.offer",
            roomId,
            from: userId,
            to: guestId,
            sdp: localDesc.sdp,
          }
          send(msg)
        }
      }).catch((err) => {
        console.error("Failed to create offer:", err)
      })
    },
    [isHost, roomId, userId, send]
  )

  // Expose peer creation for RoomView to call when guests join
  const addPeer = React.useCallback((guestId: string) => {
    createPeerForGuest(guestId)
  }, [createPeerForGuest])

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      stopShare()
    }
  }, [stopShare])

  return {
    ...state,
    startShare,
    stopShare,
    toggleShare,
    addPeer,
    handleSignal,
  }
}
