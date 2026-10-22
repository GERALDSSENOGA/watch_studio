import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { listRoomsForUser } from "@/lib/services/room.service"
import { listMedia } from "@/lib/services/media.service"

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
        <p>Sign in to view your profile.</p>
      </div>
    )
  }

  const [user, rooms, mediaCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, email: true, role: true, status: true, createdAt: true, image: true } }),
    listRoomsForUser(session.user.id),
    listMedia(session.user.id, { take: 1 }),
  ])

  if (!user) redirect("/login")

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">Profile</h1>
      <div className="rounded-lg border border-border bg-surface p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface">
            {user.name ? (
              <span className="text-sm font-medium">{user.name.match(/\b\w/g)?.join("").toUpperCase().slice(0, 2)}</span>
            ) : (
              <span className="text-sm">?</span>
            )}
          </div>
          <div>
            <p className="font-medium">{user.name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <span className="text-xs font-medium border border-border rounded px-1.5 py-0.5">
              {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
            </span>
          </div>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="border-b border-border pb-2">
            <dt className="text-xs text-muted-foreground">Account created</dt>
            <dd className="font-medium">{new Date(user.createdAt).toLocaleDateString()}</dd>
          </div>
          <div className="border-b border-border pb-2">
            <dt className="text-xs text-muted-foreground">Role</dt>
            <dd className="font-medium">{user.role}</dd>
          </div>
          <div className="border-b border-border pb-2">
            <dt className="text-xs text-muted-foreground">Media items</dt>
            <dd className="font-medium">{mediaCount.total}</dd>
          </div>
          <div className="border-b border-border pb-2">
            <dt className="text-xs text-muted-foreground">Watch rooms</dt>
            <dd className="font-medium">{rooms.length}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
