import { describe, expect, it } from "vitest"
import { formatTimecode, parseTimecode } from "../../lib/timecode"

describe("parseTimecode", () => {
  it("1. reads M:SS copied from a player", () => {
    expect(parseTimecode("28:01")).toBe(1_681_000)
    expect(parseTimecode("0:00")).toBe(0)
    expect(parseTimecode("5:09")).toBe(309_000)
  })

  it("2. reads H:MM:SS", () => {
    expect(parseTimecode("1:28:01")).toBe(5_281_000)
  })

  it("3. accepts a bare number of seconds and fractional seconds", () => {
    expect(parseTimecode("1681")).toBe(1_681_000)
    expect(parseTimecode("28:01.5")).toBe(1_681_500)
  })

  it("4. tolerates surrounding whitespace", () => {
    expect(parseTimecode("  2:20:33  ")).toBe(8_433_000)
  })

  it("5. rejects input that is not a timecode", () => {
    expect(parseTimecode("")).toBeNull()
    expect(parseTimecode("abc")).toBeNull()
    expect(parseTimecode("1:2:3:4")).toBeNull()
    expect(parseTimecode("28:aa")).toBeNull()
  })
})

describe("formatTimecode", () => {
  it("6. renders milliseconds as M:SS", () => {
    expect(formatTimecode(1_681_000)).toBe("28:01")
    expect(formatTimecode(0)).toBe("0:00")
    expect(formatTimecode(9_000)).toBe("0:09")
  })

  it("7. renders past an hour as H:MM:SS", () => {
    expect(formatTimecode(5_281_000)).toBe("1:28:01")
  })

  it("8. round-trips a stored segment boundary", () => {
    expect(parseTimecode(formatTimecode(1_681_000))).toBe(1_681_000)
  })
})
