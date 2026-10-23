import { Prisma, PlaybackSessionStatus, RoomRole, RoomStatus } from "@prisma/client"
import { prisma } from "../db.ts"

export class RoomError extends Error {
  public readonly code: string
  public readonly status: number
  constructor(code: string, message: string, status: number = 400) {
    super(message)
    this.code = code
    this.status = status
    this.name = "RoomError"
  }
}

export async function createRoom(input: {
  hostId: string
  name: string
  description?: string
  currentMediaId?: string | null
  maxMembers?: number
}) {
  const trimmed = input.name.trim()
  if (trimmed.length === 0) throw new RoomError("NAME_REQUIRED", "Room name is required", 400)
  if (trimmed.length > 120) throw new RoomError("NAME_TOO_LONG", "Room name must be 120 characters or fewer", 400)

  const room = await prisma.watchRoom.create({
    data: {
      hostId: input.hostId,
      name: trimmed,
      description: input.description?.trim() || null,
      currentMediaId: input.currentMediaId ?? null,
      maxMembers: input.maxMembers ?? 50,
    },
    include: { host: { select: { id: true, name: true, image: true } } },
  })
  // The host is automatically a member with the HOST role.
  await prisma.roomMember.create({
    data: { roomId: room.id, userId: input.hostId, role: RoomRole.HOST },
  })
  return room
}

export async function getRoom(id: string) {
  const room = await prisma.watchRoom.findUnique({
    where: { id },
    include: {
      host: { select: { id: true, name: true, image: true, status: true } },
      currentMedia: true,
      members: {
        include: { user: { select: { id: true, name: true, image: true, role: true, status: true } } },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      },
    },
  })
  if (!room) throw new RoomError("NOT_FOUND", "Room not found", 404)
  return room
}

export async function listRoomsForUser(userId: string) {
  return prisma.watchRoom.findMany({
    where: {
      OR: [{ hostId: userId }, { members: { some: { userId } } }],
      status: RoomStatus.ACTIVE,
    },
    include: {
      host: { select: { id: true, name: true } },
      currentMedia: true,
      _count: { select: { members: true } },
    },
    orderBy: { updatedAt: "desc" },
  })
}

export async function assertMembership(roomId: string, userId: string) {
  const membership = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: { role: true },
  })
  if (!membership) throw new RoomError("NOT_MEMBER", "You are not a member of this room", 403)
  return membership.role
}

export async function assertCanManage(roomId: string, userId: string) {
  const role = await assertMembership(roomId, userId)
  if (role !== RoomRole.HOST && role !== RoomRole.MODERATOR)
    throw new RoomError("FORBIDDEN", "Host or moderator role required", 403)
  return role
}

export async function assertCanControlPlayback(roomId: string, userId: string) {
  // Default policy: host controls playback. Moderators are delegated control;
  // this is the single authorization point for delegated controls and is
  // covered by tests in tests/unit/room.service.test.ts.
  const role = await assertMembership(roomId, userId)
  if (role !== RoomRole.HOST && role !== RoomRole.MODERATOR)
    throw new RoomError("FORBIDDEN", "Only the host or a moderator can control playback", 403)
  return role
}

export async function updateRoom(
  roomId: string,
  userId: string,
  data: { name?: string; description?: string; currentMediaId?: string | null; maxMembers?: number }
) {
  await assertCanManage(roomId, userId)
  const room = await prisma.watchRoom.findUnique({ where: { id: roomId } })
  if (!room) throw new RoomError("NOT_FOUND", "Room not found", 404)

  const updates: Prisma.WatchRoomUpdateInput = {}
  if (data.name !== undefined) {
    const trimmed = data.name.trim()
    if (trimmed.length === 0) throw new RoomError("NAME_REQUIRED", "Room name is required", 400)
    updates.name = trimmed
  }
  if (data.description !== undefined) updates.description = data.description.trim() || null
  if (data.currentMediaId !== undefined) updates.currentMedia = data.currentMediaId ? { connect: { id: data.currentMediaId } } : { disconnect: true }
  if (data.maxMembers !== undefined) updates.maxMembers = data.maxMembers

  return prisma.watchRoom.update({ where: { id: roomId }, data: updates })
}

export async function closeRoom(roomId: string, userId: string) {
  await assertCanManage(roomId, userId)
  return prisma.watchRoom.update({
    where: { id: roomId },
    data: { status: RoomStatus.CLOSED },
  })
}

export async function removeMember(roomId: string, actorId: string, targetUserId: string) {
  const actorRole = await assertCanManage(roomId, actorId)
  const target = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId: targetUserId } },
  })
  if (!target) throw new RoomError("NOT_MEMBER", "User is not a member of this room", 404)
  if (target.userId === actorId) throw new RoomError("SELF_REMOVE", "Use leave instead", 400)
  if (target.role === RoomRole.HOST) throw new RoomError("FORBIDDEN", "Cannot remove the room host", 403)
  // A moderator cannot demote/remove another moderator; only the host can.
  if (target.role === RoomRole.MODERATOR && actorRole !== RoomRole.HOST)
    throw new RoomError("FORBIDDEN", "Only the host can remove a moderator", 403)

  return prisma.roomMember.delete({ where: { id: target.id } })
}

export async function leaveRoom(roomId: string, userId: string) {
  const role = await assertMembership(roomId, userId)
  if (role === RoomRole.HOST)
    throw new RoomError("HOST_LEAVE", "The host must close the room instead of leaving", 400)
  return prisma.roomMember.delete({ where: { roomId_userId: { roomId, userId } } })
}

export async function setMemberRole(roomId: string, actorId: string, targetUserId: string, role: RoomRole) {
  const actorRole = await assertCanManage(roomId, actorId)
  if (actorRole !== RoomRole.HOST)
    throw new RoomError("FORBIDDEN", "Only the host can change member roles", 403)

  const target = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId: targetUserId } },
  })
  if (!target) throw new RoomError("NOT_MEMBER", "User is not a member of this room", 404)
  if (target.role === RoomRole.HOST) throw new RoomError("FORBIDDEN", "The host role cannot be changed", 403)
  if (role === RoomRole.HOST)
    throw new RoomError("FORBIDDEN", "The host role cannot be assigned", 403)
  if (actorId === targetUserId)
    throw new RoomError("SELF_DEMOTE", "The host cannot demote themselves", 400)

  return prisma.roomMember.update({ where: { id: target.id }, data: { role } })
}

export async function listMembers(roomId: string, requesterId: string) {
  await assertMembership(roomId, requesterId)
  return prisma.roomMember.findMany({
    where: { roomId },
    include: { user: { select: { id: true, name: true, image: true, status: true } } },
    orderBy: { role: "asc", joinedAt: "asc" },
  })
}

export async function touchPresence(roomId: string, userId: string) {
  return prisma.roomMember.update({
    where: { roomId_userId: { roomId, userId } },
    data: { lastSeenAt: new Date() },
  }).catch(() => {
    // Presence tracking is ephemeral; never fail a connection over it.
    return null
  })
}
