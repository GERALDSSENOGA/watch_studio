"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useScreenShareGlobal } from "@/components/screen-share-context"
import { ScreenShareControls } from "@/components/screen-share-controls"

interface ScreenShareProps {
  roomId: string
  userId: string
  isHost: boolean
  send: (payload: unknown) => void
  /** Callback that receives the host/guest signal handler function.
   *  RoomView uses this to route incoming WebSocket webrtc.* messages. */
  onSignal: (handler: (signal: { type: string; [key: string]: unknown }) => void) => void
}

export interface ScreenShareHandle {
  /** Host-only: create a peer connection for a newly joined guest. */
  addPeer: (guestId: string, userId: string) => void
}

/** Browser detection for screen-share guidance. Firefox tab capture is
 * unreliable for video content (blank frames after the first second), so we
 * guide Firefox users toward native YouTube sync instead. */
const isFirefox = typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent)

/** Inline SVG icons to avoid adding dependencies. */
const VideoIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m-1-3.586L8.293 7.293a1 1 0 00-1.414 1.414L10.586 13H4a1 1 0 01-1-1V7a1 1 0 011-1h6.586l3.293-3.293a1 1 0 001.414-1.414z" />
  </svg>
)

const LiveIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18v6m0 0l6-6-6-6" />
  </svg>
)

const ScreenShareComponent = React.forwardRef<ScreenShareHandle, ScreenShareProps>(
  function ScreenShare({
    roomId,
    userId,
    isHost,
    send,
    onSignal,
  }, ref) {
    // Global context (persists across page navigation)
    const {
      isSharing,
      localStream,
      error,
      startShare,
      stopShare,
      toggleShare,
      handleHostSignal,
      addPeer,
      remoteStream,
      isSharingFromHost,
      sharerId,
      receiveError,
      stopReceiving,
      handleGuestSignal,
      connectionState: hostConnectionState,
      // Host mic
      hostMicStream,
      isHostMicMuted,
      startHostMic,
      stopHostMic,
      toggleHostMic,
      // Guest mic
      guestMicStream,
      isGuestMicMuted,
      startGuestMic,
      stopGuestMic,
      toggleGuestMic,
    } = useScreenShareGlobal()

    const videoRef = React.useRef<HTMLVideoElement | null>(null)
    const hostVideoRef = React.useRef<HTMLVideoElement | null>(null)

    const [isHostMuted, setIsHostMuted] = React.useState(false)
    const [isGuestMuted, setIsGuestMuted] = React.useState(false)
    const [hostVolume, setHostVolume] = React.useState(1)
    const [guestVolume, setGuestVolume] = React.useState(1)
    const [isHostFullscreen, setIsHostFullscreen] = React.useState(false)
    const [isGuestFullscreen, setIsGuestFullscreen] = React.useState(false)
    const [guestNeedsPlay, setGuestNeedsPlay] = React.useState(false)

    const [guestConnectionState, setGuestConnectionState] = React.useState<string>("")

    // Sync video elements to streams
    React.useEffect(() => {
      const el = videoRef.current
      if (!el) return
      if (!remoteStream) {
        el.srcObject = null
        return
      }
      if (el.srcObject !== remoteStream) el.srcObject = remoteStream
      // Apply guest volume to remote audio
      const audioTrack = remoteStream.getTracks().find((t) => t.kind === "audio")
      if (audioTrack) {
        audioTrack.enabled = !isGuestMuted
        // Note: MediaStreamTrack doesn't have volume; volume is on the HTMLMediaElement
        el.volume = guestVolume
      }
      // Start muted so autoplay is not blocked by browsers (especially when
      // the shared tab has audio), then unmute once play succeeds.
      el.muted = true
      el
        .play()
        .then(() => {
          el.muted = false
          setGuestNeedsPlay(false)
        })
        .catch(() => setGuestNeedsPlay(true))
    }, [remoteStream, isGuestMuted, guestVolume])

    React.useEffect(() => {
      const el = hostVideoRef.current
      if (el && localStream) {
        el.srcObject = localStream
        // Host controls volume at the track level (mute/unmute)
        const audioTrack = localStream.getTracks().find((t) => t.kind === "audio")
        if (audioTrack) {
          audioTrack.enabled = !isHostMuted
        }
        // The local preview stays muted: an unmuted stream is blocked by the
        // browser's autoplay policy, which left the host's own share area
        // blank. The host already hears the shared tab's audio directly.
        el.muted = true
        el.play().catch(() => {})
      } else if (el) {
        el.srcObject = null
      }
    }, [localStream, isHostMuted])

    // Handle fullscreen change events
    React.useEffect(() => {
      const handleFullscreenChange = () => {
        const el = document.fullscreenElement
        if (isHost) {
          setIsHostFullscreen(el === hostVideoRef.current)
        } else {
          setIsGuestFullscreen(el === videoRef.current)
        }
      }
      document.addEventListener("fullscreenchange", handleFullscreenChange)
      return () => {
        document.removeEventListener("fullscreenchange", handleFullscreenChange)
      }
    }, [isHost])

    const toggleMute = React.useCallback(() => {
      if (isHost) {
        const stream = localStream
        if (!stream) return
        const audioTrack = stream.getTracks().find((t) => t.kind === "audio")
        if (audioTrack) {
          const newEnabled = !audioTrack.enabled
          audioTrack.enabled = newEnabled
          setIsHostMuted(!newEnabled)
        }
      } else {
        const stream = remoteStream
        if (!stream) return
        const audioTrack = stream.getTracks().find((t) => t.kind === "audio")
        if (audioTrack) {
          const newEnabled = !audioTrack.enabled
          audioTrack.enabled = newEnabled
          setIsGuestMuted(!newEnabled)
        }
      }
    }, [isHost, localStream, remoteStream])

    const toggleFullscreen = React.useCallback(() => {
      if (isHost) {
        const el = hostVideoRef.current
        if (!el) return
        if (!document.fullscreenElement) {
          el.requestFullscreen().catch(() => {})
        } else {
          document.exitFullscreen()
        }
      } else {
        const el = videoRef.current
        if (!el) return
        if (!document.fullscreenElement) {
          el.requestFullscreen().catch(() => {})
        } else {
          document.exitFullscreen()
        }
      }
    }, [isHost])

    React.useImperativeHandle(ref, () => ({
      addPeer: (guestId: string, userId: string) => addPeer(guestId, userId),
    }))

    const handleIncomingSignal = React.useCallback(
      (signal: { type: string; [key: string]: unknown }) => {
        if (isHost) {
          handleHostSignal(signal as any)
        } else {
          handleGuestSignal(signal as any)
        }
      },
      [isHost, handleHostSignal, handleGuestSignal]
    )

    React.useEffect(() => {
      onSignal((signal) => handleIncomingSignal(signal))
    }, [onSignal, handleIncomingSignal])

    // ---------------- HOST VIEW ----------------
    if (isHost) {
      const stream = localStream
      const audioTrack =
        stream?.getTracks().find((t) => t.kind === "audio") ?? null
      const videoTrack =
        stream?.getTracks().find((t) => t.kind === "video") ?? null
      const hasAudio = !!audioTrack
      const isAudioEnabled = audioTrack?.enabled ?? true
      // Chrome captures a window's own page content but not the GPU layer a
      // playing video is drawn on, so a shared window arrives with a blank
      // video area. Tab capture includes it.
      const isWindowCapture =
        videoTrack?.getSettings().displaySurface === "window"

      return (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Badge variant="default" size="sm">
              Screen Share (Host)
            </Badge>
            {error && (
              <Badge variant="danger" size="sm">{error}</Badge>
            )}
          </div>

          {isSharing && stream && isWindowCapture && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              <p className="text-xs text-amber-200">
                You shared a window — video playing inside it arrives blank. Share the
                Chrome Tab instead.
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  stopShare()
                  void startShare()
                }}
              >
                Share a tab
              </Button>
            </div>
          )}

          {isSharing && stream ? (
            <div className="relative overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/10">
              <div className="relative aspect-video w-full">
                <video
                  ref={hostVideoRef}
                  autoPlay
                  playsInline
                  className="h-full w-full object-contain"
                />
                {/* Stage chrome — live chip, Zoom-style */}
                <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
                  <span className="flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white ring-1 ring-white/15 backdrop-blur-sm">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                    You are sharing
                  </span>
                </div>
                <ScreenShareControls
                  stream={stream}
                  isMuted={!isAudioEnabled}
                  volume={hostVolume}
                  onToggleMute={toggleMute}
                  onVolumeChange={setHostVolume}
                  onToggleFullscreen={toggleFullscreen}
                  onStop={stopShare}
                  isFullscreen={isHostFullscreen}
                  hasAudio={hasAudio}
                  connectionState={hostConnectionState}
                  hasMic={!!hostMicStream}
                  isMicMuted={isHostMicMuted}
                  onToggleMic={toggleHostMic}
                />
              </div>
            </div>
          ) : (
            <Card className="relative overflow-hidden">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground">
                  Start screen sharing
                </CardTitle>
              </CardHeader>
              <CardContent className="min-h-[300px] flex flex-col items-center justify-center bg-black rounded-lg p-4">
                <div className="flex flex-col items-center gap-3">
                  <VideoIcon className="w-8 h-8 text-muted-foreground" />
                  {isFirefox ? (
                    <>
                      <p className="text-xs text-amber-200 text-center max-w-xs font-medium">
                        Firefox tab capture may not render video
                      </p>
                      <p className="text-xs text-muted-foreground text-center max-w-xs">
                        For reliable screen sharing on Firefox, use Chrome instead.
                        If you must share on Firefox, pick <strong>Tab</strong> (not
                        Window/Screen) in the picker and know that video may go
                        blank for viewers.
                      </p>
                      <p className="text-xs text-muted-foreground text-center max-w-xs">
                        Better: paste a YouTube link in your library and use
                        native synchronized playback.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Click &ldquo;Share Screen&rdquo; to broadcast your screen
                        to the room.
                      </p>
                      <p className="text-xs text-muted-foreground max-w-xs text-center">
                        Pick the individual <strong>Tab</strong> playing your
                        video — not &ldquo;Window&rdquo; or &ldquo;Screen.&rdquo;
                        Tab capture includes video players; window capture does
                        not.
                      </p>
                    </>
                  )}
                </div>
              </CardContent>
              <div className="flex gap-2 pt-2 pb-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={startShare}
                  disabled={isSharing}
                  className="w-full"
                >
                  {isSharing ? "Sharing…" : "Share Screen"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={startHostMic}
                  disabled={isSharing && !hostMicStream}
                  className="w-full"
                >
                  {hostMicStream ? "Stop Mic" : "Start Mic"}
                </Button>
              </div>
            </Card>
          )}
        </div>
      )
    }

    // ---------------- GUEST VIEW ----------------
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Badge variant="default" size="sm">
            Screen Share
          </Badge>
          {receiveError && (
            <Badge variant="danger" size="sm">{receiveError}</Badge>
          )}
        </div>

        {sharerId ? (
          <Card className="bg-black relative overflow-hidden">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground">
                {sharerId === userId ? "Your screen" : "Host's screen"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 min-h-[300px] relative">
              <div className="relative w-full h-full bg-black">
                {remoteStream ? (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    <ScreenShareControls
                      stream={remoteStream}
                      isMuted={!isGuestMuted}
                      volume={guestVolume}
                      onToggleMute={toggleMute}
                      onVolumeChange={setGuestVolume}
                      onToggleFullscreen={toggleFullscreen}
                      onStop={stopReceiving}
                      isFullscreen={isGuestFullscreen}
                      hasAudio={!!remoteStream.getTracks().find((t) => t.kind === "audio")}
                      connectionState={guestConnectionState}
                      hasMic={!!guestMicStream}
                      isMicMuted={isGuestMicMuted}
                      onToggleMic={toggleGuestMic}
                    />
                    {guestNeedsPlay && (
                      <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            videoRef.current
                              ?.play()
                              .then(() => setGuestNeedsPlay(false))
                              .catch(() => {})
                          }}
                        >
                          Click to play shared screen
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="aspect-video bg-black rounded-lg flex items-center justify-center min-h-[200px]">
                    <div className="flex flex-col items-center gap-2">
                      <Spinner size={32} className="text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        Connecting to host&apos;s screen…
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
            {!remoteStream && sharerId && (
              <div className="flex gap-2 pt-2 pb-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={stopReceiving}
                  className="flex-1"
                >
                  Leave Screen Share
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={toggleGuestMic}
                  className="flex-1"
                >
                  {isGuestMicMuted ? "Unmute Mic" : "Mute Mic"}
                </Button>
              </div>
            )}
          </Card>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <LiveIcon className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
            <p>Waiting for the host to start screen sharing…</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={startGuestMic}
              className="mt-2"
            >
              {guestMicStream ? "Stop Mic" : "Start Mic"}
            </Button>
          </div>
        )}
      </div>
    )
  }
)

export default ScreenShareComponent
