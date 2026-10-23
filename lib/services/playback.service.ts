import { Prisma, PlaybackState, PlaybackSessionStatus } from "@prisma/client"
import { prisma } from "../db.ts"
import { assertCanControlPlayback } from "./room.service.ts"

export class PlaybackError extends Error {
  public readonly code: string
  public readonly status: number
  constructor(code: string, message: string, status: number = 400) {
    super(message)
    this.code = code
    this.status = status
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

  const existing = await prisma.playbackSession.findFirst({
    where: { roomId: input.roomId, status: PlaybackSessionStatus.ACTIVE },
  })

  let session: any
  let justCreated = false
  if (existing) {
    session = existing
    // Optimistic concurrency: command must be built on the current version.
    if (input.command.version !== session.version)
      throw new PlaybackError("STALE_VERSION", "Command is based on an outdated playback state", 409)
  } else {
    // First command for this room creates the playback session, bound to the
    // room's currently selected media.
    const room = await prisma.watchRoom.findUnique({
      where: { id: input.roomId },
      select: {
        currentMediaId: true,
        currentMedia: { select: { providerId: true } },
      },
    })
    if (!room?.currentMediaId)
      throw new PlaybackError("NO_MEDIA", "No media selected for this room", 400)
    session = await prisma.playbackSession.create({
      data: {
        roomId: input.roomId,
        mediaId: room.currentMediaId,
        providerId: room.currentMedia?.providerId ?? "generic",
        state: PlaybackState.PAUSED,
        positionMs: 0,
        version: 1,
        status: PlaybackSessionStatus.ACTIVE,
      },
      include: { updatedBy: { select: { id: true, name: true } }, media: true },
    })
    justCreated = true
  }

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
