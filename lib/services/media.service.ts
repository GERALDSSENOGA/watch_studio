import {
  Prisma,
  MediaCategory,
  MediaAccessMode,
  MediaPlaybackMode,
  MediaAvailability,
} from "@prisma/client"
import { prisma } from "@/lib/db"
import { parseMediaUrl } from "@/lib/url"
import { detectProvider, getProvider, PROVIDER_IDS } from "@/lib/providers"

export const MEDIA_TITLE_MAX = 200
export const MEDIA_DESCRIPTION_MAX = 2000

export class MediaError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number = 400) {
    super(message)
    this.name = "MediaError"
  }
}

function playbackModeFor(providerId: string): MediaPlaybackMode {
  const provider = getProvider(providerId as typeof PROVIDER_IDS.YOUTUBE)
  if (provider.syncSupported) return MediaPlaybackMode.SYNCHRONIZED
  if (provider.embedSupported) return MediaPlaybackMode.EXTERNAL
  if (provider.externalFallbackRequired) return MediaPlaybackMode.EXTERNAL
  return MediaPlaybackMode.UNSUPPORTED
}

export async function createMedia(input: {
  ownerId: string
  title: string
  description?: string
  category: "MOVIE"
  originalUrl: string
  thumbnailUrl?: string
  releaseYear?: number
  genre?: string
  durationMins?: number
  contentFilterEnabled?: boolean
  contentRating?: string | null
  contentWarnings?: string[] | null
  skipSegments?: Array<{ startMs: number; endMs: number; reason: string }> | null
}) {
  const trimmed = input.title.trim()
  if (trimmed.length === 0) throw new MediaError("TITLE_REQUIRED", "Title is required", 400)
  if (trimmed.length > MEDIA_TITLE_MAX)
    throw new MediaError("TITLE_TOO_LONG", `Title must be ${MEDIA_TITLE_MAX} characters or fewer`, 400)
  if (input.description && input.description.length > MEDIA_DESCRIPTION_MAX)
    throw new MediaError("DESCRIPTION_TOO_LONG", `Description must be ${MEDIA_DESCRIPTION_MAX} characters or fewer`, 400)

  const parsed = parseMediaUrl(input.originalUrl)
  if (!parsed) throw new MediaError("INVALID_URL", "Provide a valid https:// URL", 400)

  const detected = detectProvider(input.originalUrl)
  const providerId = detected?.providerId ?? PROVIDER_IDS.GENERIC

  return prisma.mediaItem.create({
    data: {
      ownerId: input.ownerId,
      title: trimmed,
      description: input.description?.trim() ?? undefined,
      category: input.category,
      originalUrl: parsed.url,
      providerId,
      providerVideoId: detected?.videoId ?? undefined,
      thumbnailUrl: input.thumbnailUrl?.trim() ?? undefined,
      accessMode: getProvider(providerId).embedSupported ? MediaAccessMode.EMBED : MediaAccessMode.EXTERNAL,
      playbackMode: playbackModeFor(providerId),
      availability: MediaAvailability.AVAILABLE,
      releaseYear: input.releaseYear ?? undefined,
      genre: input.genre?.trim() ?? undefined,
      durationMins: input.durationMins ?? undefined,
      contentFilterEnabled: input.contentFilterEnabled ?? false,
      contentRating: input.contentRating ?? undefined,
      contentWarnings:
        input.contentWarnings?.length ? JSON.stringify(input.contentWarnings) : undefined,
      skipSegments:
        input.skipSegments?.length ? JSON.stringify(input.skipSegments) : undefined,
    },
  })
}

export async function getMedia(id: string, opts?: { ownerId?: string }) {
  const media = await prisma.mediaItem.findUnique({ where: { id } })
  if (!media) throw new MediaError("NOT_FOUND", "Media item not found", 404)
  if (opts?.ownerId !== undefined && media.ownerId !== opts.ownerId)
    throw new MediaError("FORBIDDEN", "You do not own this media item", 403)
  return media
}

export async function listMedia(userId: string, opts?: {
  category?: "MOVIE"
  search?: string
  availability?: string
  take?: number
  cursor?: string
}) {
  const where: Prisma.MediaItemWhereInput = {
    ownerId: userId,
    moderationStatus: "approved",
  }
  if (opts?.category) where.category = opts.category
  if (opts?.availability) where.availability = opts.availability as MediaAvailability
  if (opts?.search) {
    where.OR = [
      { title: { contains: opts.search, mode: "insensitive" } },
      { description: { contains: opts.search, mode: "insensitive" } },
    ]
  }

  const [items, total] = await prisma.$transaction([
    prisma.mediaItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: opts?.take ?? 50,
      cursor: opts?.cursor ? { id: opts.cursor } : undefined,
    }),
    prisma.mediaItem.count({ where }),
  ])
  return { items, total }
}

export async function updateMedia(
  id: string,
  userId: string,
  data: {
    title?: string
    description?: string
    category?: "MOVIE"
    originalUrl?: string
    thumbnailUrl?: string
    releaseYear?: number | null
    genre?: string | null
    durationMins?: number | null
    availability?: string
    contentFilterEnabled?: boolean | null
    contentRating?: string | null
    contentWarnings?: string[] | null
    skipSegments?: Array<{ startMs: number; endMs: number; reason: string }> | null
  }
) {
  const media = await getMedia(id, { ownerId: userId })

  const updates: Prisma.MediaItemUpdateInput = {}
  if (data.title !== undefined) {
    const trimmed = data.title.trim()
    if (trimmed.length === 0) throw new MediaError("TITLE_REQUIRED", "Title is required", 400)
    if (trimmed.length > MEDIA_TITLE_MAX)
      throw new MediaError("TITLE_TOO_LONG", `Title must be ${MEDIA_TITLE_MAX} characters or fewer`, 400)
    updates.title = trimmed
  }
  if (data.description !== undefined) {
    if (data.description && data.description.length > MEDIA_DESCRIPTION_MAX)
      throw new MediaError("DESCRIPTION_TOO_LONG", "Description too long", 400)
    updates.description = data.description ? data.description.trim() : undefined
  }
  if (data.category !== undefined) updates.category = data.category
  if (data.originalUrl !== undefined) {
    const parsed = parseMediaUrl(data.originalUrl)
    if (!parsed) throw new MediaError("INVALID_URL", "Provide a valid https:// URL", 400)
    const detected = detectProvider(data.originalUrl)
    updates.originalUrl = parsed.url
    updates.providerId = detected?.providerId ?? PROVIDER_IDS.GENERIC
    updates.providerVideoId = detected?.videoId ?? undefined
    updates.accessMode = getProvider(updates.providerId as typeof PROVIDER_IDS.YOUTUBE).embedSupported
      ? MediaAccessMode.EMBED
      : MediaAccessMode.EXTERNAL
    updates.playbackMode = playbackModeFor(updates.providerId as typeof PROVIDER_IDS.YOUTUBE)
  }
  if (data.thumbnailUrl !== undefined) updates.thumbnailUrl = data.thumbnailUrl ? data.thumbnailUrl.trim() : undefined
  if (data.releaseYear !== undefined) updates.releaseYear = data.releaseYear
  if (data.genre !== undefined) updates.genre = data.genre ? data.genre.trim() : undefined
  if (data.durationMins !== undefined) updates.durationMins = data.durationMins
  if (data.availability !== undefined) updates.availability = data.availability as MediaAvailability
  if (data.contentFilterEnabled !== undefined && data.contentFilterEnabled !== null) {
    updates.contentFilterEnabled = data.contentFilterEnabled
  }
  if (data.contentRating !== undefined) updates.contentRating = data.contentRating ?? null
  if (data.contentWarnings !== undefined) {
    updates.contentWarnings = data.contentWarnings?.length
      ? JSON.stringify(data.contentWarnings)
      : null
  }
  if (data.skipSegments !== undefined) {
    updates.skipSegments = data.skipSegments?.length
      ? JSON.stringify(data.skipSegments)
      : null
  }

  return prisma.mediaItem.update({ where: { id }, data: updates })
}

export async function deleteMedia(id: string, userId: string) {
  await getMedia(id, { ownerId: userId })
  return prisma.mediaItem.delete({ where: { id } })
}

export async function incrementAccess(id: string) {
  return prisma.mediaItem.update({ where: { id }, data: {} }).catch(() => {
    // Best-effort: access tracking is non-critical.
    return null
  })
}
