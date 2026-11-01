"use client"

import * as React from "react"
import { YouTubeControls } from "@/components/players/youtube-player"
import {
  PlaybackSyncMessage,
  PlaybackSyncState,
  SYNC_DRIFT_THRESHOLD_MS,
  SYNC_HEARTBEAT_INTERVAL_MS,
} from "@/lib/sync/types"

interface UsePlaybackSyncProps {
  playerRef: React.MutableRefObject<YouTubeControls | null>
  roomId: string
  isHost: boolean
  userId: string
  send: (payload: unknown) => void
  /** Guest-only: called when a sync state is received from the host. */
  onSyncState?: (state: PlaybackSyncState) => void
}

interface UsePlaybackSyncReturn {
  /** Host-only: call immediately when play/pause/seek happens locally. */
  broadcastSync: (state: {
    currentTime: number
    isPlaying: boolean
    playbackRate?: number
  }) => void
  /** Guest-only: call with sync state received from the host/socket. */
  setReceivedSyncState: (state: PlaybackSyncState) => void
  /** Latest sync state received from the host (guests only). */
  syncState: PlaybackSyncState | null
  /** Whether this client is the host. */
  isHost: boolean
}

/**
 * Host-authoritative playback synchronization.
 *
 * Host responsibilities:
 *   - Broadcast sync state immediately on play/pause/seek
 *   - Heartbeat every 2.5s while the video is playing
 *
 * Guest responsibilities:
 *   - Apply sync state from host with drift threshold (1.2s)
 *   - Sync play/pause state with host
 *
 * New joiners receive the latest sync state from the server on join.
 */
export function usePlaybackSync({
  playerRef,
  roomId,
  isHost,
  userId,
  send,
  onSyncState,
}: UsePlaybackSyncProps): UsePlaybackSyncReturn {
  const [syncState, setSyncState] = React.useState<PlaybackSyncState | null>(null)
  const heartbeatRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const callbacks = React.useRef({ onSyncState })
  callbacks.current = { onSyncState }

  // ------------------------------------------------------------------
  // HOST: Broadcast sync state immediately
  // ------------------------------------------------------------------
  const broadcastSync = React.useCallback(
    (state: { currentTime: number; isPlaying: boolean; playbackRate?: number }) => {
      if (!isHost) return
      const player = playerRef.current
      if (!player) return

      const now = Date.now()
      const payload: PlaybackSyncMessage = {
        type: "playback.sync",
        roomId,
        currentTime: state.currentTime,
        isPlaying: state.isPlaying,
        playbackRate: state.playbackRate ?? player.getPlaybackRate?.() ?? 1,
        updatedAt: now,
        hostId: userId,
      }
      send(payload)
    },
    [isHost, playerRef, roomId, userId, send]
  )

  // ------------------------------------------------------------------
  // HOST: Heartbeat while playing
  // ------------------------------------------------------------------
  React.useEffect(() => {
    if (!isHost) return

    const tick = () => {
      const player = playerRef.current
      if (!player) return
      const state = player.getState()
      const isPlaying = state === 1 // YT.PlayerState.PLAYING
      if (!isPlaying) return

      broadcastSync({
        currentTime: player.getCurrentTime(),
        isPlaying: true,
        playbackRate: player.getPlaybackRate?.() ?? 1,
      })
    }

    heartbeatRef.current = setInterval(tick, SYNC_HEARTBEAT_INTERVAL_MS)
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
  }, [isHost, playerRef, broadcastSync])

  // Cleanup heartbeat on unmount
  React.useEffect(() => {
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    }
  }, [])

  // ------------------------------------------------------------------
  // GUEST: Apply sync state received from host
  // ------------------------------------------------------------------
  const applySyncState = React.useCallback(
    (state: PlaybackSyncState) => {
      setSyncState(state)
      const player = playerRef.current
      if (!player) return

      const hostTimeMs = state.currentTime * 1000
      const localTimeMs = player.getCurrentTime() * 1000
      const drift = Math.abs(hostTimeMs - localTimeMs)

      const hostPlaying = state.isPlaying
      const current = player.getState()
      const localPlaying = current === 1 // YT.PlayerState.PLAYING

      // Sync play/pause state with host
      if (hostPlaying !== localPlaying) {
        if (hostPlaying) player.play()
        else player.pause()
      }

      // Correct drift only if it exceeds the threshold
      if (drift > SYNC_DRIFT_THRESHOLD_MS) {
        player.seek(state.currentTime)
      }
    },
    [playerRef]
  )

  // Expose sync state to guest consumers via callback
  React.useEffect(() => {
    if (!isHost && syncState && callbacks.current.onSyncState) {
      callbacks.current.onSyncState(syncState)
    }
  }, [isHost, syncState])

  // Store sync state when received externally (wired by RoomView via onPlaybackSync)
  const setReceivedSyncState = React.useCallback((state: PlaybackSyncState) => {
    setSyncState(state)
    applySyncState(state)
  }, [applySyncState])

  return {
    broadcastSync,
    setReceivedSyncState,
    syncState,
    isHost,
  }
}
