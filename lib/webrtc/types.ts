/**
 * WebRTC screen-sharing signaling types.
 *
 * Messages flow over the existing WebSocket connection.
 * The host is the offerer; guests are answerers.
 * The server relays SDP/ICE between peers (mesh: host connects to every guest).
 */

export type WebRTCMessageType =
  | "webrtc.offer"
  | "webrtc.answer"
  | "webrtc.ice-candidate"
  | "webrtc.screen-share.started"
  | "webrtc.screen-share.stopped";

export interface WebRTCSignal {
  type: WebRTCMessageType;
  roomId: string;
  from: string; // sender userId
  to?: string; // target userId (undefined = broadcast to room)
  [key: string]: unknown;
}

/** Host → guest: session description offer. */
export interface WebRTCOffer extends WebRTCSignal {
  type: "webrtc.offer";
  sdp: string;
}

/** Guest → host: session description answer. */
export interface WebRTCAnswer extends WebRTCSignal {
  type: "webrtc.answer";
  sdp: string;
}

/** Peer → peer: ICE candidate. */
export interface WebRTCIceCandidate extends WebRTCSignal {
  type: "webrtc.ice-candidate";
  candidate: RTCIceCandidateInit;
}

/** Host → all: screen share status. */
export interface WebRTCScreenShareStatus extends WebRTCSignal {
  type: "webrtc.screen-share.started" | "webrtc.screen-share.stopped";
  streamId?: string;
}

export interface ScreenShareState {
  isSharing: boolean;
  localStream: MediaStream | null;
  error: string | null;
  peerCount: number;
}

export interface ScreenShareReceiveState {
  remoteStream: MediaStream | null;
  isSharing: boolean;
  sharerId: string | null;
  error: string | null;
}
