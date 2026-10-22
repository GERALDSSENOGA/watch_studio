import { auth } from "@/lib/auth"
import { getMessages, removeMessage } from "@/lib/services/chat.service"
import { assertMembership } from "@/lib/services/room.service"

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Content-Type": "application/json" } })
}

export async function GET(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const { roomId } = await params
  if (!roomId) return json({ code: "BAD_REQUEST", message: "Missing room id" }, 400)
  const { searchParams } = new URL(req.url)
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "50"), 1), 100)

  try {
    const messages = await getMessages({
      roomId,
      userId: session.user.id,
      limit,
      cursor: searchParams.get("cursor") || undefined,
    })
    return json({ messages, nextCursor: messages.length > limit ? messages[limit - 1]?.id : undefined })
  } catch (err: any) {
    if (err?.code === "NOT_MEMBER") return json({ code: err.code, message: err.message }, 403)
    return json({ code: "SERVER_ERROR", message: "Failed to load messages" }, 500)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const { roomId } = await params
  if (!roomId) return json({ code: "BAD_REQUEST", message: "Missing room id" }, 400)
  const { searchParams } = new URL(req.url)
  const messageId = searchParams.get("messageId")
  if (!messageId) return json({ code: "MISSING_MESSAGE", message: "messageId is required" }, 400)

  try {
    const role = await assertMembership(roomId, session.user.id)
    await removeMessage(messageId, session.user.id, role)
    return json({ ok: true })
  } catch (err: any) {
    if (err?.code === "NOT_MEMBER") return json({ code: err.code, message: err.message }, 403)
    if (err?.code === "NOT_FOUND") return json({ code: err.code, message: err.message }, 404)
    if (err?.code === "FORBIDDEN") return json({ code: err.code, message: err.message }, 403)
    return json({ code: "SERVER_ERROR", message: "Failed to remove message" }, 500)
  }
}
