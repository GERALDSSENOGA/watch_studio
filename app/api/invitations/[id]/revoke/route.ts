import { auth } from "@/lib/auth"
import { revokeInvitation } from "@/lib/services/invitation.service"

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Content-Type": "application/json" } })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const { id } = await params
  try {
    await revokeInvitation(id, session.user.id)
    return json({ ok: true })
  } catch (err: any) {
    if (err?.code === "NOT_FOUND") return json({ code: err.code, message: err.message }, 404)
    if (err?.code === "FORBIDDEN") return json({ code: err.code, message: err.message }, 403)
    console.error("Invitation revocation failed:", err)
    return json({ code: "SERVER_ERROR", message: "Failed to revoke invitation" }, 500)
  }
}
