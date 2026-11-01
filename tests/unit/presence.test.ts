import { describe, expect, it } from "vitest"
import { dedupePresenceByUser, userHasOtherConnection } from "../../lib/presence"

/**
 * Roles use the exact casing the server produces (RoomRole enum values from
 * assertMembership): "HOST" | "MODERATOR" | "MEMBER".
 */
function entry(userId: string, role = "MEMBER", userName = `${userId} Name`) {
  return { userId, userName, role }
}

describe("dedupePresenceByUser (presence shown per user, not per socket)", () => {
  it("1. one normal join creates one participant", () => {
    const result = dedupePresenceByUser([entry("user-1", "HOST")])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ userId: "user-1", role: "HOST" })
  })

  it("2. repeated joins for the same user do not duplicate the participant", () => {
    const result = dedupePresenceByUser([
      entry("user-1", "MEMBER"),
      entry("user-1", "MEMBER"),
      entry("user-1", "MEMBER"),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].userId).toBe("user-1")
  })

  it("3. reconnect entries (many sockets over time) collapse to one participant", () => {
    const sockets = [
      entry("user-1", "MEMBER"),
      entry("user-2", "MEMBER"),
      entry("user-1", "MEMBER"), // reconnect
      entry("user-1", "MEMBER"), // another reconnect
    ]
    const result = dedupePresenceByUser(sockets)
    expect(result.map((r) => r.userId).sort()).toEqual(["user-1", "user-2"])
  })

  it("4. two different users appear separately", () => {
    const result = dedupePresenceByUser([entry("alice", "HOST"), entry("bob", "MEMBER")])
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.userId).sort()).toEqual(["alice", "bob"])
  })

  it("5. multiple connections for one user collapse to a single entry with the highest-privilege role", () => {
    // Two tabs: one socket joined before a role promotion (MEMBER), the other
    // after (HOST). The displayed role must be the highest-privilege one.
    const result = dedupePresenceByUser([entry("user-1", "MEMBER"), entry("user-1", "HOST")])
    expect(result).toHaveLength(1)
    expect(result[0].role).toBe("HOST")
  })

  it("6. removing one of several connections for a user retains their presence", () => {
    // Simulates the server list AFTER one of the user's sockets closed: the
    // other socket for the same user is still in the room, so the snapshot
    // still contains the user and the client must not drop them.
    const afterOneSocketClosed = [entry("user-1", "MEMBER"), entry("user-2", "MEMBER")]
    const result = dedupePresenceByUser(afterOneSocketClosed)
    expect(result.some((r) => r.userId === "user-1")).toBe(true)
    expect(userHasOtherConnection(afterOneSocketClosed, "user-1")).toBe(true)
  })

  it("7. removing the final connection removes the user's presence", () => {
    const afterLastSocketClosed = [entry("user-2", "MEMBER")]
    const result = dedupePresenceByUser(afterLastSocketClosed)
    expect(result.some((r) => r.userId === "user-1")).toBe(false)
    expect(userHasOtherConnection(afterLastSocketClosed, "user-1")).toBe(false)
  })

  it("8. entries from different calls (rooms) are processed independently", () => {
    const roomA = dedupePresenceByUser([entry("alice", "HOST")])
    const roomB = dedupePresenceByUser([entry("bob", "MEMBER")])
    expect(roomA.map((r) => r.userId)).toEqual(["alice"])
    expect(roomB.map((r) => r.userId)).toEqual(["bob"])
  })

  it("9. duplicate input records render as one participant (unique React keys)", () => {
    // This is the exact shape that produced the duplicate-key warning in
    // components/room-presence.tsx: two records with the same userId.
    const duplicatedInput = [
      { userId: "cmvkn2qv1000074jsuzxmu5ky", userName: "Gerald Ssenoga", role: "MEMBER" },
      { userId: "cmvkn2qv1000074jsuzxmu5ky", userName: "Gerald Ssenoga", role: "MEMBER" },
    ]
    const result = dedupePresenceByUser(duplicatedInput)
    expect(result).toHaveLength(1)
    expect(new Set(result.map((r) => r.userId)).size).toBe(result.length)
  })

  it("entries without a userId are dropped (cannot be keyed)", () => {
    const result = dedupePresenceByUser([
      { userId: "", userName: "Ghost", role: "MEMBER" },
      entry("user-1", "MEMBER"),
    ])
    expect(result.map((r) => r.userId)).toEqual(["user-1"])
  })

  it("preserves the name of the first-seen entry for a user", () => {
    const result = dedupePresenceByUser([
      { userId: "user-1", userName: "First Seen", role: "MEMBER" },
      { userId: "user-1", userName: "Second Seen", role: "MEMBER" },
    ])
    expect(result[0].userName).toBe("First Seen")
  })
})
