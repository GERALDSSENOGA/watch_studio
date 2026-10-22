declare global {
  namespace YT {
    type PlayerState = -1 | 0 | 1 | 2 | 3 | 5
    interface PlayerOptions {
      width?: string | number
      height?: string | number
      videoId?: string
      playerVars?: Record<string, unknown>
      events?: {
        onReady?: (event: { target: Player }) => void
        onStateChange?: (event: { data: PlayerState; target: Player }) => void
        onError?: (event: { data: number; target: Player }) => void
        onPlaybackRateChange?: (event: { data: number; target: Player }) => void
        [key: string]: unknown
      }
    }
    class Player {
      constructor(element: string | HTMLElement, options: PlayerOptions)
      playVideo(): void
      pauseVideo(): void
      seekTo(seconds: number, allowSeekAhead: boolean): void
      getCurrentTime(): number
      getPlayerState(): PlayerState
      loadVideoById(videoId: string, startSeconds?: number): void
      destroy(): void
    }
    const Player: new (element: string | HTMLElement, options: PlayerOptions) => Player
  }
}

export {}
