import { z } from "zod"
import { auth } from "@/lib/auth"
import { getRoom, updateRoom, closeRoom } from "@/lib/services/room.service"

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).optional().nullable(),
  currentMediaId: z.string().cuid().optional().nullable(),
  maxMembers: z.number().int().min(2).max(200).optional(),
})

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Content-Type": "application/json" } })
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const { id } = await params
  if (!id) return json({ code: "BAD_REQUEST", message: "Missing room id" }, 400)
  try {
    const room = await getRoom(id)
    const isMember = room.members.some((m) => m.userId === session.user!.id)
    if (!isMember) return json({ code: "NOT_MEMBER", message: "You are not a member of this room" }, 403)
    return json({ room })
  } catch (err: any) {
    if (err?.code === "NOT_FOUND") return json({ code: err.code, message: err.message }, 404)
    return json({ code: "SERVER_ERROR", message: "Failed to load room" }, 500)
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const { id } = await params
  if (!id) return json({ code: "BAD_REQUEST", message: "Missing room id" }, 400)
  try {
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return json(
        { code: "VALIDATION_ERROR", message: parsed.error.flatten().fieldErrors },
        400
      )
    }

    const room = await updateRoom(id, session.user.id, {
      name: parsed.data.name,
      description: parsed.data.description ?? undefined,
      currentMediaId: parsed.data.currentMediaId,
      maxMembers: parsed.data.maxMembers,
    })
    return json({ room })
  } catch (err: any) {
    if (err?.code === "NOT_FOUND") return json({ code: err.code, message: err.message }, 404)
    if (err?.code === "FORBIDDEN") return json({ code: err.code, message: err.message }, 403)
    console.error("Room update failed:", err)
    return json({ code: "SERVER_ERROR", message: "Failed to update room" }, 500)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const { id } = await params
  if (!id) return json({ code: "BAD_REQUEST", message: "Missing room id" }, 400)
  try {
    await closeRoom(id, session.user.id)
    return json({ ok: true })
  } catch (err: any) {
    if (err?.code === "NOT_FOUND") return json({ code: err.code, message: err.message }, 404)
    if (err?.code === "FORBIDDEN") return json({ code: err.code, message: err.message }, 403)
    console.error("Room close failed:", err)
    return json({ code: "SERVER_ERROR", message: "Failed to close room" }, 500)
  }
}

/** Membership sub-resource: DELETE /api/rooms/[id]/members/[userId] */
export async function _members() {
  // Handled by app/api/rooms/[id]/members/[userId]/route.ts
  return json({ ok: true }, 404)
}
