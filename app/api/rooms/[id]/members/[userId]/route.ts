import { z } from "zod"
import { auth } from "@/lib/auth"
import { removeMember, leaveRoom, listMembers, setMemberRole } from "@/lib/services/room.service"

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Content-Type": "application/json" } })
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const { id, userId: requesterId } = await params
  if (!id || !requesterId) return json({ code: "BAD_REQUEST", message: "Missing ids" }, 400)
  try {
    const members = await listMembers(id, requesterId)
    return json({ members })
  } catch (err: any) {
    if (err?.code === "NOT_MEMBER") return json({ code: err.code, message: err.message }, 403)
    if (err?.code === "NOT_FOUND") return json({ code: err.code, message: err.message }, 404)
    return json({ code: "SERVER_ERROR", message: "Failed to load members" }, 500)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const { id, userId: targetUserId } = await params
  if (!id || !targetUserId) return json({ code: "BAD_REQUEST", message: "Missing ids" }, 400)
  const self = targetUserId === session.user.id

  try {
    if (self) {
      await leaveRoom(id, session.user.id)
    } else {
      await removeMember(id, session.user.id, targetUserId)
    }
    return json({ ok: true })
  } catch (err: any) {
    if (err?.code === "NOT_MEMBER") return json({ code: err.code, message: err.message }, 403)
    if (err?.code === "NOT_FOUND") return json({ code: err.code, message: err.message }, 404)
    if (err?.code === "FORBIDDEN") return json({ code: err.code, message: err.message }, 403)
    if (err?.code === "HOST_LEAVE") return json({ code: err.code, message: err.message }, 400)
    if (err?.code === "SELF_REMOVE") return json({ code: err.code, message: err.message }, 400)
    console.error("Membership change failed:", err)
    return json({ code: "SERVER_ERROR", message: "Failed to update membership" }, 500)
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const { id, userId: targetUserId } = await params
  if (!id || !targetUserId) return json({ code: "BAD_REQUEST", message: "Missing ids" }, 400)
  try {
    const body = await req.json()
    const parsed = z.object({ role: z.enum(["HOST", "MODERATOR", "MEMBER"]) }).safeParse(body)
    if (!parsed.success) {
      return json({ code: "VALIDATION_ERROR", message: parsed.error.flatten().fieldErrors }, 400)
    }

    await setMemberRole(id, session.user.id, targetUserId, parsed.data.role)
    return json({ ok: true })
  } catch (err: any) {
    if (err?.code === "NOT_MEMBER") return json({ code: err.code, message: err.message }, 404)
    if (err?.code === "FORBIDDEN") return json({ code: err.code, message: err.message }, 403)
    if (err?.code === "SELF_DEMOTE") return json({ code: err.code, message: err.message }, 400)
    console.error("Role change failed:", err)
    return json({ code: "SERVER_ERROR", message: "Failed to update role" }, 500)
  }
}
