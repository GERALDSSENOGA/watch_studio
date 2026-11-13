import { prisma } from "@/lib/db"

/**
 * List accounts for the invitation picker. Excludes the requester. When
 * roomId is provided, users already in that room are returned with
 * isMember: true so the picker can show them as unavailable.
 */
export async function listUsersForInvite({
  requesterId,
  roomId,
  take = 20,
}: {
  requesterId: string
  roomId?: string
  take?: number
}) {
  const memberIds = new Set<string>()
  if (roomId) {
    const members = await prisma.roomMember.findMany({
      where: { roomId },
      select: { userId: true },
    })
    for (const m of members) memberIds.add(m.userId)
  }

  const users = await prisma.user.findMany({
    where: {
      id: { not: requesterId },
      status: "active",
    },
    select: { id: true, name: true, image: true, status: true },
    orderBy: { name: "asc" },
    take,
  })

  return users.map((u) => ({ ...u, isMember: memberIds.has(u.id) }))
}
