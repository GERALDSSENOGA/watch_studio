import { auth } from "@/lib/auth"
import { acceptInvitation, getInvitationStatus } from "@/lib/services/invitation.service"

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Content-Type": "application/json" } })
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const status = await getInvitationStatus(token)
  if (!status) return json({ code: "NOT_FOUND", message: "Invitation not found" }, 404)
  return json({ status })
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const { token } = await params
  if (!token || typeof token !== "string") {
    return json({ code: "MISSING_TOKEN", message: "Invitation token is required" }, 400)
  }

  try {
    const { invitation, membership } = await acceptInvitation({ token, userId: session.user.id })
    return json({ invitation, membership }, 200)
  } catch (err: any) {
    if (err?.code === "INVALID") return json({ code: err.code, message: err.message }, 404)
    if (err?.code === "EXPIRED") return json({ code: err.code, message: err.message }, 410)
    if (err?.code === "REVOKED") return json({ code: err.code, message: err.message }, 410)
    if (err?.code === "ALREADY_MEMBER") return json({ code: err.code, message: err.message }, 409)
    if (err?.code === "ROOM_FULL") return json({ code: err.code, message: err.message }, 403)
    if (err?.code === "RATE_LIMITED") return json({ code: err.code, message: err.message }, 429)
    console.error("Invitation acceptance failed:", err)
    return json({ code: "SERVER_ERROR", message: "Failed to accept invitation" }, 500)
  }
}
