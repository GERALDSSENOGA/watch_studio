"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { classNames } from "@/lib/utils"

interface IconProps {
  className?: string
}

/** Shared wrapper so every glyph in the control bar shares one stroke weight. */
function Icon({
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

const MicIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
    <path d="M12 17.5V21M8.5 21h7" />
  </Icon>
)

const MicOffIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 9.7 5.7" />
    <path d="M12 17.5V21M8.5 21h7" />
    <path d="M3.5 3.5l17 17" />
  </Icon>
)

const VolumeIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M11 5.5 7 8.75H3.5v6.5H7L11 18.5z" />
    <path d="M15 9.5a3.5 3.5 0 0 1 0 5" />
    <path d="M17.75 7a7.5 7.5 0 0 1 0 10" />
  </Icon>
)

const VolumeOffIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M11 5.5 7 8.75H3.5v6.5H7L11 18.5z" />
    <path d="M15.5 10l4 4M19.5 10l-4 4" />
  </Icon>
)

const MaximizeIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M9 3.5H5.5a2 2 0 0 0-2 2V9" />
    <path d="M15 3.5h3.5a2 2 0 0 1 2 2V9" />
    <path d="M20.5 15v3.5a2 2 0 0 1-2 2H15" />
    <path d="M9 20.5H5.5a2 2 0 0 1-2-2V15" />
  </Icon>
)

const MinimizeIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M9 3.5V7a2 2 0 0 1-2 2H3.5" />
    <path d="M15 3.5V7a2 2 0 0 0 2 2h3.5" />
    <path d="M20.5 15H17a2 2 0 0 0-2 2v3.5" />
    <path d="M9 20.5V17a2 2 0 0 0-2-2H3.5" />
  </Icon>
)

const StopIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
  </svg>
)

export interface ScreenShareControlsProps {
  stream: MediaStream | null
  isMuted: boolean
  volume: number
  onToggleMute: () => void
  onVolumeChange: (v: number) => void
  onToggleFullscreen: () => void
  onStop: () => void
  isFullscreen: boolean
  hasAudio: boolean
  /** Hide the volume group where it cannot affect anything (host hears the
   *  shared tab directly, its preview stays muted). Defaults to true. */
  showVolume?: boolean
  connectionState: string
  // Microphone
  hasMic: boolean
  isMicMuted: boolean
  onToggleMic: () => void
}

export function ScreenShareControls({
  stream,
  isMuted,
  volume,
  onToggleMute,
  onVolumeChange,
  onToggleFullscreen,
  onStop,
  isFullscreen,
  hasAudio,
  showVolume = true,
  connectionState,
  // Microphone
  hasMic,
  isMicMuted,
  onToggleMic,
}: ScreenShareControlsProps) {
  const audioTrack = stream?.getTracks().find((t) => t.kind === "audio") ?? null
  const isAudioEnabled = audioTrack?.enabled ?? true
  const isAudioConnected = connectionState === "connected" || connectionState === ""
  // Show the microphone as "off" until one is actually captured, so the button
  // does not look live before the first press (hasMic=false, isMicMuted=false).
  const micOff = !hasMic || isMicMuted

  /** One shape for every round control, plus a filled state when it is muted. */
  const controlClass = (muted: boolean) =>
    classNames(
      "h-10 w-10 shrink-0 rounded-full border-transparent bg-transparent p-0 transition-colors",
      muted
        ? "bg-amber-400/15 text-amber-300 hover:bg-amber-400/25 hover:text-amber-200"
        : "text-white/90 hover:bg-white/15 hover:text-white"
    )

  const icon = "h-[18px] w-[18px]"

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end gap-2 pb-4">
      {/* Scrim so the controls stay legible over bright video */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      {/* Audio muted persistent indicator */}
      {!isAudioEnabled && stream && (
        <div className="relative flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-black/80 px-3 py-1 text-[11px] font-medium text-amber-200 backdrop-blur-md">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <span>Audio is muted</span>
        </div>
      )}

      {/* Connection state indicator */}
      {connectionState && connectionState !== "connected" && (
        <div className="relative flex items-center gap-1.5 rounded-full border border-red-500/50 bg-red-950/90 px-3 py-1 text-[11px] font-medium text-red-100 backdrop-blur-md">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
          <span>Connection: {connectionState}</span>
        </div>
      )}

      {/* Floating control pill — always on top of the stage, Zoom-style */}
      {/* pointer-events-auto: the overlay above the video is click-through, so
          without this the <video> underneath swallows every click and none of
          these buttons respond. */}
      <div className="pointer-events-auto relative flex items-center gap-0.5 rounded-full border border-white/10 bg-neutral-950/85 p-1.5 shadow-[0_12px_40px_-10px_rgba(0,0,0,0.95)] backdrop-blur-xl">
        {/* Mute/Unmute audio */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggleMute}
          disabled={!stream || !hasAudio}
          className={controlClass(isMuted)}
          aria-label={isMuted ? "Unmute audio" : "Mute audio"}
          title={
            !hasAudio
              ? "No audio track captured"
              : isMuted
                ? "Unmute shared audio"
                : "Mute shared audio"
          }
        >
          {isMuted ? (
            <VolumeOffIcon className={icon} />
          ) : (
            <VolumeIcon className={icon} />
          )}
        </Button>

        {/* Volume slider — only where playback volume is ours to control */}
        {hasAudio && showVolume && (
          <div className="mx-0.5 flex h-10 items-center gap-2.5 rounded-full bg-white/5 pl-3 pr-3.5 ring-1 ring-inset ring-white/10">
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              disabled={isMuted || !isAudioConnected}
              aria-label="Shared audio volume"
              className="share-volume w-20 cursor-pointer"
            />
            <span
              className={classNames(
                "w-9 text-right text-[11px] font-medium tabular-nums",
                isMuted ? "text-amber-300" : "text-white/45"
              )}
            >
              {isMuted ? "Muted" : `${Math.round(volume * 100)}%`}
            </span>
          </div>
        )}

        {/* Mute/Unmute microphone */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggleMic}
          className={controlClass(micOff)}
          aria-label={!hasMic ? "Start microphone" : isMicMuted ? "Unmute microphone" : "Mute microphone"}
          title={!hasMic ? "Start microphone" : isMicMuted ? "Unmute microphone" : "Mute microphone"}
        >
          {micOff ? (
            <MicOffIcon className={icon} />
          ) : (
            <MicIcon className={icon} />
          )}
        </Button>

        <span className="mx-1 h-6 w-px bg-white/15" />

        {/* Fullscreen/Exit */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggleFullscreen}
          className={controlClass(false)}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? (
            <MinimizeIcon className={icon} />
          ) : (
            <MaximizeIcon className={icon} />
          )}
        </Button>

        {/* Stop Sharing */}
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={onStop}
          className="ml-1 h-10 gap-2 rounded-full border-transparent bg-red-500 px-4 text-xs font-semibold text-white shadow-lg shadow-red-500/25 hover:bg-red-600"
          aria-label="Stop sharing"
          title="Stop sharing"
        >
          <StopIcon className="h-3.5 w-3.5" />
          Stop
        </Button>
      </div>
    </div>
  )
}
