import { prisma } from "@/lib/db"

/**
 * List users for the invitation picker. Excludes the requester and users
 * who are already members of the given room (if roomId is provided).
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
  const memberIds: string[] = []
  if (roomId) {
    const members = await prisma.roomMember.findMany({
      where: { roomId },
      select: { userId: true },
    })
    memberIds.push(...members.map((m) => m.userId))
  }

  return prisma.user.findMany({
    where: {
      id: { not: requesterId, notIn: memberIds },
      status: "active",
    },
    select: { id: true, name: true, image: true, status: true },
    orderBy: { name: "asc" },
    take,
  })
}
