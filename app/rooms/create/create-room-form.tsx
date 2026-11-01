"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export interface RoomMediaOption {
  id: string
  title: string
  category: string
}

interface CreateRoomFormProps {
  mediaItems: RoomMediaOption[]
  defaultMediaId?: string
}

export function CreateRoomForm({ mediaItems, defaultMediaId }: CreateRoomFormProps) {
  const router = useRouter()
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const description = String(formData.get("description") ?? "").trim()

    setLoading(true)
    setError("")

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(formData.get("name") ?? ""),
          description: description || undefined,
          currentMediaId: (formData.get("media") as string) || undefined,
          maxMembers: Number(formData.get("maxMembers") || 50) || 50,
        }),
      })

      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(
          typeof body?.message === "string"
            ? body.message
            : body?.code === "VALIDATION_ERROR"
              ? "Please check the room details."
              : "Failed to create room"
        )
        return
      }

      router.push(`/rooms/${body.room.id}`)
    } catch {
      setError("Something went wrong. Try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New room</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Room name <span className="text-muted-foreground font-normal">*</span>
            </Label>
            <Input id="name" name="name" defaultValue="Watch party" required maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input id="description" name="description" maxLength={1000} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="media">Select media to watch</Label>
            <select
              id="media"
              name="media"
              defaultValue={defaultMediaId ?? ""}
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
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating…" : "Create room"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
