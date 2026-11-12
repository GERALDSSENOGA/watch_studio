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

  it("parses video IDs from URLs with extra query parameters", () => {
    const result = detectProvider("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PLxyz")
    expect(result?.providerId).toBe(PROVIDER_IDS.YOUTUBE)
    expect(result?.videoId).toBe("dQw4w9WgXcQ")
  })

  it("parses video IDs regardless of host casing", () => {
    const result = detectProvider("https://WWW.YouTube.com/watch?v=dQw4w9WgXcQ")
    expect(result?.providerId).toBe(PROVIDER_IDS.YOUTUBE)
    expect(result?.videoId).toBe("dQw4w9WgXcQ")
  })

  it("parses youtu.be URLs with trailing query parameters", () => {
    const result = detectProvider("https://youtu.be/dQw4w9WgXcQ?t=1")
    expect(result?.providerId).toBe(PROVIDER_IDS.YOUTUBE)
    expect(result?.videoId).toBe("dQw4w9WgXcQ")
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

describe("FullMatchShows URLs", () => {
  it("detects fullmatchshows match page URLs", () => {
    const result = detectProvider(
      "https://fullmatchshows.com/fleetwood-town-vs-arsenal-full-match-replay-27-oct-2026/",
    )
    expect(result?.providerId).toBe(PROVIDER_IDS.FULLMATCHSHOWS)
    expect(result?.videoId).toBeUndefined()
  })

  it("detects fullmatchshows URLs with www", () => {
    const result = detectProvider(
      "https://www.fullmatchshows.com/leagues/premier-league/",
    )
    expect(result?.providerId).toBe(PROVIDER_IDS.FULLMATCHSHOWS)
  })

  it("detects fullmatchshows URLs without protocol", () => {
    const result = detectProvider("fullmatchshows.com/tag/arsenal/")
    expect(result?.providerId).toBe(PROVIDER_IDS.FULLMATCHSHOWS)
  })

  it("FullMatchShows requires external fallback, no sync or embed", () => {
    const fm = getProvider(PROVIDER_IDS.FULLMATCHSHOWS)
    expect(fm.name).toBe("FullMatchShows")
    expect(fm.syncSupported).toBe(false)
    expect(fm.embedSupported).toBe(false)
    expect(fm.commandsSupported).toBe(false)
    expect(fm.externalFallbackRequired).toBe(true)
  })
})

describe("SoccerFull URLs", () => {
  it("detects soccerfull match page URLs", () => {
    const result = detectProvider(
      "https://soccerfull.net/torreense-vs-ararat-armenia-4863.html",
    )
    expect(result?.providerId).toBe(PROVIDER_IDS.SOCCERFULL)
    expect(result?.videoId).toBeUndefined()
  })

  it("detects soccerfull URLs with www", () => {
    const result = detectProvider(
      "https://www.soccerfull.net/torreense-vs-ararat-armenia-4863.html",
    )
    expect(result?.providerId).toBe(PROVIDER_IDS.SOCCERFULL)
  })

  it("SoccerFull requires external fallback, no sync or embed", () => {
    const sf = getProvider(PROVIDER_IDS.SOCCERFULL)
    expect(sf.name).toBe("SoccerFull")
    expect(sf.syncSupported).toBe(false)
    expect(sf.embedSupported).toBe(false)
    expect(sf.commandsSupported).toBe(false)
    expect(sf.positionReadable).toBe(false)
    expect(sf.externalFallbackRequired).toBe(true)
  })
})

describe("Third-party video host URLs", () => {
  it.each([
    ["https://playmogo.com/d/uampvlo391x3", PROVIDER_IDS.PLAYMOGO],
    ["https://www.playmogo.com/d/olq82plnv4qa", PROVIDER_IDS.PLAYMOGO],
    ["https://vixeo.io/e/rGBD2QX9iCCd", PROVIDER_IDS.VIXEO],
    ["https://www.vixeo.io/e/9tu5OSu0ADpw", PROVIDER_IDS.VIXEO],
    ["https://vidaraa.cc/v/F66QQyn8SSZ8Y", PROVIDER_IDS.VIDARAA],
    ["https://www.vidaraa.cc/v/tC9wxpjdmqXev", PROVIDER_IDS.VIDARAA],
    ["https://fullmatchshows.embedseek.com/#suuazy", PROVIDER_IDS.EMBEDSEEK],
    ["https://embedseek.com/suuazy", PROVIDER_IDS.EMBEDSEEK],
    ["https://bysekoze.com/d/frv4a78mdtjm/joueur-8", PROVIDER_IDS.BYSEKOZE],
    ["https://www.bysekoze.com/d/2sauquh2sjd1/fleetwood-town-vs-arsenal-27-10-2026", PROVIDER_IDS.BYSEKOZE],
  ])("detects %s as %s", (url, expectedProviderId) => {
    const result = detectProvider(url)
    expect(result?.providerId).toBe(expectedProviderId)
    expect(result?.videoId).toBeUndefined()
  })

  it.each([
    [PROVIDER_IDS.PLAYMOGO, "Playmogo"],
    [PROVIDER_IDS.VIXEO, "Vixeo"],
    [PROVIDER_IDS.VIDARAA, "Vidaraa"],
    [PROVIDER_IDS.EMBEDSEEK, "EmbedSeek"],
    [PROVIDER_IDS.BYSEKOZE, "Bysekoze"],
  ])("reports %s capabilities", (providerId, expectedName) => {
    const p = getProvider(providerId)
    expect(p.name).toBe(expectedName)
    expect(p.syncSupported).toBe(false)
    expect(p.embedSupported).toBe(false)
    expect(p.commandsSupported).toBe(false)
    expect(p.positionReadable).toBe(false)
    expect(p.externalFallbackRequired).toBe(true)
  })
})
