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
}

export function YouTubePlayer({
  videoId,
  onReady,
  onStateChange,
  onError,
  onPlaybackRateChange,
  className,
}: YouTubePlayerProps) {
  const playerRef = React.useRef<YT.Player | null>(null)
  const [isReady, setIsReady] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const callbacks = React.useRef({ onReady, onStateChange, onError, onPlaybackRateChange })
  callbacks.current = { onReady, onStateChange, onError, onPlaybackRateChange }

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
  }, [])

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

  // Load a different video without recreating the player.
  React.useEffect(() => {
    if (playerRef.current && isReady) {
      playerRef.current.loadVideoById(videoId)
      setLoadError(null)
    }
  }, [videoId, isReady])

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
