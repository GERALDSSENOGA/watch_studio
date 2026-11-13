/**
 * Timecode helpers for skip segments.
 *
 * Users type readable timestamps copied from a player ("28:01", "1:28:01")
 * while skip segments are stored in milliseconds, so every boundary is
 * converted here rather than asking anyone to do the arithmetic by hand.
 */

/** Parse "M:SS", "H:MM:SS" or a bare number of seconds into milliseconds. */
export function parseTimecode(input: string): number | null {
  const raw = input.trim()
  if (!raw) return null

  const parts = raw.split(":")
  if (parts.length > 3) return null

  let totalSeconds = 0
  for (const part of parts) {
    const value = part.trim()
    if (!/^\d+(\.\d+)?$/.test(value)) return null
    totalSeconds = totalSeconds * 60 + Number(value)
  }

  return Math.round(totalSeconds * 1000)
}

/** Render milliseconds back as "M:SS" (or "H:MM:SS" past an hour). */
export function formatTimecode(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const ss = String(seconds).padStart(2, "0")
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`
  }
  return `${minutes}:${ss}`
}
