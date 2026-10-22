import { describe, it, expect } from "vitest"
import {
  detectProvider,
  getProvider,
  PROVIDER_IDS,
  youtubeEmbedUrl,
  youtubeWatchUrl,
} from "@/lib/providers"

describe("detectProvider", () => {
  it("detects YouTube watch URLs", () => {
    const result = detectProvider("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    expect(result?.providerId).toBe(PROVIDER_IDS.YOUTUBE)
    expect(result?.videoId).toBe("dQw4w9WgXcQ")
  })

  it("detects youtu.be short URLs", () => {
    const result = detectProvider("https://youtu.be/dQw4w9WgXcQ")
    expect(result?.providerId).toBe(PROVIDER_IDS.YOUTUBE)
    expect(result?.videoId).toBe("dQw4w9WgXcQ")
  })

  it("detects YouTube embed URLs", () => {
    const result = detectProvider("https://www.youtube.com/embed/dQw4w9WgXcQ")
    expect(result?.providerId).toBe(PROVIDER_IDS.YOUTUBE)
  })

  it("falls back to generic for unknown URLs", () => {
    const result = detectProvider("https://example.com/stream/123")
    expect(result?.providerId).toBe(PROVIDER_IDS.GENERIC)
    expect(result?.videoId).toBeUndefined()
  })
})

describe("getProvider", () => {
  it("returns YouTube capabilities", () => {
    const p = getProvider(PROVIDER_IDS.YOUTUBE)
    expect(p.name).toBe("YouTube")
    expect(p.embedSupported).toBe(true)
    expect(p.syncSupported).toBe(true)
    expect(p.commandsSupported).toBe(true)
    expect(p.positionReadable).toBe(true)
    expect(p.externalFallbackRequired).toBe(false)
  })

  it("returns generic fallback for unknown id", () => {
    const p = getProvider("does-not-exist" as any)
    expect(p.id).toBe(PROVIDER_IDS.GENERIC)
    expect(p.syncSupported).toBe(false)
    expect(p.externalFallbackRequired).toBe(true)
  })
})

describe("youtube URLs", () => {
  it("builds embed and watch URLs", () => {
    expect(youtubeEmbedUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    )
    expect(youtubeWatchUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    )
  })
})
