import { auth } from "@/lib/auth"
import { createInvitation, listSentInvitations } from "@/lib/services/invitation.service"

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Content-Type": "application/json" } })
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const invitations = await listSentInvitations(session.user.id)
  return json({ invitations })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  try {
    const body = await req.json()
    const { roomId, maxAgeMs } = body as { roomId?: string; maxAgeMs?: number }

    if (!roomId || typeof roomId !== "string") {
      return json({ code: "MISSING_ROOM", message: "roomId is required" }, 400)
    }

    const { invitation, token } = await createInvitation({ roomId, inviterId: session.user.id, maxAgeMs })

    // The plaintext token is returned once. It is never stored; only the hash is.
    return json({ invitation, token }, 201)
  } catch (err: any) {
    if (err?.code === "NOT_FOUND") return json({ code: err.code, message: err.message }, 404)
    if (err?.code === "FORBIDDEN") return json({ code: err.code, message: err.message }, 403)
    if (err?.code === "CLOSED") return json({ code: err.code, message: err.message }, 403)
    if (err?.code === "ROOM_FULL") return json({ code: err.code, message: err.message }, 403)
    if (err?.code === "RATE_LIMITED") return json({ code: err.code, message: err.message }, 429)
    console.error("Invitation creation failed:", err)
    return json({ code: "SERVER_ERROR", message: "Failed to create invitation" }, 500)
  }
}
