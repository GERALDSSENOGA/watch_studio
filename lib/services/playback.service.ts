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
  const session = await prisma.playbackSession.findFirst({
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

/**
 * Effective playback position for a session. `positionMs` is the position at
 * `updatedAt`; while a session is PLAYING the real position keeps advancing,
 * so consumers that broadcast or serve playback state must add the elapsed
 * time. Without this, playing clients drift past the (frozen) server position
 * and periodic reconciliation would seek them backwards every few seconds.
 */
export function effectivePositionMs(session: {
  state: PlaybackState
  positionMs: number
  updatedAt: Date
}): number {
  if (session.state !== PlaybackState.PLAYING) return session.positionMs
  const elapsedMs = Math.max(0, Date.now() - new Date(session.updatedAt).getTime())
  return session.positionMs + elapsedMs
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

  let justCreated = existing === null
  let session: any = existing
  if (existing) {
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
