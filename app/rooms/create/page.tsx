"use client"

import { useSession } from "next-auth/react"
import { createRoomAction } from "./action"
import { listMediaAction } from "./list-media-action"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import * as React from "react"

export default function CreateRoomPage({
  searchParams,
}: {
  searchParams?: Promise<{ media?: string }>
}) {
  // Next.js 15+: searchParams is a Promise even in client components and must
  // be unwrapped with React.use() before accessing properties.
  const params = React.use(searchParams ?? Promise.resolve({} as { media?: string }))
  const { data: session } = useSession()
  const router = useRouter()
  const [mediaItems, setMediaItems] = React.useState<any[]>([])
  const [mediaLoading, setMediaLoading] = React.useState(true)
  const [formLoading, setFormLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (!session?.user) {
      router.push("/login")
      return
    }
    listMediaAction().then((result) => {
      if ("error" in result) {
        router.push("/login")
        return
      }
      setMediaItems(result.items)
      setMediaLoading(false)
    })
  }, [session, router])

  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
        <p>Sign in to create a room.</p>
      </div>
    )
  }

  if (mediaLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/rooms" className="mb-4 text-sm text-muted-foreground hover:text-foreground">â† Rooms</Link>
      <h1 className="text-2xl font-bold mb-6">Create watch room</h1>

      {formLoading ? <Spinner /> : (
        <Card>
          <CardHeader>
            <CardTitle>New room</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={async (event) => {
                event.preventDefault()
                const formData = new FormData(event.currentTarget as HTMLFormElement)
                setFormLoading(true)
                setError("")
                try {
                  const result = await createRoomAction(formData)
                  if (result.error) {
                    setError(result.error)
                  } else if (result.roomId) {
                    router.push(`/rooms/${result.roomId}`)
                  }
                } finally {
                  setFormLoading(false)
                }
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="name">Room name <span className="text-muted-foreground font-normal">*</span></Label>
                <Input id="name" name="name" defaultValue="Watch party" required maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Input id="description" name="description" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="media">Select media to watch</Label>
                <select
                  id="media"
                  name="media"
                  defaultValue={params.media ?? ""}
                  className="block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                >
                  <option value="">(start with an empty room)</option>
                  {mediaItems.map((item) => (
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
                <Input id="maxMembers" name="maxMembers" type="number" defaultValue={50} min={2} max={200} />
              </div>
              {error && (
                <div className="rounded-md border border-danger bg-danger-muted p-3 text-sm text-danger">
                  {error}
                </div>
              )}
              <Button type="submit" disabled={formLoading} className="w-full">
                {formLoading ? "Creatingâ€¦" : "Create room"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
