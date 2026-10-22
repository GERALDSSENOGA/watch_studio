/**
 * Provider-adapter architecture for media playback.
 *
 * WatchStudio does not assume every URL can be played in a generic video
 * element. Each provider declares what it supports. Capabilities are declared
 * here (server source of truth) and mirrored in the client presentation
 * layer so UI never pretends a capability exists that the provider does not.
 */

/** Canonical set of provider identifiers. */
export const PROVIDER_IDS = {
  YOUTUBE: "youtube",
  DIRECT_FILE: "direct-file",
  GENERIC: "generic",
} as const

export type ProviderId = (typeof PROVIDER_IDS)[keyof typeof PROVIDER_IDS]

export type ProviderCapabilities = {
  /** Stable provider identifier. */
  id: ProviderId
  /** Human-readable provider name shown in the UI. */
  name: string
  /** URL patterns (anchored, no flags) used to detect this provider from a URL. */
  urlPatterns: RegExp[]
  /** Whether the provider can be embedded in an iframe on this site. */
  embedSupported: boolean
  /** Whether the provider offers an official playback API. */
  officialApi: boolean
  /** Whether programmatic play / pause / seek is supported. */
  commandsSupported: boolean
  /** Whether current time position can be read from the player. */
  positionReadable: boolean
  /** Whether WatchStudio can synchronize playback across participants. */
  syncSupported: boolean
  /** Whether an external-link fallback is required for this provider. */
  externalFallbackRequired: boolean
  /** Human note about limitations (shown in capability labels). */
  notes?: string
}

/**
 * Registered providers.
 *
 * YouTube is the one documented, genuinely supported integration (official
 * IFrame Player API, embeddable videos only). Embeddability of a specific
 * video cannot be proven server-side without the YouTube Data API and even
 * then can change; the client adapter detects refusal and falls back to
 * external mode honestly.
 *
 * direct-file: direct video files the browser can play in <video>, where the
 * source is authorized and CORS permits. Synchronization is NOT supported for
 * direct files (no standard control API) — they use external/coordination mode.
 *
 * generic: everything else — external-link fallback only.
 */
export const PROVIDERS: Record<ProviderId, ProviderCapabilities> = {
  youtube: {
    id: PROVIDER_IDS.YOUTUBE,
    name: "YouTube",
    urlPatterns: [
      /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([\w-]{11})/,
      /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([\w-]{11})/,
      /^(?:https?:\/\/)?youtu\.be\/([\w-]{11})/,
    ],
    embedSupported: true,
    officialApi: true,
    commandsSupported: true,
    positionReadable: true,
    syncSupported: true,
    externalFallbackRequired: false,
    notes: "Embedded YouTube player via the IFrame Player API. Only publicly embeddable videos can be synchronized.",
  },
  "direct-file": {
    id: PROVIDER_IDS.DIRECT_FILE,
    name: "Direct video file",
    urlPatterns: [/\.(mp4|webm|ogg)(\?|#|$)/i],
    embedSupported: true,
    officialApi: false,
    commandsSupported: false,
    positionReadable: true,
    syncSupported: false,
    externalFallbackRequired: false,
    notes: "Browser <video> element. Playback cannot be synchronized across participants.",
  },
  generic: {
    id: PROVIDER_IDS.GENERIC,
    name: "External provider",
    urlPatterns: [/./],
    embedSupported: false,
    officialApi: false,
    commandsSupported: false,
    positionReadable: false,
    syncSupported: false,
    externalFallbackRequired: true,
    notes: "Cannot be embedded or controlled. Open on the provider's site.",
  },
} as const

/**
 * Detect the provider for a submitted URL. Returns null for URLs that do not
 * match any known pattern (treated as generic external fallback).
 */
export function detectProvider(url: string): {
  providerId: ProviderId
  videoId?: string
} | null {
  for (const [id, provider] of Object.entries(PROVIDERS)) {
    for (const pattern of provider.urlPatterns) {
      const match = url.match(pattern)
      if (match) {
        return {
          providerId: id as ProviderId,
          videoId: id === PROVIDER_IDS.YOUTUBE ? match[1] : undefined,
        }
      }
    }
  }
  return { providerId: PROVIDER_IDS.GENERIC, videoId: undefined }
}

export function getProvider(providerId: ProviderId): ProviderCapabilities {
  return PROVIDERS[providerId] ?? PROVIDERS.generic
}

/** YouTube embed URL for a video id. */
export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`
}

/** YouTube standard page URL. */
export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
}
