import { auth as nextAuth } from "@/lib/auth"

export const middleware = nextAuth

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
}
