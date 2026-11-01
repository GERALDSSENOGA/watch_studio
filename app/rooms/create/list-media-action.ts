"use server"

import { listMedia } from "@/lib/services/media.service"
import { auth } from "@/lib/auth"

export async function listMediaAction() {
  const session = await auth()
  if (!session?.user) {
    return { error: "Not authenticated" }
  }

  const result = await listMedia(session.user.id, { take: 100 })
  return { items: result.items }
}
