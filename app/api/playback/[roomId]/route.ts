import { z } from "zod"
import { auth } from "@/lib/auth"
import { getSession, applyCommand, type PlaybackCommand } from "@/lib/services/playback.service"

const commandSchema = z.object({
  action: z.enum(["play", "pause", "seek"]),
  positionMs: z.number().int().min(0).optional(),
  version: z.number().int().min(1),
})

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Content-Type": "application/json" } })
}

export async function GET(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const { roomId } = await params
  const playback = await getSession(roomId)
  if (!playback) return json({ code: "NO_SESSION", message: "No active playback session" }, 404)
  return json({ playback })
}

export async function POST(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const { roomId } = await params
  if (!roomId) return json({ code: "BAD_REQUEST", message: "Missing room id" }, 400)
  try {
    const body = await req.json()
    const parsed = commandSchema.safeParse(body)
    if (!parsed.success) {
      return json({ code: "VALIDATION_ERROR", message: parsed.error.flatten().fieldErrors }, 400)
    }

    const command: PlaybackCommand = {
      action: parsed.data.action,
      positionMs: parsed.data.positionMs,
      version: parsed.data.version,
    }
    const [updated] = await applyCommand({ roomId, userId: session.user.id, command })
    return json({ playback: updated })
  } catch (err: any) {
    if (err?.code === "NOT_FOUND" || err?.code === "NO_SESSION")
      return json({ code: err.code, message: err.message }, 404)
    if (err?.code === "FORBIDDEN") return json({ code: err.code, message: err.message }, 403)
    if (err?.code === "STALE_VERSION") return json({ code: err.code, message: err.message }, 409)
    console.error("Playback command failed:", err)
    return json({ code: "SERVER_ERROR", message: "Playback command rejected" }, 500)
  }
}
