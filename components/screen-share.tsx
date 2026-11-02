"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useScreenShareGlobal } from "@/components/screen-share-context"
import { Input } from "@/components/ui/input"

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

/** Inline SVG icons to avoid adding dependencies. */
const MicIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 10v2a7 7 0 01-14 0v-2" />
  </svg>
)

const MicOffIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a5 5 0 0110 0v.293a3 3 0 01-.172 1.347l1.414 1.414A3 3 0 0115.414 11H13a3 3 0 01-3-3z" />
  </svg>
)

const MaximizeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m-4 4V12m-4 4l4-4m4 4V8m0 0l4-4m4 4l4-4" />
  </svg>
)

const MinimizeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2-2m0 0l-2-2m2 2l-2 2M4 8v8m0 0l4-4m4 4l4-4M16 4l4 4m0 0l-4 4m4-4v8m0 0l-4 4" />
  </svg>
)

const StopCircleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12A4 4 0 100 12a4 4 0 0020 0zM8 12h.01M16 12h.01" />
  </svg>
)

const Volume2Icon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.8m8.485-11.314a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.8m2.828-9.9a5 5 0 010 7.072" />
  </svg>
)

const VolumeOffIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
  </svg>
)

const VideoIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m-1-3.586L8.293 7.293a1 1 0 00-1.414 1.414L10.586 13H4a1 1 0 01-1-1V7a1 1 0 011-1h6.586l3.293-3.293a1 1 0 001.414-1.414z" />
  </svg>
)

const VideoOffIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m-1-3.586L8.293 7.293a1 1 0 00-1.414 1.414L10.586 13H4a1 1 0 01-1-1V7a1 1 0 011-1h6.586l3.293-3.293a1 1 0 001.414-1.414z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const LiveIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18v6m0 0l6-6-6-6" />
  </svg>
)

interface ScreenShareControlsProps {
  stream: MediaStream | null
  isMuted: boolean
  volume: number
  onToggleMute: () => void
  onVolumeChange: (v: number) => void
  onToggleFullscreen: () => void
  onStop: () => void
  isFullscreen: boolean
  hasAudio: boolean
  connectionState: string
}

function ScreenShareControls({
  stream,
  isMuted,
  volume,
  onToggleMute,
  onVolumeChange,
  onToggleFullscreen,
  onStop,
  isFullscreen,
  hasAudio,
  connectionState,
}: ScreenShareControlsProps) {
  const audioTrack =
    stream?.getTracks().find((t) => t.kind === "audio") ?? null
  const videoTrack =
    stream?.getTracks().find((t) => t.kind === "video") ?? null
  const isAudioEnabled = audioTrack?.enabled ?? true
  const isAudioConnected = connectionState === "connected" || connectionState === ""

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Video area - controls overlay on hover */}
      <div className="relative w-full h-full group">
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-3 pointer-events-none">
          {/* Top row: status badges */}
          <div className="flex justify-between items-start w-full pointer-events-auto gap-2">
            <Badge
              variant="default"
              size="sm"
              className="bg-black/70 backdrop-blur-sm border border-white/20"
            >
              {isMuted ? "Audio muted" : "Audio on"}
            </Badge>
            <Badge
              variant={hasAudio ? "success" : "default"}
              size="sm"
              className="bg-black/70 backdrop-blur-sm border border-white/20"
            >
              {hasAudio ? "Audio track" : "No audio"}
            </Badge>
            <Badge
              variant={isFullscreen ? "success" : "default"}
              size="sm"
              className="bg-black/70 backdrop-blur-sm border border-white/20"
            >
              {isFullscreen ? "Fullscreen" : "Windowed"}
            </Badge>
          </div>

          {/* Bottom row: control buttons */}
          <div className="flex items-center justify-between w-full pointer-events-auto mt-3">
            {/* Mute/Unmute */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleMute}
              disabled={!stream || !hasAudio}
              className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 hover:bg-white/10 text-white/90 hover:text-white transition-all"
              aria-label={isMuted ? "Unmute audio" : "Mute audio"}
              title={!hasAudio ? "No audio track captured" : undefined}
            >
              {isMuted ? (
                <MicOffIcon className="w-5 h-5" />
              ) : (
                <MicIcon className="w-5 h-5" />
              )}
            </Button>

            {/* Volume slider (guests only - host mutes at source) */}
            {hasAudio && (
              <div className="flex items-center gap-2 w-32">
                <VolumeOffIcon className="w-3 h-3 text-white/60" />
                <Input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={(e) => onVolumeChange(Number(e.target.value))}
                  className="w-full h-1 bg-white/20 rounded-lg accent-accent cursor-pointer"
                  disabled={isMuted || !isAudioConnected}
                />
                <Volume2Icon className="w-3 h-3 text-white/60" />
              </div>
            )}

            {/* Fullscreen/Exit */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleFullscreen}
              className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 hover:bg-white/10 text-white/90 hover:text-white transition-all"
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? (
                <MinimizeIcon className="w-5 h-5" />
              ) : (
                <MaximizeIcon className="w-5 h-5" />
              )}
            </Button>

            {/* Stop Sharing */}
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={onStop}
              className="w-10 h-10 rounded-full bg-red-500/90 border-red-500 hover:bg-red-500 text-white transition-all"
              aria-label="Stop sharing"
            >
              <StopCircleIcon className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Audio muted persistent indicator */}
      {!isAudioEnabled && stream && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1.5 bg-black/80 backdrop-blur-sm border border-white/20 rounded-full text-xs text-white/90">
          <MicOffIcon className="w-3 h-3 text-amber-400" />
          <span>Audio is muted</span>
        </div>
      )}

      {/* Connection state indicator */}
      {connectionState && connectionState !== "connected" && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1.5 bg-red-900/90 backdrop-blur-sm border border-red-500 rounded-full text-xs text-red-100">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          <span>Connection: {connectionState}</span>
        </div>
      )}
    </div>
  )
}

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
            {isSharing && (
              <Badge variant="success" size="sm" className="animate-pulse">
                <LiveIcon className="w-3 h-3 mr-1" /> Live
              </Badge>
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
            <Card className="bg-black relative overflow-hidden">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground">
                  Sharing your screen · {stream.getVideoTracks().length} video track(s) · {hasAudio ? "audio on" : "no audio"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 min-h-[300px] relative">
                <div className="relative w-full h-full bg-black">
                  <video
                    ref={hostVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
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
                  />
                </div>
              </CardContent>
              <div className="flex gap-2 pt-2 pb-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={toggleMute}
                  disabled={!stream || !hasAudio}
                  className="flex-1"
                >
                  {!isAudioEnabled ? (
                    <>
                      <MicOffIcon className="w-4 h-4 mr-2" />
                      Unmute
                    </>
                  ) : (
                    <>
                      <MicIcon className="w-4 h-4 mr-2" />
                      Mute
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={toggleFullscreen}
                  className="flex-1"
                >
                  {isHostFullscreen ? (
                    <>
                      <MinimizeIcon className="w-4 h-4 mr-2" />
                      Exit fullscreen
                    </>
                  ) : (
                    <>
                      <MaximizeIcon className="w-4 h-4 mr-2" />
                      Fullscreen
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={stopShare}
                  className="flex-1"
                >
                  <StopCircleIcon className="w-4 h-4 mr-2" />
                  Stop sharing
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="relative overflow-hidden">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground">
                  Start screen sharing
                </CardTitle>
              </CardHeader>
              <CardContent className="min-h-[300px] flex items-center justify-center bg-black rounded-lg">
                <div className="flex flex-col items-center gap-2">
                  <VideoIcon className="w-8 h-8 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Click &ldquo;Share Screen&rdquo; to broadcast your screen to the room.
                  </p>
                  <p className="text-xs text-muted-foreground max-w-xs text-center">
                    Pick the <strong>Chrome Tab</strong> source. Sharing a whole window can leave a
                    playing video blank, because Chrome does not capture its GPU video layer.
                  </p>
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
              </div>
            )}
          </Card>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <LiveIcon className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
            <p>Waiting for the host to start screen sharing…</p>
          </div>
        )}
      </div>
    )
  }
)

export default ScreenShareComponent
