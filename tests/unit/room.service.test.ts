import { beforeEach, describe, expect, it, vi } from "vitest"
import { RoomRole } from "@prisma/client"

const { findUnique, update } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  prisma: { roomMember: { findUnique, update } },
}))

import { setMemberRole } from "@/lib/services/room.service"

describe("setMemberRole", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("does not allow moderators to change member roles", async () => {
    findUnique.mockResolvedValueOnce({ role: RoomRole.MODERATOR })

    await expect(setMemberRole("room", "moderator", "member", RoomRole.MEMBER))
      .rejects.toMatchObject({ code: "FORBIDDEN" })

    expect(findUnique).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
  })

  it("does not allow the host to promote a member to host", async () => {
    findUnique
      .mockResolvedValueOnce({ role: RoomRole.HOST })
      .mockResolvedValueOnce({ id: "membership", role: RoomRole.MEMBER })

    await expect(setMemberRole("room", "host", "member", RoomRole.HOST))
      .rejects.toMatchObject({ code: "FORBIDDEN" })

    expect(update).not.toHaveBeenCalled()
  })

  it("allows the host to assign a non-host role to a member", async () => {
    findUnique
      .mockResolvedValueOnce({ role: RoomRole.HOST })
      .mockResolvedValueOnce({ id: "membership", role: RoomRole.MEMBER })
    update.mockResolvedValueOnce({ id: "membership", role: RoomRole.MODERATOR })

    await expect(setMemberRole("room", "host", "member", RoomRole.MODERATOR))
      .resolves.toEqual({ id: "membership", role: RoomRole.MODERATOR })

    expect(update).toHaveBeenCalledWith({
      where: { id: "membership" },
      data: { role: RoomRole.MODERATOR },
    })
  })
})
