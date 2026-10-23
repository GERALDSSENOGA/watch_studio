import NextAuth, { DefaultSession } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { compare } from "bcryptjs"
import { prisma } from "./db"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
      status: string
    } & DefaultSession["user"]
  }
}

/**
 * Auth.js (next-auth v5) configuration with the Prisma adapter.
 *
 * Sessions are database sessions (server-side): session tokens are stored and
 * validated in the `Session` table, not self-contained JWTs. This lets us
 * revoke sessions and keeps durable session state in PostgreSQL.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!email || !password) return null

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user || !user.passwordHash) return null

        const passwordValid = await compare(password, user.passwordHash)
        if (!passwordValid) return null
        if (user.status !== "active") return null

        return {
          id: user.id,
          name: user.name ?? undefined,
          email: user.email ?? undefined,
          image: user.image ?? undefined,
          role: user.role,
          status: user.status,
        }
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 }, // 30 days
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.id as string
      return session
    },
  },
})

/** Validate a raw NextAuth session token against the database (WebSocket auth). */
export async function validateSessionToken(sessionToken: string) {
  if (!sessionToken) return null
  const session = await prisma.session.findUnique({
    where: { sessionToken },
    include: { user: true },
  })
  if (!session) return null
  if (session.expires < new Date()) return null
  if (session.user.status !== "active") return null
  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
      role: session.user.role,
    },
  }
}
