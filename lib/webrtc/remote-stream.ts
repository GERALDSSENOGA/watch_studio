/**
 * Merge an incoming `ontrack` event into the MediaStream the UI renders.
 *
 * A screen share arrives as one `ontrack` event per track: the video track
 * first, then the tab's audio track. Every event carries the same remote
 * MediaStream in `event.streams[0]`. Building a fresh MediaStream for each
 * track (or holding the stream in React state, which is stale inside the
 * callback) ends up replacing the stream that holds the video with one that
 * only holds audio, which the UI shows as an empty, non-rendering video area.
 *
 * Reusing the browser-provided stream keeps every track in one stream, so the
 * `<video>` element keeps showing the shared screen while audio is added.
 */
export function mergeRemoteTrack(
  current: MediaStream | null,
  event: Pick<RTCTrackEvent, "track" | "streams">
): MediaStream {
  // Determine which stream to use as the base:
  // - If we already have a current stream with tracks, keep it (accumulate
  //   video + audio into the same object so the <video> element keeps
  //   rendering while audio is added).
  // - Otherwise, use the browser-supplied stream from event.streams[0].
  // - Otherwise, create a new one.
  let stream: MediaStream
  if (current && current.getTracks().length > 0) {
    stream = current
  } else {
    stream = event.streams[0] ?? new MediaStream()
  }

  const alreadyAttached = stream
    .getTracks()
    .some((track) => track.id === event.track.id)
  if (!alreadyAttached) stream.addTrack(event.track)

  return stream
}
