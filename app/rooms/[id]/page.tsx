import { auth } from "@/lib/auth"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getRoom } from "@/lib/services/room.service"
import { getSession, effectivePositionMs } from "@/lib/services/playback.service"
import { listMedia } from "@/lib/services/media.service"
import { RoomView } from "@/components/room-view"

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [session, { id }] = await Promise.all([auth(), params])
  if (!session?.user) {
    redirect("/login")
  }

  let room: any
  try {
    room = await getRoom(id)
  } catch (err: any) {
    if (err?.code === "NOT_FOUND") {
      return (
        <div className="mx-auto max-w-2xl px-6 py-12 text-center">
          <h2 className="text-lg font-medium">Room not found</h2>
          <p className="mt-2 text-muted-foreground">This room does not exist or has been removed.</p>
          <Link href="/rooms">Go to rooms</Link>
        </div>
      )
    }
    if (err?.code === "NOT_MEMBER") {
      return (
        <div className="mx-auto max-w-2xl px-6 py-12 text-center">
          <h2 className="text-lg font-medium">Access denied</h2>
          <p className="mt-2 text-muted-foreground">This is a private room. You must be invited to join.</p>
          <Link href="/rooms">Go to rooms</Link>
        </div>
      )
    }
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center">
        <h2 className="text-lg font-medium">Unable to load room</h2>
        <Link href="/rooms">Go to rooms</Link>
      </div>
    )
  }

  const isMember = room.members.some((m: any) => m.userId === session.user!.id)
  if (!isMember) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center">
        <h2 className="text-lg font-medium">Access denied</h2>
        <p className="mt-2 text-muted-foreground">You are not a member of this room.</p>
        <Link href="/rooms">Go to rooms</Link>
      </div>
    )
  }

  // These are independent reads — run them together so joining a room waits on
  // one round trip instead of three back to back.
  const [wsSession, cookieStore, media] = await Promise.all([
    getSession(id),
    cookies(),
    listMedia(session.user.id, { take: 100 }),
  ])
  // Serve the effective position so a client loading mid-playback cues at the
  // real position, not the (frozen) position captured when play was pressed.
  const playback = wsSession ? { ...wsSession, positionMs: effectivePositionMs(wsSession) } : null
  // Auth.js prefixed the session cookie with `__Secure-` when the app is served
  // over HTTPS (as through the preview proxy); accept both names.
  const wsToken =
    cookieStore.get("__Secure-authjs.session-token")?.value ??
    cookieStore.get("authjs.session-token")?.value

  const mediaItems = media.items.map((item: any) => ({ id: item.id, title: item.title }))

  return (
    <RoomView
      room={room}
      playback={playback}
      wsToken={wsToken}
      user={{
        id: session.user.id,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
      }}
      mediaItems={mediaItems}
    />
  )
}
