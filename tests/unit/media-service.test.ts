import { describe, it, expect, vi, beforeEach } from "vitest"

const { findUnique, create, update } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique },
    mediaItem: { findUnique, create, update },
    session: { findUnique },
  },
}))

import { parseMediaUrl } from "@/lib/url"
import { detectProvider, getProvider, PROVIDER_IDS } from "@/lib/providers"
import { createMedia, getMedia, listMedia, MediaError } from "@/lib/services/media.service"

describe("Media service validation (regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("createMedia", () => {
    it("rejects empty title", async () => {
      await expect(createMedia({
        ownerId: "user1",
        title: "   ",
        category: "MOVIE",
        originalUrl: "https://example.com/video.mp4",
      })).rejects.toMatchObject({ code: "TITLE_REQUIRED" })
    })

    it("rejects invalid URL scheme", async () => {
      await expect(createMedia({
        ownerId: "user1",
        title: "Test",
        category: "MOVIE",
        originalUrl: "javascript:alert(1)",
      })).rejects.toMatchObject({ code: "INVALID_URL" })
    })

    it("rejects file:// URLs", async () => {
      await expect(createMedia({
        ownerId: "user1",
        title: "Test",
        category: "MOVIE",
        originalUrl: "file:///etc/passwd",
      })).rejects.toMatchObject({ code: "INVALID_URL" })
    })

    it("creates media with valid YouTube URL", async () => {
      create.mockResolvedValueOnce({
        id: "media1",
        ownerId: "user1",
        title: "Test Video",
        originalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        providerId: "youtube",
      })

      const result = await createMedia({
        ownerId: "user1",
        title: "Test Video",
        category: "MOVIE",
        originalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      })

      expect(result.providerId).toBe("youtube")
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            providerId: "youtube",
            providerVideoId: "dQw4w9WgXcQ",
          }),
        }),
      )
    })

    it("creates media as external for non-embeddable providers", async () => {
      create.mockResolvedValueOnce({
        id: "media2",
        ownerId: "user1",
        title: "External Stream",
        originalUrl: "https://watch.skysports.com/live",
        providerId: "generic",
      })

      const result = await createMedia({
        ownerId: "user1",
        title: "External Stream",
        category: "MOVIE",
        originalUrl: "https://watch.skysports.com/live",
      })

      expect(result.providerId).toBe("generic")
    })
  })

  describe("getMedia", () => {
    it("returns media item when found", async () => {
      findUnique.mockResolvedValueOnce({
        id: "media1",
        ownerId: "user1",
        title: "Test",
      })

      const result = await getMedia("media1")
      expect(result.id).toBe("media1")
    })

    it("throws NOT_FOUND when media doesn't exist", async () => {
      findUnique.mockResolvedValueOnce(null)
      await expect(getMedia("nonexistent")).rejects.toMatchObject({
        code: "NOT_FOUND",
        status: 404,
      })
    })

    it("throws FORBIDDEN when owner mismatch", async () => {
      findUnique.mockResolvedValueOnce({
        id: "media1",
        ownerId: "other-user",
        title: "Test",
      })
      await expect(getMedia("media1", { ownerId: "user1" })).rejects.toMatchObject({
        code: "FORBIDDEN",
        status: 403,
      })
    })
  })
})

describe("Provider detection (regression)", () => {
  it("detects YouTube URLs", () => {
    expect(detectProvider("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.providerId).toBe("youtube")
    expect(detectProvider("https://youtu.be/dQw4w9WgXcQ")?.providerId).toBe("youtube")
    expect(detectProvider("https://www.youtube.com/embed/dQw4w9WgXcQ")?.providerId).toBe("youtube")
  })

  it("detects direct video files", () => {
    expect(detectProvider("https://example.com/video.mp4")?.providerId).toBe("direct-file")
    expect(detectProvider("https://example.com/video.webm")?.providerId).toBe("direct-file")
    expect(detectProvider("https://example.com/video.ogg")?.providerId).toBe("direct-file")
  })

  it("falls back to generic for unknown providers", () => {
    expect(detectProvider("https://watch.skysports.com/live")?.providerId).toBe("generic")
    expect(detectProvider("https://example.com/stream")?.providerId).toBe("generic")
  })

  it("YouTube supports sync and commands", () => {
    const yt = getProvider("youtube")
    expect(yt.syncSupported).toBe(true)
    expect(yt.commandsSupported).toBe(true)
    expect(yt.embedSupported).toBe(true)
    expect(yt.externalFallbackRequired).toBe(false)
  })

  it("Generic requires external fallback", () => {
    const gen = getProvider("generic")
    expect(gen.syncSupported).toBe(false)
    expect(gen.embedSupported).toBe(false)
    expect(gen.externalFallbackRequired).toBe(true)
  })
})

describe("URL validation (regression)", () => {
  it("accepts valid https URLs", () => {
    const result = parseMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    expect(result).not.toBeNull()
    expect(result?.url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
  })

  it("rejects empty and whitespace input", () => {
    expect(parseMediaUrl("")).toBeNull()
    expect(parseMediaUrl("   ")).toBeNull()
  })

  it("rejects unsafe schemes", () => {
    expect(parseMediaUrl("javascript:alert(1)")).toBeNull()
    expect(parseMediaUrl("data:text/html,<x>")).toBeNull()
    expect(parseMediaUrl("file:///etc/passwd")).toBeNull()
    expect(parseMediaUrl("ws://example.com/x")).toBeNull()
  })

  it("rejects IP-literal hosts", () => {
    expect(parseMediaUrl("https://127.0.0.1/x")).toBeNull()
    expect(parseMediaUrl("https://[::1]/x")).toBeNull()
  })
})
