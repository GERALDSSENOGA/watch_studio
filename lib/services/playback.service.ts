import { Prisma, PlaybackState, PlaybackSessionStatus } from "@prisma/client"
import { prisma } from "@/lib/db"
import { assertCanControlPlayback } from "@/lib/services/room.service"

export class PlaybackError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number = 400) {
    super(message)
    this.name = "PlaybackError"
  }
}

export async function getOrCreateSession(input: {
  roomId: string
  mediaId: string
  providerId: string
}) {
  let session = await prisma.playbackSession.findFirst({
    where: { roomId: input.roomId, status: PlaybackSessionStatus.ACTIVE },
    include: { media: true, updatedBy: { select: { id: true, name: true } } },
  })
  if (session) return session

  return prisma.playbackSession.create({
    data: {
      roomId: input.roomId,
      mediaId: input.mediaId,
      providerId: input.providerId,
      state: PlaybackState.PAUSED,
      positionMs: 0,
      version: 1,
      status: PlaybackSessionStatus.ACTIVE,
    },
    include: { media: true, updatedBy: { select: { id: true, name: true } } },
  })
}

export async function getSession(roomId: string) {
  return prisma.playbackSession.findFirst({
    where: { roomId, status: PlaybackSessionStatus.ACTIVE },
    include: { media: true, updatedBy: { select: { id: true, name: true } } },
  })
}

export type PlaybackCommand =
  | { action: "play"; positionMs?: number; version: number }
  | { action: "pause"; positionMs?: number; version: number }
  | { action: "seek"; positionMs?: number; version: number }

export async function applyCommand(input: {
  roomId: string
  userId: string
  command: PlaybackCommand
}) {
  await assertCanControlPlayback(input.roomId, input.userId)

  const session = await prisma.playbackSession.findFirst({
    where: { roomId: input.roomId, status: PlaybackSessionStatus.ACTIVE },
  })
  if (!session) throw new PlaybackError("NO_SESSION", "No active playback session for this room", 404)

  // Optimistic concurrency: command must be built on the current version.
  if (input.command.version !== session.version)
    throw new PlaybackError("STALE_VERSION", "Command is based on an outdated playback state", 409)

  const positionMs =
    input.command.action === "seek" ? input.command.positionMs : input.command.positionMs ?? session.positionMs

  const data: Prisma.PlaybackSessionUpdateInput = {
    state: input.command.action === "pause" ? PlaybackState.PAUSED : PlaybackState.PLAYING,
    positionMs,
    version: { increment: 1 },
    updatedBy: { connect: { id: input.userId } },
    updatedAt: new Date(),
  }

  return prisma.$transaction([
    prisma.playbackSession.update({
      where: { id: session.id },
      data,
      include: { updatedBy: { select: { id: true, name: true } }, media: true },
    }),
  ])
}

export async function endSession(roomId: string, userId: string) {
  await assertCanControlPlayback(roomId, userId)
  const session = await prisma.playbackSession.findFirst({
    where: { roomId, status: PlaybackSessionStatus.ACTIVE },
  })
  if (!session) return null
  return prisma.playbackSession.update({
    where: { id: session.id },
    data: { status: PlaybackSessionStatus.ENDED },
  })
}
