/**
 * Pick the guest's peer connection for an incoming offer.
 *
 * A host renegotiation (late microphone, quality change, ICE restart) arrives
 * as another offer on the session the guest is already receiving. It has to be
 * answered on that same connection: a freshly built connection answering an
 * established one gives both sides the same DTLS role, which Chrome rejects
 * with "Failed to set SSL role for the transport" — the share then never
 * connects and every following negotiation fails the same way.
 *
 * Only a connection that is gone or dead has to be replaced.
 */
export function reusableGuestPeer(
  pc: RTCPeerConnection | null
): RTCPeerConnection | null {
  if (!pc) return null
  if (pc.signalingState === "closed") return null
  if (pc.connectionState === "failed") return null
  return pc
}
