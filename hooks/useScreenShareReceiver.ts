"use client"

import * as React from "react"
import {
  ScreenShareReceiveState,
  WebRTCSignal,
  WebRTCOffer,
  WebRTCAnswer,
  WebRTCIceCandidate,
} from "@/lib/webrtc/types"

interface UseScreenShareReceiverProps {
  roomId: string
  userId: string
  isHost: boolean
  send: (payload: unknown) => void
}

interface UseScreenShareReceiverReturn extends ScreenShareReceiveState {
  startReceiving: () => void
  stopReceiving: () => void
  handleSignal: (signal: WebRTCSignal) => void
}

/**
 * Guest-side screen share receiver.
 *
 * - Receives offer from host → creates peer connection → sends answer
 * - Exchanges ICE candidates with host
 * - Renders remote stream in a video element
 */
export function useScreenShareReceiver({
  roomId,
  userId,
  isHost,
  send,
}: UseScreenShareReceiverProps): UseScreenShareReceiverReturn {
  const [state, setState] = React.useState<ScreenShareReceiveState>({
    remoteStream: null,
    isSharing: false,
    sharerId: null,
    error: null,
  })

  const peerConnectionRef = React.useRef<RTCPeerConnection | null>(null)

  const iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ]

  const stopReceiving = React.useCallback(() => {
    const pc = peerConnectionRef.current
    if (pc) {
      pc.close()
      peerConnectionRef.current = null
    }
    const stream = state.remoteStream
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
    }
    setState({
      remoteStream: null,
      isSharing: false,
      sharerId: null,
      error: null,
    })
  }, [state.remoteStream])

  const startReceiving = React.useCallback(() => {
    // Called when we receive a webrtc.screen-share.started message
    // The actual offer handling happens in handleSignal
  }, [])

  const handleSignal = React.useCallback(
    (signal: WebRTCSignal) => {
      if (isHost) return

      switch (signal.type) {
        case "webrtc.offer": {
          const offer = signal as WebRTCOffer
          const pc = new RTCPeerConnection({
            iceServers,
            iceCandidatePoolSize: 10,
          })

          pc.ontrack = (event) => {
            if (event.track.kind === "video") {
              let stream = state.remoteStream
              if (!stream) {
                stream = new MediaStream()
                setState((prev) => ({ ...prev, remoteStream: stream }))
              }
              stream.addTrack(event.track)
            }
          }

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              const msg: WebRTCIceCandidate = {
                type: "webrtc.ice-candidate",
                roomId,
                from: userId,
                to: offer.from,
                candidate: event.candidate.toJSON(),
              }
              send(msg)
            }
          }

          pc.onconnectionstatechange = () => {
            if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
              stopReceiving()
            }
          }

          peerConnectionRef.current = pc

          pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: offer.sdp }))
            .then(() => pc.createAnswer())
            .then((answer) => pc.setLocalDescription(answer))
            .then(() => {
              const localDesc = pc.localDescription
              if (localDesc) {
                const msg: WebRTCAnswer = {
                  type: "webrtc.answer",
                  roomId,
                  from: userId,
                  to: offer.from,
                  sdp: localDesc.sdp,
                }
                send(msg)
              }
            })
            .catch((err) => {
              console.error("Failed to handle offer:", err)
              setState((prev) => ({ ...prev, error: err?.message ?? "Failed to join screen share" }))
            })
          break
        }
        case "webrtc.ice-candidate": {
          const candidate = signal as WebRTCIceCandidate
          const pc = peerConnectionRef.current
          if (pc && candidate.candidate) {
            pc.addIceCandidate(new RTCIceCandidate(candidate.candidate)).catch((err) => {
              console.error("Failed to add ICE candidate:", err)
            })
          }
          break
        }
        case "webrtc.screen-share.started": {
          setState((prev) => ({
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
    [isHost, roomId, userId, send, state.remoteStream, stopReceiving]
  )

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      stopReceiving()
    }
  }, [stopReceiving])

  return {
    ...state,
    startReceiving,
    stopReceiving,
    handleSignal,
  }
}
