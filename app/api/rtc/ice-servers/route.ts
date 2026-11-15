import { auth } from "@/lib/auth"
import { buildIceServers } from "@/lib/webrtc/ice-config"

export const dynamic = "force-dynamic"

/**
 * ICE servers for the browser's peer connections, including the TURN relay
 * when one is configured (TURN_URL / TURN_USERNAME / TURN_CREDENTIAL).
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ code: "UNAUTHORIZED", message: "Sign in required" }, { status: 401 })
  }

  return Response.json({ iceServers: buildIceServers() })
}
