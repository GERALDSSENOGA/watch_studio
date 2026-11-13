import { auth } from "@/lib/auth"
import { listReceivedInvitations } from "@/lib/services/invitation.service"

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Content-Type": "application/json" } })
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const invitations = await listReceivedInvitations(session.user.id)
  return json({ invitations })
}
