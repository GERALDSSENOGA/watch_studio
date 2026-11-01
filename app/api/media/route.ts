import { z } from "zod"
import { auth } from "@/lib/auth"
import { createMedia, listMedia } from "@/lib/services/media.service"

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  category: z.enum(["MOVIE"]),
  originalUrl: z.string().min(1),
  thumbnailUrl: z.string().max(2000).optional().nullable(),
  homeTeam: z.string().max(100).optional().nullable(),
  awayTeam: z.string().max(100).optional().nullable(),
  competition: z.string().max(100).optional().nullable(),
  kickoffAt: z.string().datetime().optional().nullable(),
  matchStatus: z.string().max(50).optional().nullable(),
  releaseYear: z.number().int().min(1800).max(2100).optional().nullable(),
  genre: z.string().max(100).optional().nullable(),
  durationMins: z.number().int().min(1).optional().nullable(),
})

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Content-Type": "application/json" } })
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)

  const { searchParams } = new URL(req.url)
  const category = searchParams.get("category")
  const search = searchParams.get("search") || undefined
  const availability = searchParams.get("availability")
  const take = Math.min(Math.max(Number(searchParams.get("take") ?? "50"), 1), 100)

  const { items, total } = await listMedia(session.user.id, {
    category: (category ?? undefined) as "MOVIE" | undefined,
    search,
    availability: availability ?? undefined,
    take,
  })

  return json({ items, total, take })
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

    const media = await createMedia({
      ownerId: session.user.id,
      title: parsed.data.title,
      description: parsed.data.description ?? undefined,
      category: parsed.data.category,
      originalUrl: parsed.data.originalUrl,
      thumbnailUrl: parsed.data.thumbnailUrl ?? undefined,
      releaseYear: parsed.data.releaseYear ?? undefined,
      genre: parsed.data.genre ?? undefined,
      durationMins: parsed.data.durationMins ?? undefined,
    })
    return json({ media }, 201)
  } catch (err: any) {
    if (err?.code === "INVALID_URL") {
      return json({ code: err.code, message: err.message }, 400)
    }
    console.error("Media creation failed:", err)
    return json({ code: "SERVER_ERROR", message: "Failed to create media item" }, 500)
  }
}
