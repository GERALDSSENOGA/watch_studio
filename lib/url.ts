/**
 * URL validation for media links.
 *
 * WatchStudio only accepts ordinary https:// web URLs. Unsafe schemes
 * (javascript:, data:, file:, ws:, wss:, mailto:, ...) are rejected outright.
 * Validating a URL's format is NOT a statement about the legality or
 * accessibility of the stream it points to.
 */

const ALLOWED_PROTOCOLS = new Set(["https:"])

export type ParsedMediaUrl = {
  url: string
  origin: string
  pathname: string
}

export function parseMediaUrl(input: string): ParsedMediaUrl | null {
  if (typeof input !== "string" || input.trim().length === 0) return null

  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null
  if (!url.hostname || url.hostname.includes(" ")) return null
  // Reject IP-literal hosts for link submissions (SSRF reduction + opaqueness).
  if (/^\[.*\]$/.test(url.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) {
    return null
  }

  return {
    url: url.toString(),
    origin: url.origin,
    pathname: url.pathname,
  }
}

/** Strict scheme check: only https:// is acceptable for submitted links. */
export function isSupportedUrlScheme(input: string): boolean {
  return parseMediaUrl(input) !== null
}

export function isExternalHttpUrl(input: string): boolean {
  try {
    const u = new URL(input)
    return u.protocol === "https:" || u.protocol === "http:"
  } catch {
    return false
  }
}
