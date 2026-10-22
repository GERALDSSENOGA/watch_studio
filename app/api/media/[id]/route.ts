import { z } from "zod"
import { auth } from "@/lib/auth"
import { getMedia, updateMedia, deleteMedia } from "@/lib/services/media.service"

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Content-Type": "application/json" } })
}

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  category: z.enum(["FOOTBALL", "MOVIE"]).optional(),
  originalUrl: z.string().min(1).optional(),
  thumbnailUrl: z.string().max(2000).optional().nullable(),
  homeTeam: z.string().max(100).optional().nullable(),
  awayTeam: z.string().max(100).optional().nullable(),
  competition: z.string().max(100).optional().nullable(),
  kickoffAt: z.string().datetime().optional().nullable(),
  matchStatus: z.string().max(50).optional().nullable(),
  releaseYear: z.number().int().min(1800).max(2100).optional().nullable(),
  genre: z.string().max(100).optional().nullable(),
  durationMins: z.number().int().min(1).optional().nullable(),
  availability: z.enum(["AVAILABLE", "UNAVAILABLE", "BREAKING", "REMOVED"]).optional(),
})

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const { id } = await params
  if (!id) return json({ code: "BAD_REQUEST", message: "Missing media id" }, 400)
  try {
    const media = await getMedia(id, { ownerId: session.user.id })
    return json({ media })
  } catch (err: any) {
    if (err?.code === "NOT_FOUND") return json({ code: err.code, message: err.message }, 404)
    if (err?.code === "FORBIDDEN") return json({ code: err.code, message: err.message }, 403)
    return json({ code: "SERVER_ERROR", message: "Failed to load media item" }, 500)
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const { id } = await params
  if (!id) return json({ code: "BAD_REQUEST", message: "Missing media id" }, 400)
  try {
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return json(
        { code: "VALIDATION_ERROR", message: parsed.error.flatten().fieldErrors },
        400
      )
    }

    const media = await updateMedia(id, session.user.id, {
      title: parsed.data.title,
      description: parsed.data.description ?? undefined,
      category: parsed.data.category,
      originalUrl: parsed.data.originalUrl,
      thumbnailUrl: parsed.data.thumbnailUrl ?? undefined,
      homeTeam: parsed.data.homeTeam ?? undefined,
      awayTeam: parsed.data.awayTeam ?? undefined,
      competition: parsed.data.competition ?? undefined,
      kickoffAt: parsed.data.kickoffAt ?? undefined,
      matchStatus: parsed.data.matchStatus ?? undefined,
      releaseYear: parsed.data.releaseYear ?? undefined,
      genre: parsed.data.genre ?? undefined,
      durationMins: parsed.data.durationMins ?? undefined,
      availability: parsed.data.availability,
    })
    return json({ media })
  } catch (err: any) {
    if (err?.code === "NOT_FOUND") return json({ code: err.code, message: err.message }, 404)
    if (err?.code === "FORBIDDEN") return json({ code: err.code, message: err.message }, 403)
    if (err?.code === "INVALID_URL") return json({ code: err.code, message: err.message }, 400)
    console.error("Media update failed:", err)
    return json({ code: "SERVER_ERROR", message: "Failed to update media item" }, 500)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const { id } = await params
  if (!id) return json({ code: "BAD_REQUEST", message: "Missing media id" }, 400)
  try {
    await deleteMedia(id, session.user.id)
    return json({ ok: true })
  } catch (err: any) {
    if (err?.code === "NOT_FOUND") return json({ code: err.code, message: err.message }, 404)
    if (err?.code === "FORBIDDEN") return json({ code: err.code, message: err.message }, 403)
    console.error("Media deletion failed:", err)
    return json({ code: "SERVER_ERROR", message: "Failed to delete media item" }, 500)
  }
}
