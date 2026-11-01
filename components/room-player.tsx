"use client"

import * as React from "react"
import { YouTubePlayer, YouTubeControls } from "@/components/players/youtube-player"
import { getProvider, youtubeWatchUrl } from "@/lib/providers"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { usePlaybackSync } from "@/hooks/usePlaybackSync"
import {
  PlaybackSyncState,
  SYNC_DRIFT_THRESHOLD_MS,
} from "@/lib/sync/types"

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
  /** Ref callback set by RoomView so the socket can deliver host sync states
   *  directly to the guest's sync logic. */
  setReceivedSyncStateRef?: React.MutableRefObject<((state: PlaybackSyncState) => void) | null>
}

const YT_PLAYING = 1

export function RoomPlayer({
  roomId,
  media,
  playback,
  isHost,
  userId,
  send,
  setReceivedSyncStateRef,
}: RoomPlayerProps) {
  const provider = getProvider(media.providerId as any)
  const synced = media.playbackMode === "SYNCHRONIZED"
  const isDirectFile = media.providerId === "direct-file"

  const playerRef = React.useRef<YouTubeControls | null>(null)
  const [playerReady, setPlayerReady] = React.useState(false)
  const [needsTapToSync, setNeedsTapToSync] = React.useState(false)

  // ------------------------------------------------------------------
  // Sync hook: host broadcasts, guest applies with drift threshold
  // ------------------------------------------------------------------
  const { broadcastSync, setReceivedSyncState } = usePlaybackSync({
    playerRef,
    roomId,
    isHost,
    userId,
    send,
  })

  // Expose setReceivedSyncState to RoomView via ref so the socket can deliver
  // host sync states directly to the guest sync logic.
  React.useEffect(() => {
    if (!setReceivedSyncStateRef) return
    setReceivedSyncStateRef.current = setReceivedSyncState
    return () => {
      setReceivedSyncStateRef.current = null
    }
  }, [setReceivedSyncState, setReceivedSyncStateRef])

  // ------------------------------------------------------------------
  // Apply authoritative server state (fallback / convergence)
  // ------------------------------------------------------------------
  const [optimistic, setOptimistic] = React.useState({
    state: playback?.state ?? "PAUSED",
    positionMs: playback?.positionMs ?? 0,
    version: playback?.version ?? 1,
  })

  const playerPositionMs = React.useCallback(
    () => (playerRef.current?.getCurrentTime() ?? 0) * 1000,
    []
  )

  const applyAuthoritative = React.useCallback(
    (state: { state: string; positionMs: number; version: number }) => {
      const player = playerRef.current
      if (!player) return
      const targetPlaying = state.state === "PLAYING"
      const current = player.getState()
      if (current !== null) {
        const currentlyPlaying = current === YT_PLAYING
        if (targetPlaying !== currentlyPlaying) {
          if (targetPlaying) player.play()
          else player.pause()
        }
      }
      if (Math.abs(playerPositionMs() - state.positionMs) > 3000) {
        player.seek(state.positionMs / 1000)
      }
      setOptimistic({ state: state.state, positionMs: state.positionMs, version: state.version })
    },
    [playerPositionMs]
  )

  React.useEffect(() => {
    if (!playback || !playerReady) return
    if (playback.version < optimistic.version) return // stale
    applyAuthoritative(playback)
  }, [playback, playerReady, optimistic.version, applyAuthoritative])

  // ------------------------------------------------------------------
  // Host: send command to server + broadcast sync to guests immediately
  // ------------------------------------------------------------------
  const sendCommand = React.useCallback(
    (action: "play" | "pause" | "seek", positionMs?: number) => {
      if (!isHost || !synced) return
      const baseVersion = optimistic.version
      send({
        type: "playback.command",
        roomId,
        command: { action, positionMs, version: baseVersion },
      })
      // Apply locally immediately
      if (action === "play") playerRef.current?.play()
      else if (action === "pause") playerRef.current?.pause()
      else if (action === "seek" && positionMs != null)
        playerRef.current?.seek(positionMs / 1000)
      setOptimistic({
        state: action === "pause" ? "PAUSED" : "PLAYING",
        positionMs: positionMs ?? optimistic.positionMs,
        version: baseVersion + 1,
      })
      // Fast path: broadcast sync to guests without waiting for server echo
      const player = playerRef.current
      if (player) {
        broadcastSync({
          currentTime: action === "seek" ? (positionMs ?? 0) / 1000 : player.getCurrentTime(),
          isPlaying: action !== "pause",
          playbackRate: player.getPlaybackRate?.() ?? 1,
        })
      }
    },
    [isHost, synced, roomId, send, optimistic.version, optimistic.positionMs, broadcastSync]
  )

  const onReady = React.useCallback(() => {
    setPlayerReady(true)
    if (playback && playerRef.current) {
      applyAuthoritative(playback)
    }
  }, [playback, applyAuthoritative])

  const onStateChange = React.useCallback((_state: YT.PlayerState) => {}, [])

  if (!media.id) return null

  const showExternalFallback = !synced && media.playbackMode === "EXTERNAL" && !isDirectFile

  // ------------------------------------------------------------------
  // Guest: apply host sync state with drift threshold
  // ------------------------------------------------------------------
  // Handled inside usePlaybackSync via setReceivedSyncState ref.

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Badge
          variant={synced ? "success" : media.playbackMode === "EXTERNAL" ? "muted" : "danger"}
          size="sm"
        >
          {synced
            ? "Mode A · synchronized"
            : isDirectFile
              ? "Mode B · embedded (no sync)"
              : media.playbackMode === "EXTERNAL"
                ? "Mode B · external link"
                : "Mode C · unsupported"}
        </Badge>
        <span className="text-xs text-muted-foreground">{provider.name}</span>
      </div>

      {synced && media.providerVideoId ? (
        <div className="relative aspect-video rounded-lg border border-border bg-black overflow-hidden">
          <YouTubePlayer
            videoId={media.providerVideoId}
            onReady={onReady}
            onStateChange={onStateChange}
            controlsRef={playerRef}
            onError={() => {
              send({ type: "playback.error", code: "EMBED_BLOCKED", message: "This video cannot be embedded." })
            }}
          />
          {!playerReady && (
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
            disabled={!isHost}
            onClick={() => sendCommand(optimistic.state === "PLAYING" ? "pause" : "play")}
          >
            {optimistic.state === "PLAYING" ? "Pause" : "Play"}
          </Button>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground block mb-1">Seek (seconds, host only)</label>
            <Input
              type="number"
              value={String(optimistic.positionMs / 1000)}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (!Number.isNaN(v)) sendCommand("seek", v * 1000)
              }}
              disabled={!isHost}
              className="h-9"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {Math.floor(optimistic.positionMs / 1000)}s · v{optimistic.version}
          </span>
          {needsTapToSync && (
            <div className="rounded-md border border-border bg-surface p-3 text-sm">
              <span className="mr-3 text-muted-foreground">
                The room is playing, but your player is not (your browser may have blocked autoplay).
              </span>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  playerRef.current?.play()
                  setNeedsTapToSync(false)
                }}
              >
                Tap to sync
              </Button>
            </div>
          )}
          {!isHost && (
            <span className="text-xs text-muted-foreground">Host controls playback</span>
          )}
        </div>
      )}

      {isDirectFile && (
        <div className="flex flex-col gap-2">
          <div className="relative aspect-video rounded-lg border border-border bg-black overflow-hidden">
            <video
              src={media.originalUrl}
              controls
              playsInline
              preload="metadata"
              className="h-full w-full"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            This file plays in your browser only. WatchStudio cannot synchronize playback for direct video
            files — use the room chat to coordinate.
          </p>
        </div>
      )}

      {showExternalFallback && (
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          <p className="text-sm font-medium">Mode B — watch on provider</p>
          <p className="text-xs text-muted-foreground mb-3">
            This source can be opened on the provider&#39;s site but not synchronized. Use the room for chat
            and coordination.
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
          <p className="text-sm font-medium text-danger">Mode C — this source can&#39;t be embedded or synchronized</p>
          <p className="text-xs text-muted-foreground mb-3">
            WatchStudio cannot embed or control this link. You can still open it on the provider&#39;s site, or
            choose a different media item for synchronized playback.
          </p>
          <a
            href={media.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="button-focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-hover"
          >
            Open link in a new tab ↗
          </a>
        </div>
      )}
    </div>
  )
}
