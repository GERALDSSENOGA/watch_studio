/**
 * A peer connection that can still carry the share.
 *
 * Only a connection that is gone or dead has to be replaced; answering an
 * offer on a rebuilt connection while the other side keeps its established
 * one gives both peers the same DTLS role, which Chrome rejects with
 * "Failed to set SSL role for the transport" — the share then never connects
 * and every following negotiation fails the same way.
 */
export function isLivePeer(
  pc: RTCPeerConnection | null | undefined
): pc is RTCPeerConnection {
  if (!pc) return false
  if (pc.signalingState === "closed") return false
  if (pc.connectionState === "failed") return false
  return true
}

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
  return isLivePeer(pc) ? pc : null
}
