import { auth } from "@/lib/auth"
import { listUsersForInvite } from "@/lib/services/user.service"

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Content-Type": "application/json" } })
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const { searchParams } = new URL(req.url)
  const roomId = searchParams.get("roomId") || undefined
  const take = Math.min(Math.max(Number(searchParams.get("take") ?? "20"), 1), 50)

  const users = await listUsersForInvite({
    requesterId: session.user.id,
    roomId,
    take,
  })

  return json({ users })
}
