import { z } from "zod"
import { auth } from "@/lib/auth"
import { respondToInvitation } from "@/lib/services/invitation.service"

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Content-Type": "application/json" } })
}

const respondSchema = z.object({
  action: z.enum(["accept", "decline"]),
})

export async function POST(
  req: Request,
  // The segment folder is `[token]` to match the sibling route (Next.js
  // rejects two different slug names on the same dynamic path), but the
  // received-invitations UI sends the invitation id here.
  { params }: { params: Promise<{ token: string }> },
) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const { token } = await params
  if (!token) return json({ code: "BAD_REQUEST", message: "Missing invitation id" }, 400)

  try {
    const body = await req.json()
    const parsed = respondSchema.safeParse(body)
    if (!parsed.success) {
      return json(
        { code: "VALIDATION_ERROR", message: parsed.error.flatten().fieldErrors },
        400,
      )
    }

    const result = await respondToInvitation({
      invitationId: token,
      userId: session.user.id,
      action: parsed.data.action,
    })

    return json({ ok: true, ...result }, 200)
  } catch (err: any) {
    if (err?.code === "NOT_FOUND") return json({ code: err.code, message: err.message }, 404)
    if (err?.code === "FORBIDDEN") return json({ code: err.code, message: err.message }, 403)
    if (err?.code === "NOT_PENDING") return json({ code: err.code, message: err.message }, 400)
    if (err?.code === "CLOSED") return json({ code: err.code, message: err.message }, 403)
    if (err?.code === "ROOM_FULL") return json({ code: err.code, message: err.message }, 403)
    console.error("Invitation response failed:", err)
    return json({ code: "SERVER_ERROR", message: "Failed to respond to invitation" }, 500)
  }
}
