import { describe, it, expect, vi, beforeEach } from "vitest"

const { findUniqueMock, findFirstMock, createMock, updateMock, deleteMock, transactionMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  findFirstMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  transactionMock: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  prisma: {
    roomMember: { findUnique: findUniqueMock, create: createMock, update: updateMock, delete: deleteMock },
    watchRoom: { findUnique: findUniqueMock, findFirst: findFirstMock },
    playbackSession: { findFirst: findFirstMock, create: createMock, update: updateMock },
    user: { findUnique: findUniqueMock },
    $transaction: transactionMock,
  },
}))

import { RoomRole } from "@prisma/client"
import {
  assertMembership,
  assertCanManage,
  assertCanControlPlayback,
  setMemberRole,
  removeMember,
  leaveRoom,
} from "@/lib/services/room.service"
import { applyCommand, PlaybackError } from "@/lib/services/playback.service"

describe("Room authorization (regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("assertMembership", () => {
    it("returns role for member", async () => {
      findUniqueMock.mockResolvedValueOnce({ role: RoomRole.MEMBER })
      const role = await assertMembership("room1", "user1")
      expect(role).toBe(RoomRole.MEMBER)
    })

    it("throws NOT_MEMBER when not a member", async () => {
      findUniqueMock.mockResolvedValueOnce(null)
      await expect(assertMembership("room1", "user1")).rejects.toMatchObject({
        code: "NOT_MEMBER",
        status: 403,
      })
    })
  })

  describe("assertCanManage", () => {
    it("allows host", async () => {
      findUniqueMock.mockResolvedValueOnce({ role: RoomRole.HOST })
      const role = await assertCanManage("room1", "user1")
      expect(role).toBe(RoomRole.HOST)
    })

    it("allows moderator", async () => {
      findUniqueMock.mockResolvedValueOnce({ role: RoomRole.MODERATOR })
      const role = await assertCanManage("room1", "user1")
      expect(role).toBe(RoomRole.MODERATOR)
    })

    it("rejects member", async () => {
      findUniqueMock.mockResolvedValueOnce({ role: RoomRole.MEMBER })
      await expect(assertCanManage("room1", "user1")).rejects.toMatchObject({
        code: "FORBIDDEN",
        status: 403,
      })
    })
  })

  describe("assertCanControlPlayback", () => {
    it("allows host", async () => {
      findUniqueMock.mockResolvedValueOnce({ role: RoomRole.HOST })
      const role = await assertCanControlPlayback("room1", "user1")
      expect(role).toBe(RoomRole.HOST)
    })

    it("allows moderator", async () => {
      findUniqueMock.mockResolvedValueOnce({ role: RoomRole.MODERATOR })
      const role = await assertCanControlPlayback("room1", "user1")
      expect(role).toBe(RoomRole.MODERATOR)
    })

    it("rejects member", async () => {
      findUniqueMock.mockResolvedValueOnce({ role: RoomRole.MEMBER })
      await expect(assertCanControlPlayback("room1", "user1")).rejects.toMatchObject({
        code: "FORBIDDEN",
        status: 403,
      })
    })
  })

  describe("setMemberRole", () => {
    it("allows host to assign moderator role", async () => {
      findUniqueMock
        .mockResolvedValueOnce({ role: RoomRole.HOST }) // actor check
        .mockResolvedValueOnce({ id: "membership", role: RoomRole.MEMBER }) // target check
      updateMock.mockResolvedValueOnce({ id: "membership", role: RoomRole.MODERATOR })

      const result = await setMemberRole("room1", "host", "member", RoomRole.MODERATOR)
      expect(result.role).toBe(RoomRole.MODERATOR)
      expect(updateMock).toHaveBeenCalledWith({
        where: { id: "membership" },
        data: { role: RoomRole.MODERATOR },
      })
    })

    it("rejects moderator assigning roles", async () => {
      findUniqueMock.mockResolvedValueOnce({ role: RoomRole.MODERATOR })
      await expect(setMemberRole("room1", "moderator", "member", RoomRole.MODERATOR))
        .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 })
      expect(updateMock).not.toHaveBeenCalled()
    })

    it("rejects assigning host role to non-host", async () => {
      findUniqueMock
        .mockResolvedValueOnce({ role: RoomRole.HOST }) // actor
        .mockResolvedValueOnce({ id: "membership", role: RoomRole.MEMBER }) // target
      await expect(setMemberRole("room1", "host", "member", RoomRole.HOST))
        .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 })
    })
  })

  describe("removeMember", () => {
    it("allows host to remove member", async () => {
      findUniqueMock
        .mockResolvedValueOnce({ role: RoomRole.HOST }) // actor can manage
        .mockResolvedValueOnce({ userId: "target", role: RoomRole.MEMBER }) // target exists
      deleteMock.mockResolvedValueOnce({ id: "membership" })

      await removeMember("room1", "host", "target")
      expect(deleteMock).toHaveBeenCalled()
    })

    it("rejects removing the host (different actor)", async () => {
      findUniqueMock
        .mockResolvedValueOnce({ role: RoomRole.HOST }) // actor can manage
        .mockResolvedValueOnce({ userId: "target-host", role: RoomRole.HOST }) // target is host
      await expect(removeMember("room1", "moderator", "target-host")).rejects.toMatchObject({
        code: "FORBIDDEN",
        status: 403,
      })
    })

    it("rejects self-remove (actor equals target)", async () => {
      findUniqueMock
        .mockResolvedValueOnce({ role: RoomRole.HOST }) // actor can manage
        .mockResolvedValueOnce({ userId: "user1", role: RoomRole.HOST }) // target exists
      await expect(removeMember("room1", "user1", "user1")).rejects.toMatchObject({
        code: "SELF_REMOVE",
        status: 400,
      })
    })
  })

  describe("leaveRoom", () => {
    it("allows member to leave", async () => {
      findUniqueMock.mockResolvedValueOnce({ role: RoomRole.MEMBER })
      deleteMock.mockResolvedValueOnce({ id: "membership" })
      await leaveRoom("room1", "user1")
      expect(deleteMock).toHaveBeenCalledWith({
        where: { roomId_userId: { roomId: "room1", userId: "user1" } },
      })
    })

    it("rejects host leaving", async () => {
      findUniqueMock.mockResolvedValueOnce({ role: RoomRole.HOST })
      await expect(leaveRoom("room1", "host")).rejects.toMatchObject({
        code: "HOST_LEAVE",
        status: 400,
      })
    })
  })
})

describe("Playback command versioning (regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("applyCommand", () => {
    const mockSession = {
      id: "session1",
      roomId: "room1",
      version: 1,
      state: "PAUSED",
      positionMs: 0,
      media: { id: "media1", title: "Test", providerId: "youtube" },
      updatedBy: { id: "user1", name: "User 1" },
    }

    it("rejects non-member", async () => {
      findUniqueMock.mockResolvedValueOnce(null)
      await expect(applyCommand({
        roomId: "room1",
        userId: "user1",
        command: { action: "play", version: 1 },
      })).rejects.toMatchObject({ code: "NOT_MEMBER" })
    })

    it("rejects member controlling playback", async () => {
      findUniqueMock.mockResolvedValueOnce({ role: RoomRole.MEMBER })
      await expect(applyCommand({
        roomId: "room1",
        userId: "user1",
        command: { action: "play", version: 1 },
      })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 })
    })

    it("rejects stale version", async () => {
      // Chain: membership findUnique → HOST, session findFirst → version 1
      findUniqueMock.mockResolvedValueOnce({ role: RoomRole.HOST })
      findFirstMock.mockResolvedValueOnce(mockSession)

      await expect(applyCommand({
        roomId: "room1",
        userId: "host",
        command: { action: "play", version: 99 },
      })).rejects.toMatchObject({ code: "STALE_VERSION", status: 409 })
    })

    it("rejects command when no media selected", async () => {
      // Chain: membership → HOST, session → null, room → no media
      findUniqueMock.mockResolvedValueOnce({ role: RoomRole.HOST })
      findFirstMock.mockResolvedValueOnce(null)
      findUniqueMock.mockResolvedValueOnce({ currentMediaId: null })

      await expect(applyCommand({
        roomId: "room1",
        userId: "host",
        command: { action: "play", version: 1 },
      })).rejects.toMatchObject({ code: "NO_MEDIA", status: 400 })
    })

    it("creates session and applies command for host", async () => {
      // Chain: membership → HOST, session → null, room → has media
      findUniqueMock.mockResolvedValueOnce({ role: RoomRole.HOST })
      findFirstMock.mockResolvedValueOnce(null)
      findUniqueMock.mockResolvedValueOnce({ currentMediaId: "media1", currentMedia: { providerId: "youtube" } })
      createMock.mockResolvedValueOnce(mockSession)
      transactionMock.mockResolvedValueOnce([{ ...mockSession, version: 2, state: "PLAYING" }])

      const result = await applyCommand({
        roomId: "room1",
        userId: "host",
        command: { action: "play", version: 1 },
      })

      expect(result[0].version).toBe(2)
      expect(result[0].state).toBe("PLAYING")
    })

    it("increments version on each command", async () => {
      const sessionV2 = { ...mockSession, version: 2 }

      // Chain: membership → HOST, session → version 2
      findUniqueMock.mockResolvedValueOnce({ role: RoomRole.HOST })
      findFirstMock.mockResolvedValueOnce(sessionV2)
      transactionMock.mockResolvedValueOnce([{ ...sessionV2, version: 3, state: "PAUSED" }])

      const result = await applyCommand({
        roomId: "room1",
        userId: "host",
        command: { action: "pause", version: 2 },
      })

      expect(result[0].version).toBe(3)
      expect(result[0].state).toBe("PAUSED")
    })
  })
})

describe("PlaybackError (regression)", () => {
  it("has code, status, and message", () => {
    const err = new PlaybackError("STALE_VERSION", "Outdated state", 409)
    expect(err.code).toBe("STALE_VERSION")
    expect(err.status).toBe(409)
    expect(err.message).toBe("Outdated state")
    expect(err.name).toBe("PlaybackError")
  })
})
