/**
 * Playback synchronization types and constants.
 *
 * Host-authoritative sync model: the host is the source of truth for
 * currentTime, isPlaying, and playbackRate. The server relays host sync
 * broadcasts to all guests and persists the last known state so new
 * joiners can converge immediately.
 */

export const SYNC_DRIFT_THRESHOLD_MS = 1200 // correct drift only if > 1.2s
export const SYNC_HEARTBEAT_INTERVAL_MS = 2500 // broadcast every 2.5s while playing

/** Stable sync state broadcast by the host and relayed by the server. */
export interface PlaybackSyncState {
  /** Playhead position in seconds. */
  currentTime: number
  /** Whether the video is playing. */
  isPlaying: boolean
  /** Playback rate (1 = normal). */
  playbackRate: number
  /** Epoch milliseconds when the host captured this state. */
  updatedAt: number
  /** ID of the host client that originated the state. */
  hostId: string
}

/** WebSocket message sent by the host, relayed to all room members. */
export interface PlaybackSyncMessage {
  type: "playback.sync"
  roomId: string
  currentTime: number
  isPlaying: boolean
  playbackRate: number
  updatedAt: number
  hostId: string
}

/** Client request for the latest sync state (sent on join/reconnect). */
export interface PlaybackStateRequest {
  type: "playback.sync.request"
  roomId: string
}

/** Server response to a sync state request. */
export interface PlaybackStateResponse {
  type: "playback.sync.state"
  roomId: string
  currentTime: number
  isPlaying: boolean
  playbackRate: number
  updatedAt: number
  hostId: string | null
  version: number
}
