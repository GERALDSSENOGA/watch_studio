import { auth } from "@/lib/auth"
import { listRoomsForUser } from "@/lib/services/room.service"
import { listMedia } from "@/lib/services/media.service"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default async function Dashboard() {
  const session = await auth()
  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
        <h2 className="text-lg font-semibold">Welcome to WatchStudio</h2>
        <p className="mt-2">Sign in to build your media library and create watch rooms.</p>
        <div className="mt-6 flex gap-2">
          <Link href="/register"><Button>Create account</Button></Link>
          <Link href="/login"><Button variant="ghost">Sign in</Button></Link>
        </div>
      </div>
    )
  }

  const [roomsData, mediaData] = await Promise.all([
    listRoomsForUser(session.user.id),
    listMedia(session.user.id, { take: 6 }),
  ])
  const rooms = roomsData
  const recent = mediaData.items

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center gap-2 mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link href="/library"><Button variant="ghost">Go to library</Button></Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle>Your watch rooms</CardTitle>
          </CardHeader>
          <CardContent>
            {rooms.length === 0 ? (
              <p className="text-muted-foreground">You haven't created any rooms yet.</p>
            ) : (
              <div className="space-y-3">
                {rooms.map((room) => (
                  <div key={room.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface-hover">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{room.name}</span>
                      <Badge variant="muted">{room.visibility}</Badge>
                    </div>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {room._count.members} members
                    </span>
                    <Link
                      href={`/rooms/${room.id}`}
                      className="ml-3 text-sm font-medium text-accent underline-offset-4 hover:underline"
                    >
                      Open room
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recently saved</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-muted-foreground">No saved media yet. Add a football or movie link.</p>
            ) : (
              <ul className="space-y-3">
                {recent.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 p-2 rounded-md border border-transparent hover:bg-surface-hover hover:border-border transition-colors">
                    <Badge
                      variant={item.category === "FOOTBALL" ? "success" : "default"}
                      className="text-xs"
                    >
                      {item.category === "FOOTBALL" ? "Football" : "Movie"}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      {item.providerId && (
                        <p className="text-xs text-muted-foreground truncate">
                          {item.providerId} · {item.playbackMode}
                        </p>
                      )}
                    </div>
                    <Link href={`/media/${item.id}`} className="text-xs text-accent underline-offset-4 hover:underline">
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 flex gap-3">
        <Link href="/football"><Button>Add football link</Button></Link>
        <Link href="/movies"><Button variant="ghost">Add movie link</Button></Link>
        <Link href="/rooms/create"><Button variant="ghost">Create watch room</Button></Link>
      </div>
    </div>
  )
}
