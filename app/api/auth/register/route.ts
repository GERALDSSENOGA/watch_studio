import { hash } from "bcryptjs"
import { prisma } from "@/lib/db"

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Content-Type": "application/json" } })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, password, name } = body as {
      email?: string
      password?: string
      name?: string
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email || !emailRe.test(email)) {
      return json({ code: "INVALID_EMAIL", message: "Provide a valid email address" }, 400)
    }
    if (!password || password.length < 8) {
      return json({ code: "WEAK_PASSWORD", message: "Password must be at least 8 characters" }, 400)
    }
    if (name && name.length > 100) {
      return json({ code: "NAME_TOO_LONG", message: "Name must be 100 characters or fewer" }, 400)
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return json({ code: "EMAIL_IN_USE", message: "An account with this email already exists" }, 409)
    }

    const passwordHash = await hash(password, 10)
    const user = await prisma.user.create({
      data: { email, passwordHash, name: name?.trim() || null },
      select: { id: true, email: true, name: true, createdAt: true },
    })

    return json({ user }, 201)
  } catch (err) {
    console.error("Registration failed:", err)
    return json({ code: "SERVER_ERROR", message: "Registration failed" }, 500)
  }
}
