// @vitest-environment happy-dom
import * as React from "react"
import { describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { ScreenShareControls } from "../../components/screen-share-controls"

/**
 * The share pill sits inside an overlay marked `pointer-events-none` so the
 * video underneath stays free; the pill itself must re-enable pointer events
 * or none of its buttons ever receive a click (the "buttons do nothing" bug).
 */

function streamWith(kinds: Array<"audio" | "video">) {
  const tracks = kinds.map((kind, index) => ({
    kind,
    id: `${kind}-${index}`,
    enabled: true,
  })) as unknown as MediaStreamTrack[]
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
  } as unknown as MediaStream
}

function setup(overrides: Partial<React.ComponentProps<typeof ScreenShareControls>> = {}) {
  const handlers = {
    onToggleMute: vi.fn(),
    onVolumeChange: vi.fn(),
    onToggleFullscreen: vi.fn(),
    onStop: vi.fn(),
    onToggleMic: vi.fn(),
  }
  const props: React.ComponentProps<typeof ScreenShareControls> = {
    stream: streamWith(["video", "audio"]),
    isMuted: false,
    volume: 1,
    isFullscreen: false,
    hasAudio: true,
    connectionState: "connected",
    hasMic: true,
    isMicMuted: false,
    ...handlers,
    ...overrides,
  }
  const view = render(React.createElement(ScreenShareControls, props))
  return { ...view, handlers, props }
}

describe("ScreenShareControls", () => {
  it("keeps its pill clickable inside the pointer-events-none overlay", () => {
    const { getByLabelText } = setup()
    const pill = getByLabelText("Mute audio").closest(".pointer-events-auto")
    expect(pill).not.toBeNull()
    cleanup()
  })

  it("toggles shared audio, microphone and fullscreen", () => {
    const { getByLabelText, handlers } = setup()

    fireEvent.click(getByLabelText("Mute audio"))
    expect(handlers.onToggleMute).toHaveBeenCalledTimes(1)

    fireEvent.click(getByLabelText("Mute microphone"))
    expect(handlers.onToggleMic).toHaveBeenCalledTimes(1)

    fireEvent.click(getByLabelText("Enter fullscreen"))
    expect(handlers.onToggleFullscreen).toHaveBeenCalledTimes(1)

    fireEvent.click(getByLabelText("Stop sharing"))
    expect(handlers.onStop).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it("shows the microphone as off before it is started", () => {
    const { getByLabelText } = setup({ hasMic: false, isMicMuted: false })
    const mic = getByLabelText("Start microphone")
    expect(mic.getAttribute("aria-pressed")).toBe("true")
    cleanup()
  })

  it("swaps to the unmute actions while muted", () => {
    const { getByLabelText } = setup({ isMuted: true, isMicMuted: true })
    expect(getByLabelText("Unmute audio").getAttribute("aria-pressed")).toBe("true")
    expect(getByLabelText("Unmute microphone").getAttribute("aria-pressed")).toBe("true")
    cleanup()
  })
})
