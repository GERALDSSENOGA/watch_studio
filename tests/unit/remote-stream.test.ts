import { describe, expect, it } from "vitest"
import { mergeRemoteTrack } from "../../lib/webrtc/remote-stream"

/**
 * Screen-share receiving: the browser fires one `ontrack` event per track
 * (video first, then the shared tab's audio) and every event references the
 * same remote MediaStream. The UI must render that one stream so adding audio
 * never drops the video track — the regression that left viewers with an
 * empty video area.
 */

function track(id: string, kind: "video" | "audio") {
  return { id, kind } as unknown as MediaStreamTrack
}

function streamContainer(initial: MediaStreamTrack[] = []) {
  const tracks = [...initial]
  return {
    stream: {
      getTracks: () => tracks,
      addTrack: (t: MediaStreamTrack) => tracks.push(t),
    } as unknown as MediaStream,
    tracks,
  }
}

describe("mergeRemoteTrack", () => {
  it("1. video then audio stay in the same stream (video is not replaced)", () => {
    const { stream, tracks } = streamContainer()
    const video = track("v1", "video")
    const audio = track("a1", "audio")

    const afterVideo = mergeRemoteTrack(null, { track: video, streams: [stream] })
    const afterAudio = mergeRemoteTrack(afterVideo, { track: audio, streams: [stream] })

    expect(afterAudio).toBe(afterVideo)
    expect(afterAudio).toBe(stream)
    expect(tracks.map((t) => t.kind)).toEqual(["video", "audio"])
  })

  it("2. a stream supplied by the browser wins over the previously held one", () => {
    const { stream: first } = streamContainer()
    const { stream: second } = streamContainer()
    const video = track("v2", "video")

    const result = mergeRemoteTrack(first, { track: video, streams: [second] })

    expect(result).toBe(second)
    expect(result.getTracks()).toContain(video)
  })

  it("3. the same track arriving twice is only added once", () => {
    const { stream, tracks } = streamContainer()
    const video = track("v3", "video")

    mergeRemoteTrack(null, { track: video, streams: [stream] })
    const result = mergeRemoteTrack(stream, { track: video, streams: [stream] })

    expect(result.getTracks()).toHaveLength(1)
    expect(tracks).toHaveLength(1)
  })
})
