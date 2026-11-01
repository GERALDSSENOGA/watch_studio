import { auth } from "@/lib/auth"
import { listMedia } from "@/lib/services/media.service"
import Link from "next/link"
import { CreateRoomForm } from "./create-room-form"

export default async function CreateRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ media?: string }>
}) {
  const session = await auth()
  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
        <p>Sign in to create a room.</p>
      </div>
    )
  }

  const { media: defaultMediaId } = await searchParams
  const media = await listMedia(session.user.id, { take: 100 })

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/rooms" className="mb-4 text-sm text-muted-foreground hover:text-foreground">← Rooms</Link>
      <h1 className="text-2xl font-bold mb-6">Create watch room</h1>
      <CreateRoomForm mediaItems={media.items} defaultMediaId={defaultMediaId} />
    </div>
  )
}
