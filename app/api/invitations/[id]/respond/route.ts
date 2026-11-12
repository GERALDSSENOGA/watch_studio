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
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const { id } = await params
  if (!id) return json({ code: "BAD_REQUEST", message: "Missing invitation id" }, 400)

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
      invitationId: id,
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
