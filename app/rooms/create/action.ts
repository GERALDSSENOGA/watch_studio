"use server"

import { createRoom } from "@/lib/services/room.service"
import { auth } from "@/lib/auth"

export async function createRoomAction(formData: FormData) {
  const session = await auth()
  if (!session?.user) {
    return { error: "Not authenticated" }
  }

  const room = await createRoom({
    hostId: session.user.id,
    name: formData.get("name") as string,
    description: (formData.get("description") as string) || undefined,
    currentMediaId: (formData.get("media") as string) || undefined,
    maxMembers: Number(formData.get("maxMembers") || 50) || 50,
  })

  return { roomId: room.id }
}
