import { z } from "zod"
import { auth } from "@/lib/auth"
import { createRoom, listRoomsForUser } from "@/lib/services/room.service"

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional().nullable(),
  currentMediaId: z.string().cuid().optional().nullable(),
  maxMembers: z.number().int().min(2).max(200).optional(),
})

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Content-Type": "application/json" } })
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const rooms = await listRoomsForUser(session.user.id)
  return json({ rooms })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  try {
    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return json(
        { code: "VALIDATION_ERROR", message: parsed.error.flatten().fieldErrors },
        400
      )
    }

    const room = await createRoom({
      hostId: session.user.id,
      name: parsed.data.name,
      description: parsed.data.description ?? undefined,
      currentMediaId: parsed.data.currentMediaId,
      maxMembers: parsed.data.maxMembers,
    })
    return json({ room }, 201)
  } catch (err: any) {
    if (err?.code === "NAME_REQUIRED" || err?.code === "NAME_TOO_LONG")
      return json({ code: err.code, message: err.message }, 400)
    console.error("Room creation failed:", err)
    return json({ code: "SERVER_ERROR", message: "Failed to create room" }, 500)
  }
}
