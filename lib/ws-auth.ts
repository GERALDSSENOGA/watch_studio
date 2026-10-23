import { decode } from "@auth/core/jwt"

/**
 * Lightweight session validation for the WebSocket server.
 *
 * Decodes a next-auth JWT session cookie (`authjs.session-token`) using the
 * application secret, reusing @auth/core/jwt (the same library next-auth uses
 * to issue and verify sessions). This intentionally does not import the
 * next-auth HTTP layer (which transitively imports `next/server` and only
 * resolves inside the Next.js runtime), so the WebSocket server can run as a
 * standalone Node process.
 *
 * next-auth v5 requires JWT strategy for password credentials, so sessions are
 * self-contained encrypted JWTs rather than database rows. Session revocation
 * is achieved by rotating NEXTAUTH_SECRET (invalidates all sessions).
 */
export async function validateSessionToken(sessionToken: string) {
  if (!sessionToken) return null
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) return null
  try {
    // salt must match the cookie name next-auth uses to derive the encryption key
    let payload
    try {
      payload = await decode({ token: sessionToken, secret, salt: "authjs.session-token" })
    } catch {
      return null
    }
    if (!payload) return null
    // next-auth v5 JWT sessions store user fields at the top level of the
    // token payload (id, name, email, image, role, status), not nested under
    // `payload.user`.
    const { id, name, email, image, role } = payload as {
      id?: string
      name?: string | null
      email?: string | null
      image?: string | null
      role?: string
    }
    // decode() already verified the token signature and expiry; require only an
    // id to identify the user.
    if (!id) return null
    return {
      user: {
        id,
        name,
        email,
        image,
        role,
      },
    }
  } catch {
    // Invalid/expired token
    return null
  }
}
