import { describe, expect, it } from "vitest"
import { reusableGuestPeer } from "../../lib/webrtc/peer-reuse"

/**
 * Guest screen share: the host sends a new offer not only when a share starts
 * but also when it renegotiates an existing one (microphone, quality change,
 * ICE restart). Those offers must be answered on the connection already
 * receiving — rebuilding it gives both peers the same DTLS role, and Chrome
 * answers with "Failed to set SSL role for the transport".
 */

function peer(state: {
  signalingState?: RTCSignalingState
  connectionState?: RTCPeerConnectionState
}) {
  return {
    signalingState: state.signalingState ?? "stable",
    connectionState: state.connectionState ?? "connected",
  } as unknown as RTCPeerConnection
}

describe("reusableGuestPeer", () => {
  it("1. keeps the connection that is already receiving a share", () => {
    const pc = peer({ signalingState: "stable", connectionState: "connected" })
    expect(reusableGuestPeer(pc)).toBe(pc)
  })

  it("2. keeps a connection that is still negotiating", () => {
    const pc = peer({ signalingState: "have-remote-offer", connectionState: "connecting" })
    expect(reusableGuestPeer(pc)).toBe(pc)
  })

  it("3. keeps a connection that only briefly dropped", () => {
    const pc = peer({ connectionState: "disconnected" })
    expect(reusableGuestPeer(pc)).toBe(pc)
  })

  it("4. rebuilds when the connection was closed", () => {
    expect(reusableGuestPeer(peer({ signalingState: "closed" }))).toBeNull()
  })

  it("5. rebuilds when the connection failed", () => {
    expect(reusableGuestPeer(peer({ connectionState: "failed" }))).toBeNull()
  })

  it("6. rebuilds when there is no connection yet (first offer of a share)", () => {
    expect(reusableGuestPeer(null)).toBeNull()
  })
})
