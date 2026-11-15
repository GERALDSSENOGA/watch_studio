import { DEFAULT_STUN_SERVERS, type IceServerConfig } from "./ice-config"

/**
 * Browser-side ICE server list.
 *
 * Peers must ask for TURN credentials at runtime (they are supplied by the
 * deployment's environment, not baked into the bundle), so the room loads the
 * configuration up front and every peer connection reads whatever has arrived.
 * Until then — and if the request fails — peers use public STUN only.
 */

let iceServers: RTCIceServer[] = DEFAULT_STUN_SERVERS as RTCIceServer[]
let request: Promise<RTCIceServer[]> | null = null

export function getIceServers(): RTCIceServer[] {
  return iceServers
}

export function loadIceServers(): Promise<RTCIceServer[]> {
  if (!request) {
    request = fetch("/api/rtc/ice-servers", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { iceServers?: IceServerConfig[] } | null) => {
        if (Array.isArray(data?.iceServers) && data.iceServers.length > 0) {
          iceServers = data.iceServers as RTCIceServer[]
        }
        return iceServers
      })
      .catch(() => iceServers)
  }
  return request
}

// Warm the cache as soon as the room's screen-share code loads, so a share
// started seconds later already has the TURN relay available.
if (typeof window !== "undefined") {
  void loadIceServers()
}
