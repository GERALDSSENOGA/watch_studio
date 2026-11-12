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
  FULLMATCHSHOWS: "fullmatchshows",
  SOCCERFULL: "soccerfull",
  PLAYMOGO: "playmogo",
  VIXEO: "vixeo",
  VIDARAA: "vidaraa",
  EMBEDSEEK: "embedseek",
  BYSEKOZE: "bysekoze",
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
 * direct files (no standard control API) â€” they use external/coordination mode.
 *
 * fullmatchshows: a match replay directory that links to third-party
 * video hosts. It cannot be embedded or synchronized; links open on the
 * site for viewing.
 *
 * playmogo / vixeo / vidaraa / embedseek / bysekoze: third-party video hosts
 * linked from FullMatchShows match pages. They cannot be embedded or
 * synchronized; links open on the host's site for viewing.
 *
 * generic: everything else â€” external-link fallback only.
 */
export const PROVIDERS: Record<ProviderId, ProviderCapabilities> = {
  youtube: {
    id: PROVIDER_IDS.YOUTUBE,
    name: "YouTube",
    urlPatterns: [
      /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([\w-]{11})/i,
      /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([\w-]{11})/i,
      /^(?:https?:\/\/)?youtu\.be\/([\w-]{11})/i,
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
  fullmatchshows: {
    id: PROVIDER_IDS.FULLMATCHSHOWS,
    name: "FullMatchShows",
    urlPatterns: [
      /^(?:https?:\/\/)?(?:www\.)?fullmatchshows\.com/i,
    ],
    embedSupported: false,
    officialApi: false,
    commandsSupported: false,
    positionReadable: false,
    syncSupported: false,
    externalFallbackRequired: true,
    notes: "FullMatchShows is a match replay directory. Videos are hosted on third-party sites; open the link on FullMatchShows to watch. Playback cannot be embedded or synchronized within WatchStudio.",
  },
  soccerfull: {
    id: PROVIDER_IDS.SOCCERFULL,
    name: "SoccerFull",
    urlPatterns: [
      /^(?:https?:\/\/)?(?:www\.)?soccerfull\.net/i,
    ],
    embedSupported: false,
    officialApi: false,
    commandsSupported: false,
    positionReadable: false,
    syncSupported: false,
    externalFallbackRequired: true,
    notes: "SoccerFull is a match replay directory. Videos are hosted on third-party sites; open the link on SoccerFull to watch. Playback cannot be embedded or synchronized within WatchStudio.",
  },
  playmogo: {
    id: PROVIDER_IDS.PLAYMOGO,
    name: "Playmogo",
    urlPatterns: [
      /^(?:https?:\/\/)?(?:www\.)?playmogo\.com/i,
    ],
    embedSupported: false,
    officialApi: false,
    commandsSupported: false,
    positionReadable: false,
    syncSupported: false,
    externalFallbackRequired: true,
    notes: "Third-party video host. Cannot be embedded or synchronized; open on Playmogo to watch.",
  },
  vixeo: {
    id: PROVIDER_IDS.VIXEO,
    name: "Vixeo",
    urlPatterns: [
      /^(?:https?:\/\/)?(?:www\.)?vixeo\.io/i,
    ],
    embedSupported: false,
    officialApi: false,
    commandsSupported: false,
    positionReadable: false,
    syncSupported: false,
    externalFallbackRequired: true,
    notes: "Third-party video host. Cannot be embedded or synchronized; open on Vixeo to watch.",
  },
  vidaraa: {
    id: PROVIDER_IDS.VIDARAA,
    name: "Vidaraa",
    urlPatterns: [
      /^(?:https?:\/\/)?(?:www\.)?vidaraa\.cc/i,
    ],
    embedSupported: false,
    officialApi: false,
    commandsSupported: false,
    positionReadable: false,
    syncSupported: false,
    externalFallbackRequired: true,
    notes: "Third-party video host. Cannot be embedded or synchronized; open on Vidaraa to watch.",
  },
  embedseek: {
    id: PROVIDER_IDS.EMBEDSEEK,
    name: "EmbedSeek",
    urlPatterns: [
      /^(?:https?:\/\/)?(?:www\.)?fullmatchshows\.embedseek\.com/i,
      /^(?:https?:\/\/)?(?:www\.)?embedseek\.com/i,
    ],
    embedSupported: false,
    officialApi: false,
    commandsSupported: false,
    positionReadable: false,
    syncSupported: false,
    externalFallbackRequired: true,
    notes: "Third-party video host. Cannot be embedded or synchronized; open on EmbedSeek to watch.",
  },
  bysekoze: {
    id: PROVIDER_IDS.BYSEKOZE,
    name: "Bysekoze",
    urlPatterns: [
      /^(?:https?:\/\/)?(?:www\.)?bysekoze\.com/i,
    ],
    embedSupported: false,
    officialApi: false,
    commandsSupported: false,
    positionReadable: false,
    syncSupported: false,
    externalFallbackRequired: true,
    notes: "Third-party video host. Cannot be embedded or synchronized; open on Bysekoze to watch.",
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
