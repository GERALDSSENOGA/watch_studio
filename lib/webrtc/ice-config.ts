/**
 * ICE server (STUN/TURN) configuration for the WebRTC screen-share peers.
 *
 * Public STUN is not enough on restrictive networks (symmetric NAT, corporate
 * firewalls), where a relayed connection is the only way through. A TURN relay
 * is therefore configured through the environment and never in source:
 *
 *   TURN_URL        comma-separated turn:/turns: URLs, e.g.
 *                   "turn:turn.example.com:3478,turns:turn.example.com:5349"
 *   TURN_USERNAME   long-term credential username
 *   TURN_CREDENTIAL long-term credential password
 *
 * Without all three the peers fall back to public STUN only, which is the
 * previous behaviour.
 */

export interface IceServerConfig {
  urls: string | string[]
  username?: string
  credential?: string
}

export const DEFAULT_STUN_SERVERS: IceServerConfig[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
]

export function buildIceServers(
  env: Record<string, string | undefined> = process.env
): IceServerConfig[] {
  const urls = (env.TURN_URL ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean)
  const username = env.TURN_USERNAME?.trim()
  const credential = env.TURN_CREDENTIAL?.trim()

  // A TURN server without credentials is unusable, so never offer a half
  // configured relay to the browser.
  if (urls.length === 0 || !username || !credential) {
    return DEFAULT_STUN_SERVERS
  }

  return [...DEFAULT_STUN_SERVERS, { urls, username, credential }]
}
