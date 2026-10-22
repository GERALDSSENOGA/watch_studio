import crypto from "crypto"
import { InvitationStatus, RoomRole } from "@prisma/client"
import { hash, compare } from "bcryptjs"
import { prisma } from "@/lib/db"
import { RateLimiter } from "@/lib/rate-limiter"
import { assertMembership, assertCanManage } from "@/lib/services/room.service"

export class InvitationError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number = 400) {
    super(message)
    this.name = "InvitationError"
  }
}

// Rate limits (ephemeral, in-memory; Redis in multi-process production).
const invitationCreateLimiter = new RateLimiter(10, 60 * 1000)   // 10 per minute per inviter
const invitationAcceptLimiter = new RateLimiter(20, 60 * 1000)   // 20 per minute per invitee
const failedAttemptLimiter = new RateLimiter(10, 15 * 60 * 1000) // 10 failed accepts per 15 min per token

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

/**
 * Create a secure invitation for a room.
 *
 * The plaintext token is returned to the caller exactly once and is never
 * stored: only its bcrypt hash (`tokenHash`) is persisted, so a database
 * leak does not expose reusable invitation secrets.
 */
export async function createInvitation(input: {
  roomId: string
  inviterId: string
  maxAgeMs?: number
}) {
  const rate = invitationCreateLimiter.check(`invitation:create:${input.inviterId}`)
  if (!rate.allowed) {
    throw new InvitationError("RATE_LIMITED", "Too many invitations. Try again later.", 429)
  }

  await assertCanManage(input.roomId, input.inviterId)

  const room = await prisma.watchRoom.findUnique({
    where: { id: input.roomId },
    select: { id: true, status: true, maxMembers: true, members: { select: { userId: true } } },
  })
  if (!room) throw new InvitationError("NOT_FOUND", "Room not found", 404)
  if (room.status !== "ACTIVE") throw new InvitationError("CLOSED", "Cannot invite to a closed room", 403)
  if (room.members.length >= room.maxMembers)
    throw new InvitationError("ROOM_FULL", "Room is at capacity", 403)

  const token = generateToken()
  const tokenHash = await hash(token, 10)
  const tokenExpiresAt = new Date(Date.now() + (input.maxAgeMs ?? INVITATION_TTL_MS))

  const invitation = await prisma.invitation.create({
    data: {
      roomId: input.roomId,
      inviterId: input.inviterId,
      tokenHash,
      tokenExpiresAt,
      status: InvitationStatus.PENDING,
    },
    select: { id: true, roomId: true, createdAt: true, tokenExpiresAt: true },
  })

  return { invitation, token }
}

/**
 * Accept an invitation. Runs in a transaction:
 *   1. find candidate pending non-expired invitations for the room
 *   2. bcrypt-compare the plaintext token against stored hashes
 *   3. mark invitation accepted, create membership, link invitee
 *
 * Never joins a user to a private room without a valid, unexpired token.
 */
export async function acceptInvitation(input: { token: string; userId: string }) {
  const rate = invitationAcceptLimiter.check(`invitation:accept:${input.userId}`)
  if (!rate.allowed) {
    throw new InvitationError("RATE_LIMITED", "Too many acceptance attempts. Try again later.", 429)
  }

  const now = new Date()
  const candidates = await prisma.invitation.findMany({
    where: {
      status: InvitationStatus.PENDING,
      tokenExpiresAt: { gt: now },
      room: { status: "ACTIVE" },
    },
    include: { room: { select: { id: true, name: true, maxMembers: true, members: { select: { userId: true } } } } },
  })

  let matched: (typeof candidates)[number] | null = null
  for (const candidate of candidates) {
    const valid = await compare(input.token, candidate.tokenHash)
    if (valid) { matched = candidate; break }
  }

  if (!matched) {
    await failedAttemptLimiter.check(`invitation:fail:${input.token.slice(0, 8)}`)
    throw new InvitationError("INVALID", "Invitation is invalid, expired, or already used", 404)
  }

  const room = matched.room
  const alreadyMember = room.members.some((m) => m.userId === input.userId)
  if (alreadyMember) {
    throw new InvitationError("ALREADY_MEMBER", "You are already a member of this room", 409)
  }
  if (room.members.length >= room.maxMembers) {
    throw new InvitationError("ROOM_FULL", "Room is at capacity", 403)
  }

  return prisma.$transaction(async (tx) => {
    const invitation = await tx.invitation.update({
      where: { id: matched.id },
      data: {
        status: InvitationStatus.ACCEPTED,
        acceptedAt: now,
        inviteeId: input.userId,
      },
    })

    const membership = await tx.roomMember.create({
      data: {
        roomId: room.id,
        userId: input.userId,
        role: room.members.length === 0 ? RoomRole.HOST : RoomRole.MEMBER,
      },
      include: { user: { select: { id: true, name: true, image: true } } },
    })

    return { invitation, membership }
  })
}

export async function revokeInvitation(invitationId: string, userId: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
    include: { room: true },
  })
  if (!invitation) throw new InvitationError("NOT_FOUND", "Invitation not found", 404)

  const requesterRole = await assertCanManage(invitation.roomId, userId)
  if (invitation.inviterId !== userId && requesterRole !== "HOST")
    throw new InvitationError("FORBIDDEN", "Only the host or the inviter can revoke this invitation", 403)

  return prisma.invitation.update({
    where: { id: invitationId },
    data: { status: InvitationStatus.REVOKED, revokedAt: new Date(), revokedById: userId },
  })
}

export async function listSentInvitations(inviterId: string) {
  return prisma.invitation.findMany({
    where: { inviterId },
    include: {
      room: { select: { id: true, name: true, status: true } },
      invitee: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function getInvitationStatus(token: string) {
  const now = new Date()
  const candidates = await prisma.invitation.findMany({
    where: { room: { status: "ACTIVE" } },
    include: { room: { select: { id: true, name: true } } },
  })
  for (const c of candidates) {
    const valid = await compare(token, c.tokenHash)
    if (valid) {
      return {
        id: c.id,
        roomId: c.roomId,
        roomName: c.room.name,
        status: c.status,
        expiresAt: c.tokenExpiresAt,
        expired: c.tokenExpiresAt < now,
      }
    }
  }
  return null
}
