import { auth } from "@/lib/auth"
import { listMedia } from "@/lib/services/media.service"
import { createRoom } from "@/lib/services/room.service"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

export default async function CreateRoomPage({
  searchParams,
}: {
  searchParams?: { media?: string }
}) {
  const session = await auth()
  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
        <p>Sign in to create a room.</p>
      </div>
    )
  }

  const [mediaItems, setMediaItems] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  const media = await listMedia(session.user.id, { take: 100 })

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/rooms" className="mb-4 text-sm text-muted-foreground hover:text-foreground">← Rooms</Link>
      <h1 className="text-2xl font-bold mb-6">Create watch room</h1>

      {loading ? <Spinner /> : (
        <Card>
          <CardHeader>
            <CardTitle>New room</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={async (formData: FormData) => {
                "use server"
                setLoading(true)
                setError("")
                try {
                  const room = await createRoom({
                    hostId: session.user.id,
                    name: formData.get("name") as string,
                    description: (formData.get("description") as string) || undefined,
                    currentMediaId: (formData.get("media") as string) || undefined,
                    maxMembers: Number(formData.get("maxMembers") || 50) || 50,
                  })
                  redirect(`/rooms/${room.id}`)
                } catch (err: any) {
                  setError(err?.message ?? "Failed to create room")
                } finally {
                  setLoading(false)
                }
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="name">Room name <span className="text-muted-foreground font-normal">*</span></Label>
                <Input id="name" defaultValue="Watch party" required maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Input id="description" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="media">Select media to watch</Label>
                <select
                  id="media"
                  defaultValue={searchParams?.media ?? ""}
                  className="block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                >
                  <option value="">(start with an empty room)</option>
                  {media.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} ({item.category})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Choose a saved link. The room&apos;s playback mode depends on the source&apos;s provider.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxMembers">Maximum members</Label>
                <Input id="maxMembers" type="number" defaultValue={50} min={2} max={200} />
              </div>
              {error && (
                <div className="rounded-md border border-danger bg-danger-muted p-3 text-sm text-danger">
                  {error}
                </div>
              )}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Creating…" : "Create room"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

import React from "react"
