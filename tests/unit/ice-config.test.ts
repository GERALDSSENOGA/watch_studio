import { describe, expect, it } from "vitest"
import { DEFAULT_STUN_SERVERS, buildIceServers } from "@/lib/webrtc/ice-config"

describe("buildIceServers", () => {
  it("uses public STUN only when no TURN server is configured", () => {
    expect(buildIceServers({})).toEqual(DEFAULT_STUN_SERVERS)
  })

  it("adds a TURN relay with its long-term credentials", () => {
    const servers = buildIceServers({
      TURN_URL: "turn:turn.example.com:3478",
      TURN_USERNAME: "watchstudio",
      TURN_CREDENTIAL: "s3cret",
    })

    expect(servers).toEqual([
      ...DEFAULT_STUN_SERVERS,
      {
        urls: ["turn:turn.example.com:3478"],
        username: "watchstudio",
        credential: "s3cret",
      },
    ])
  })

  it("accepts several URLs with stray whitespace", () => {
    const servers = buildIceServers({
      TURN_URL: " turn:turn.example.com:3478 , turns:turn.example.com:5349 ",
      TURN_USERNAME: "user",
      TURN_CREDENTIAL: "pass",
    })

    expect(servers.at(-1)?.urls).toEqual([
      "turn:turn.example.com:3478",
      "turns:turn.example.com:5349",
    ])
  })

  it.each([
    ["missing username", { TURN_URL: "turn:t:3478", TURN_CREDENTIAL: "pass" }],
    ["missing credential", { TURN_URL: "turn:t:3478", TURN_USERNAME: "user" }],
    ["blank URL list", { TURN_URL: " , ", TURN_USERNAME: "user", TURN_CREDENTIAL: "pass" }],
  ])("falls back to STUN when the relay is half configured (%s)", (_label, env) => {
    expect(buildIceServers(env)).toEqual(DEFAULT_STUN_SERVERS)
  })
})
