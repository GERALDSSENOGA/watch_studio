import { prisma } from "../db.ts"
import { assertMembership } from "./room.service.ts"

export class ChatError extends Error {
  public readonly code: string
  public readonly status: number
  constructor(code: string, message: string, status: number = 400) {
    super(message)
    this.code = code
    this.status = status
    this.name = "ChatError"
  }
}

export const CHAT_BODY_MAX = 1000

export async function createMessage(input: {
  roomId: string
  userId: string
  userName: string
  body: string
}) {
  await assertMembership(input.roomId, input.userId)

  const body = input.body.trim()
  if (body.length === 0) throw new ChatError("EMPTY", "Message must not be empty", 400)
  if (body.length > CHAT_BODY_MAX)
    throw new ChatError("TOO_LONG", `Message must be ${CHAT_BODY_MAX} characters or fewer`, 400)

  return prisma.chatMessage.create({
    data: {
      roomId: input.roomId,
      userId: input.userId,
      body,
    },
    include: { user: { select: { id: true, name: true, image: true } } },
  })
}

export async function getMessages(input: {
  roomId: string
  userId: string
  limit?: number
  cursor?: string
}) {
  await assertMembership(input.roomId, input.userId)

  return prisma.chatMessage.findMany({
    where: { roomId: input.roomId, moderation: "OK" },
    include: { user: { select: { id: true, name: true, image: true } } },
    orderBy: { createdAt: "desc" },
    take: (input.limit ?? 50) + 1,
    cursor: input.cursor ? { id: input.cursor } : undefined,
  })
}

export async function removeMessage(messageId: string, actorId: string, actorRole: string) {
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    include: { room: true },
  })
  if (!message) throw new ChatError("NOT_FOUND", "Message not found", 404)
  if (message.userId !== actorId && actorRole !== "HOST" && actorRole !== "MODERATOR")
    throw new ChatError("FORBIDDEN", "You cannot remove this message", 403)

  return prisma.chatMessage.update({
    where: { id: messageId },
    data: { body: "[message removed]", moderation: "REMOVED" },
  })
}
