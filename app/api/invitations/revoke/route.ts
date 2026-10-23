import { z } from "zod"
import { auth } from "@/lib/auth"
import { revokeInvitation } from "@/lib/services/invitation.service"

const revokeSchema = z.object({
  invitationId: z.string().cuid(),
})

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Content-Type": "application/json" } })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  try {
    const body = await req.json()
    const parsed = revokeSchema.safeParse(body)
    if (!parsed.success) {
      return json({ code: "VALIDATION_ERROR", message: parsed.error.flatten().fieldErrors }, 400)
    }

    await revokeInvitation(parsed.data.invitationId, session.user.id)
    return json({ ok: true })
  } catch (err: any) {
    if (err?.code === "NOT_FOUND") return json({ code: err.code, message: err.message }, 404)
    if (err?.code === "FORBIDDEN") return json({ code: err.code, message: err.message }, 403)
    console.error("Invitation revocation failed:", err)
    return json({ code: "SERVER_ERROR", message: "Failed to revoke invitation" }, 500)
  }
}
