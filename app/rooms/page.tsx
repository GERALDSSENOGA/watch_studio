import { auth } from "@/lib/auth"
import { listRoomsForUser } from "@/lib/services/room.service"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default async function RoomsPage() {
  const session = await auth()
  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
        <p>Sign in to view your watch rooms.</p>
      </div>
    )
  }

  const rooms: any[] = await listRoomsForUser(session.user.id)

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Watch Rooms</h1>
          <p className="text-muted-foreground">Private rooms. Only members can join.</p>
        </div>
        <Link href="/rooms/create"><Button>Create room</Button></Link>
      </div>

      {rooms.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            No rooms yet. Create a room and invite friends with a secure invitation link.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rooms.map((room) => (
            <div key={room.id} className="flex items-center justify-between gap-3 p-4 rounded-lg border border-border bg-surface hover:bg-surface-hover transition-colors group">
              <div>
                <Link href={`/rooms/${room.id}`} className="text-sm font-medium text-foreground hover:text-accent">
                  {room.name}
                </Link>
                {room.description && (
                  <p className="text-xs text-muted-foreground">{room.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="muted">{room._count.members}/{room.maxMembers}</Badge>
                {room.hostId === session.user.id && (
                  <span className="text-xs text-muted-foreground">You host this room</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
