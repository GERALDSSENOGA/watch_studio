"use client"

import * as React from "react"
import { Spinner } from "@/components/ui/spinner"

/**
 * YouTube IFrame Player API adapter.
 *
 * Declared capabilities (see lib/providers): embedSupported, officialApi,
 * commandsSupported, positionReadable, syncSupported. The adapter honestly
 * reports load failures (e.g. non-embeddable videos) so the room can fall
 * back to Mode B instead of pretending playback works.
 */

interface YouTubePlayerProps {
  videoId: string
  onReady?: () => void
  onStateChange?: (state: YT.PlayerState) => void
  onError?: (code: number) => void
  onPlaybackRateChange?: (rate: number) => void
  className?: string
  /** Receives the live player controls once created, so a parent can apply
   *  server-authoritative playback state to the real player. */
  controlsRef?: React.MutableRefObject<YouTubeControls | null>
  /** When content filtering is enabled, auto-seek past these segments
   *  during playback (e.g. to cut mature scenes from a YouTube video). */
  skipSegments?: Array<{ startMs: number; endMs: number; reason: string }>
  contentFilterEnabled?: boolean
  /** Callback fired when the player auto-skips a segment. */
  onSkipSegment?: (reason: string) => void
}

/** Control surface exposed to the parent (RoomPlayer). */
export interface YouTubeControls {
  play: () => void
  pause: () => void
  seek: (seconds: number) => void
  getState: () => YT.PlayerState | null
  getCurrentTime: () => number
  getPlaybackRate: () => number
}

export function YouTubePlayer({
  videoId,
  onReady,
  onStateChange,
  onError,
  onPlaybackRateChange,
  className,
  controlsRef,
  skipSegments = [],
  contentFilterEnabled = false,
  onSkipSegment,
}: YouTubePlayerProps) {
  const playerRef = React.useRef<YT.Player | null>(null)
  const [isReady, setIsReady] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const callbacks = React.useRef({ onReady, onStateChange, onError, onPlaybackRateChange })

  React.useEffect(() => {
    callbacks.current = { onReady, onStateChange, onError, onPlaybackRateChange }
  }, [onReady, onStateChange, onError, onPlaybackRateChange])

  const controls = React.useMemo<YouTubeControls>(
    () => ({
      play: () => playerRef.current?.playVideo(),
      pause: () => playerRef.current?.pauseVideo(),
      seek: (seconds: number) => playerRef.current?.seekTo(seconds, true),
      getState: () => playerRef.current?.getPlayerState() ?? null,
      getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
      getPlaybackRate: () => (playerRef.current as any)?.getPlaybackRate?.() ?? 1,
    }),
    []
  )

  React.useEffect(() => {
    if (!controlsRef) return
    controlsRef.current = controls
    return () => {
      controlsRef.current = null
    }
  }, [controlsRef, controls])

  const createPlayer = React.useCallback(() => {
    if (playerRef.current || !window.YT?.Player) return
    const el = document.getElementById("watchstudio-yt-player")
    if (!el) return

    playerRef.current = new window.YT.Player(el, {
      height: "360",
      width: "640",
      videoId,
      playerVars: {
        autoplay: 0,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        disablekb: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: (event) => {
          setIsReady(true)
          callbacks.current.onReady?.()
        },
        onStateChange: (event) => {
          callbacks.current.onStateChange?.(event.data as YT.PlayerState)
        },
        onError: (event) => {
          setLoadError(`YouTube player error ${event.data}`)
          callbacks.current.onError?.(event.data)
        },
        onPlaybackRateChange: (event) => {
          callbacks.current.onPlaybackRateChange?.(event.data)
        },
      },
    })
  }, [videoId])

  React.useEffect(() => {
    if (window.YT && window.YT.Player) {
      createPlayer()
      return undefined
    }

    const tag = document.createElement("script")
    tag.src = "https://www.youtube.com/iframe_api"
    tag.async = true
    document.head?.appendChild(tag)

    const readyHandler = () => createPlayer()
    ;(window as unknown as { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady = readyHandler

    return () => {
      ;(window as unknown as { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady = undefined
      try {
        document.head?.removeChild(tag)
      } catch {
        /* ignore */
      }
      if (playerRef.current) {
        try {
          playerRef.current.destroy()
        } catch {
          /* ignore */
        }
        playerRef.current = null
      }
    }
  }, [createPlayer])

  // Load a different video without recreating the player. Use `cue` (not
  // `load`): cueVideoById loads the video WITHOUT starting playback, so a
  // newly loaded player never silently begins playing when the
  // server-authoritative state is paused. The parent reconciles play/pause
  // from authoritative state. (The bundled YT types omit cueVideoById even
  // though the IFrame API defines it.)
  React.useEffect(() => {
    const player = playerRef.current as (YT.Player & { cueVideoById?: (id: string) => void }) | null
    if (player && isReady && typeof player.cueVideoById === "function") {
      player.cueVideoById(videoId)
      setLoadError(null)
    }
  }, [videoId, isReady])

  // ------------------------------------------------------------------
  // Auto-skip: poll the player's current time and seek past any segment
  // whose range we are inside. Only applies when contentFilterEnabled.
  // ------------------------------------------------------------------
  const skippedSegmentsRef = React.useRef<Set<number>>(new Set())

  React.useEffect(() => {
    if (!contentFilterEnabled || !skipSegments.length || !playerRef.current || !isReady) {
      skippedSegmentsRef.current.clear()
      return
    }

    const player = playerRef.current
    const interval = setInterval(() => {
      const currentTimeMs = player.getCurrentTime() * 1000

      for (let i = 0; i < skipSegments.length; i++) {
        if (skippedSegmentsRef.current.has(i)) continue
        const seg = skipSegments[i]
        if (currentTimeMs >= seg.startMs && currentTimeMs < seg.endMs) {
          // Seek past the segment and mark it skipped
          player.seekTo(seg.endMs / 1000, true)
          skippedSegmentsRef.current.add(i)
          onSkipSegment?.(seg.reason)
          break
        }
      }
    }, 500)

    return () => {
      clearInterval(interval)
      skippedSegmentsRef.current.clear()
    }
  }, [contentFilterEnabled, skipSegments, isReady, onSkipSegment])

  // Reset skipped segments when the video changes
  React.useEffect(() => {
    skippedSegmentsRef.current.clear()
  }, [videoId])

  return (
    <div className={className}>
      <div id="watchstudio-yt-player" />
      {!isReady && !loadError && <Spinner size={32} />}
      {loadError && (
        <p className="mt-2 text-xs text-danger">{loadError}</p>
      )}
    </div>
  )
}

export function useYouTubeControls(videoId: string) {
  const playerRef = React.useRef<YT.Player | null>(null)
  const [state, setState] = React.useState<YT.PlayerState | null>(null)
  const [currentTime, setCurrentTime] = React.useState(0)

  const player = React.useMemo(() => {
    return {
      play: () => playerRef.current?.playVideo(),
      pause: () => playerRef.current?.pauseVideo(),
      seek: (seconds: number) => playerRef.current?.seekTo(seconds, true),
      getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
      getPlayerState: () => playerRef.current?.getPlayerState(),
      getPlaybackRate: () => (playerRef.current as any)?.getPlaybackRate?.() ?? 1,
      isReady: () => !!playerRef.current,
    }
  }, [])

  React.useEffect(() => {
    if (!window.YT?.Player) return
    const el = document.getElementById("watchstudio-yt-player")
    if (!el) return
    playerRef.current = new window.YT.Player(el, {
      height: "360",
      width: "640",
      videoId,
      playerVars: { autoplay: 0, modestbranding: 1, rel: 0, playsinline: 1 },
      events: {
        onReady: () => setState(playerRef.current?.getPlayerState() ?? -1),
        onStateChange: (e) => setState(e.data as YT.PlayerState),
        onError: () => {},
      },
    })
    return () => {
      try { playerRef.current?.destroy() } catch { /* ignore */ }
      playerRef.current = null
    }
  }, [videoId])

  React.useEffect(() => {
    const interval = setInterval(() => {
      if (playerRef.current) setCurrentTime(playerRef.current.getCurrentTime())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return { player, state, currentTime }
}
