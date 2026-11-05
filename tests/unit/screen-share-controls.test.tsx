// @vitest-environment happy-dom
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import {
  ScreenShareControls,
  type ScreenShareControlsProps,
} from "@/components/screen-share-controls"

/** Minimal stand-in for a captured MediaStream: only what the bar reads. */
function makeStream({ audio = true } = {}): MediaStream {
  const track = {
    kind: "audio",
    enabled: true,
    stop: () => {},
  } as unknown as MediaStreamTrack
  return {
    getTracks: () => (audio ? [track] : []),
  } as unknown as MediaStream
}

function setup(overrides: Partial<ScreenShareControlsProps> = {}) {
  const handlers = {
    onToggleMute: vi.fn(),
    onVolumeChange: vi.fn(),
    onToggleFullscreen: vi.fn(),
    onStop: vi.fn(),
    onToggleMic: vi.fn(),
  }
  const props: ScreenShareControlsProps = {
    stream: makeStream(),
    isMuted: false,
    volume: 0.6,
    isFullscreen: false,
    hasAudio: true,
    connectionState: "connected",
    hasMic: true,
    isMicMuted: false,
    ...handlers,
    ...overrides,
  }
  render(<ScreenShareControls {...props} />)
  return handlers
}

afterEach(cleanup)

describe("ScreenShareControls", () => {
  it("mutes shared audio", () => {
    const { onToggleMute } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Mute audio" }))
    expect(onToggleMute).toHaveBeenCalledTimes(1)
  })

  it("unmutes shared audio and says so while muted", () => {
    const { onToggleMute } = setup({ isMuted: true })
    fireEvent.click(screen.getByRole("button", { name: "Unmute audio" }))
    expect(onToggleMute).toHaveBeenCalledTimes(1)
    expect(screen.getByText("Muted")).toBeTruthy()
  })

  it("drives the volume slider", () => {
    const { onVolumeChange } = setup()
    expect(screen.getByText("60%")).toBeTruthy()
    fireEvent.change(screen.getByRole("slider", { name: "Shared audio volume" }), {
      target: { value: "0.3" },
    })
    expect(onVolumeChange).toHaveBeenCalledWith(0.3)
  })

  it("hides the volume group where volume cannot be controlled", () => {
    setup({ showVolume: false })
    expect(screen.queryByRole("slider", { name: "Shared audio volume" })).toBeNull()
    // Muting the shared audio itself stays available.
    expect(screen.getByRole("button", { name: "Mute audio" })).toBeTruthy()
  })

  it("starts the microphone on the first press instead of being dead", () => {
    const { onToggleMic } = setup({ hasMic: false, isMicMuted: false })
    const mic = screen.getByRole("button", { name: "Start microphone" })
    expect((mic as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(mic)
    expect(onToggleMic).toHaveBeenCalledTimes(1)
  })

  it("mutes the microphone", () => {
    const { onToggleMic } = setup({ hasMic: true, isMicMuted: false })
    fireEvent.click(screen.getByRole("button", { name: "Mute microphone" }))
    expect(onToggleMic).toHaveBeenCalledTimes(1)
  })

  it("unmutes the microphone", () => {
    const { onToggleMic } = setup({ hasMic: true, isMicMuted: true })
    fireEvent.click(screen.getByRole("button", { name: "Unmute microphone" }))
    expect(onToggleMic).toHaveBeenCalledTimes(1)
  })

  it("toggles fullscreen and flips its label", () => {
    const { onToggleFullscreen } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }))
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1)
  })

  it("exits fullscreen", () => {
    const { onToggleFullscreen } = setup({ isFullscreen: true })
    fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }))
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1)
  })

  it("stops sharing", () => {
    const { onStop } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Stop sharing" }))
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it("disables the audio toggle when nothing was captured", () => {
    setup({ stream: makeStream({ audio: false }), hasAudio: false })
    expect(
      (screen.getByRole("button", { name: "Mute audio" }) as HTMLButtonElement).disabled
    ).toBe(true)
  })
})
