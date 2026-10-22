import { describe, it, expect } from "vitest"
import { parseMediaUrl, isSupportedUrlScheme } from "@/lib/url"

describe("parseMediaUrl", () => {
  it("accepts https URLs", () => {
    const result = parseMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    expect(result?.url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    expect(result?.origin).toBe("https://www.youtube.com")
  })

  it("rejects empty input", () => {
    expect(parseMediaUrl("")).toBeNull()
    expect(parseMediaUrl("   ")).toBeNull()
  })

  it("rejects unsafe schemes", () => {
    expect(parseMediaUrl("javascript:alert(1)")).toBeNull()
    expect(parseMediaUrl("data:text/html,<x>")).toBeNull()
    expect(parseMediaUrl("file:///etc/passwd")).toBeNull()
    expect(parseMediaUrl("ws://example.com/x")).toBeNull()
    expect(parseMediaUrl("mailto:a@b.c")).toBeNull()
  })

  it("rejects IP-literal hosts", () => {
    expect(parseMediaUrl("https://127.0.0.1/x")).toBeNull()
    expect(parseMediaUrl("https://[::1]/x")).toBeNull()
  })
})

describe("isSupportedUrlScheme", () => {
  it("returns true only for https", () => {
    expect(isSupportedUrlScheme("https://example.com")).toBe(true)
    expect(isSupportedUrlScheme("http://example.com")).toBe(false)
    expect(isSupportedUrlScheme("javascript:alert(1)")).toBe(false)
    expect(isSupportedUrlScheme("not-a-url")).toBe(false)
  })
})
