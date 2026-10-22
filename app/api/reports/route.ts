import { z } from "zod"
import { auth } from "@/lib/auth"
import { ReportStatus } from "@prisma/client"
import { prisma } from "@/lib/db"

const createSchema = z.object({
  mediaId: z.string().cuid().optional().nullable(),
  roomId: z.string().cuid().optional().nullable(),
  reason: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
})

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Content-Type": "application/json" } })
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

    if (!parsed.data.mediaId && !parsed.data.roomId) {
      return json({ code: "MISSING_TARGET", message: "Report a media item or a room" }, 400)
    }

    const report = await prisma.report.create({
      data: {
        reporterId: session.user.id,
        mediaId: parsed.data.mediaId,
        roomId: parsed.data.roomId,
        reason: parsed.data.reason,
        description: parsed.data.description,
      },
    })
    return json({ report }, 201)
  } catch (err: any) {
    console.error("Report creation failed:", err)
    return json({ code: "SERVER_ERROR", message: "Failed to create report" }, 500)
  }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401)
  if (session.user.role !== "admin") {
    return json({ code: "FORBIDDEN", message: "Administrator role required" }, 403)
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")
  const reports = await prisma.report.findMany({
    where: status ? { status: status as ReportStatus } : {},
    include: {
      reporter: { select: { id: true, name: true } },
      media: { select: { id: true, title: true } },
      room: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  })
  return json({ reports })
}
