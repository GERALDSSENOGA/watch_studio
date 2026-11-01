"use client"

import * as React from "react"
import { YouTubePlayer } from "@/components/players/youtube-player"
import { getProvider, youtubeWatchUrl } from "@/lib/providers"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface RoomMedia {
  id: string
  title: string
  originalUrl: string
  providerId: string
  providerVideoId: string | null
  playbackMode: string
  accessMode: string
}

interface RoomPlayback {
  state: string
  positionMs: number
  version: number
}

interface RoomPlayerProps {
  roomId: string
  media: RoomMedia
  playback: RoomPlayback | null
  isHost: boolean
  userId: string
  send: (payload: unknown) => void
}

const YT_PLAYING = 1
const YT_PAUSED = 2

export function RoomPlayer({ roomId, media, playback, isHost, userId, send }: RoomPlayerProps) {
  const provider = getProvider(media.providerId as any)
  const synced = media.playbackMode === "SYNCHRONIZED"
  const [localVersion, setLocalVersion] = React.useState(playback?.version ?? 1)
  const optimisticRef = React.useRef({ state: playback?.state ?? "PAUSED", positionMs: playback?.positionMs ?? 0 })
  const playerRef = React.useRef<{ play: () => void; pause: () => void; seek: (s: number) => void; getState: () => YT.PlayerState | null } | null>(null)

  // Apply server-authoritative state to the player (ignoring our own command echoes).
  React.useEffect(() => {
    if (!playback || !playerRef.current) return
    if (playback.version <= localVersion) return // echo of our own command or stale
    const targetPlaying = playback.state === "PLAYING"
    const current = playerRef.current.getState()
    if (current === null) return
    const currentlyPlaying = current === YT_PLAYING
    if (targetPlaying !== currentlyPlaying) {
      if (targetPlaying) {
        playerRef.current.play()
      } else {
        playerRef.current.pause()
      }
    }
    const driftMs = Math.abs(playerRef.current ? 0 : 0) // position applied via seek below when difference is large
    if (Math.abs(optimisticRef.current.positionMs - playback.positionMs) > 3000) {
      playerRef.current.seek(playback.positionMs / 1000)
    }
    optimisticRef.current = { state: playback.state, positionMs: playback.positionMs }
    setLocalVersion(playback.version)
  }, [playback, localVersion])

  const sendCommand = React.useCallback(
    (action: "play" | "pause" | "seek", positionMs?: number) => {
      if (!isHost || !synced) return
      const nextVersion = localVersion + 1
      send({
        type: "playback.command",
        roomId,
        command: { action, positionMs, version: nextVersion },
      })
      optimisticRef.current = { state: action === "pause" ? "PAUSED" : "PLAYING", positionMs: positionMs ?? optimisticRef.current.positionMs }
      setLocalVersion(nextVersion)
    },
    [isHost, synced, roomId, send, localVersion]
  )

  const onReady = React.useCallback(() => {
    // Reconcile with server state once the player is ready.
    if (playback && playerRef.current) {
      if (playback.state === "PLAYING") {
        playerRef.current.play()
      } else {
        playerRef.current.pause()
      }
      if (Math.abs(optimisticRef.current.positionMs - playback.positionMs) > 1000) {
        playerRef.current.seek(playback.positionMs / 1000)
      }
    }
  }, [playback])

  const onStateChange = React.useCallback(
    (state: YT.PlayerState) => {
      optimisticRef.current = {
        state: state === YT_PLAYING ? "PLAYING" : "PAUSED",
        positionMs: optimisticRef.current.positionMs,
      }
    },
    []
  )

  // A freshly created room has no media yet; RoomView renders its own
  // "No media selected" card, so don't also claim the source is unavailable.
  if (!media.id) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Badge
          variant={synced ? "success" : media.playbackMode === "EXTERNAL" ? "muted" : "danger"}
          size="sm"
        >
          {synced ? "Mode A · synchronized" : media.playbackMode === "EXTERNAL" ? "Mode B · external link" : "Mode C · unsupported"}
        </Badge>
        <span className="text-xs text-muted-foreground">{provider.name}</span>
      </div>

      {synced && media.providerVideoId ? (
        <div className="aspect-video rounded-lg border border-border bg-black overflow-hidden">
          <YouTubePlayer
            videoId={media.providerVideoId}
            onReady={onReady}
            onStateChange={onStateChange}
            onError={(code) => {
              // Non-embeddable video: fall back to external mode honestly.
              send({ type: "playback.error", code: "EMBED_BLOCKED", message: "This video cannot be embedded." })
            }}
          />
          {playerRef.current ? null : (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-sm text-muted-foreground">
              Loading player…
            </div>
          )}
        </div>
      ) : null}

      {synced && media.providerVideoId && (
        <div className="flex items-center gap-3 px-2">
          <Button
            type="button"
            disabled={!isHost || optimisticRef.current.state === "PLAYING"}
            onClick={() => sendCommand(optimisticRef.current.state === "PLAYING" ? "pause" : "play")}
          >
            {optimisticRef.current.state === "PLAYING" ? "Pause" : "Play"}
          </Button>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground block mb-1">Seek (seconds, host only)</label>
            <Input
              type="number"
              value={String(optimisticRef.current.positionMs / 1000)}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (!Number.isNaN(v)) sendCommand("seek", v * 1000)
              }}
              disabled={!isHost}
              className="h-9"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {Math.floor(optimisticRef.current.positionMs / 1000)}s · v{localVersion}
          </span>
          {!isHost && (
            <span className="text-xs text-muted-foreground">Host controls playback</span>
          )}
        </div>
      )}

      {!synced && media.accessMode === "EXTERNAL" && provider.externalFallbackRequired && (
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          <p className="text-sm font-medium">Mode B — watch on provider</p>
          <p className="text-xs text-muted-foreground mb-3">
            This source cannot be embedded or synchronized. Open it on the provider's site and use the room for chat and coordination.
          </p>
          <a
            href={media.providerId === "youtube" ? youtubeWatchUrl(media.providerVideoId ?? "") : media.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="button-focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-hover"
          >
            Open on provider ↗
          </a>
        </div>
      )}

      {media.playbackMode === "UNSUPPORTED" && (
        <div className="rounded-lg border border-danger bg-danger-muted p-4 text-center">
          <p className="text-sm font-medium text-danger">Mode C — source unavailable</p>
          <p className="text-xs text-muted-foreground">
            This source cannot be played through WatchStudio. Choose a different media item for the room.
          </p>
        </div>
      )}
    </div>
  )
}
