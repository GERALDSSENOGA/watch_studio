"use client"

import * as React from "react"
import { useState } from "react"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { parseMediaUrl } from "@/lib/url"
import { detectProvider } from "@/lib/providers"

export type Category = "MOVIE"

interface MediaFormDialogProps {
  open: boolean
  onClose: () => void
  defaultCategory?: Category
  onSuccess?: () => void
  editingItem?: EditableMediaItem | null
  /** Pre-fill the form when adding a new item.
   *  Takes a back seat to `editingItem` when both are provided. */
  defaultValues?: EditableMediaItem | null
}

export type EditableMediaItem = {
  id: string
  title: string
  description: string | null
  category: Category
  originalUrl: string
  thumbnailUrl: string | null
  releaseYear: number | null
  genre: string | null
  durationMins: number | null
}

export function MediaFormDialog({
  open,
  onClose,
  defaultCategory = "MOVIE",
  onSuccess,
  editingItem,
  defaultValues,
}: MediaFormDialogProps) {
  const { add } = useToast()
  const [submitting, setSubmitting] = useState(false)

  const seedForm = (item: EditableMediaItem | null | undefined, category: Category) => ({
    title: item?.title ?? "",
    description: item?.description ?? "",
    category: item?.category ?? category,
    originalUrl: item?.originalUrl ?? "",
    thumbnailUrl: item?.thumbnailUrl ?? "",
    releaseYear: String(item?.releaseYear ?? ""),
    genre: item?.genre ?? "",
    durationMins: String(item?.durationMins ?? ""),
  })

  // `editingItem` takes precedence over `defaultValues`. The dialog stays
  // mounted across open/close, so we derive a target key that changes whenever
  // the seed source changes (closed / add / edit item / default values), and
  // re-seed the form synchronously during render.
  const seedSource = editingItem ?? defaultValues ?? null
  const targetKey = open ? editingItem?.id ?? "add" : "closed"
  const [prevTargetKey, setPrevTargetKey] = useState(targetKey)
  const [form, setForm] = useState(() => seedForm(seedSource, defaultCategory))
  if (targetKey !== prevTargetKey) {
    setPrevTargetKey(targetKey)
    setForm(seedForm(seedSource, defaultCategory))
  }

  // Tell the user up front what a non-YouTube link will do in a room, so
  // "Mode C" in the room is expected rather than a surprise.
  let urlCapabilityHint: { synced: boolean; message: string } | null = null
  if (form.originalUrl.trim()) {
    const detected = detectProvider(form.originalUrl.trim())
    if (detected?.providerId === "youtube" && detected.videoId) {
      urlCapabilityHint = { synced: true, message: "YouTube link: embedded playback with synchronized play, pause and seek in watch rooms." }
    } else if (parseMediaUrl(form.originalUrl.trim())) {
      urlCapabilityHint = { synced: false, message: "This link will be added as an external source: it opens on the provider's site, but WatchStudio cannot embed or synchronize playback for it." }
    }
  }
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)

    const releaseYear = form.releaseYear ? Number(form.releaseYear) : undefined
    const durationMins = form.durationMins ? Number(form.durationMins) : undefined

    const body: Record<string, unknown> = {
      title: form.title,
      description: form.description || undefined,
      category: form.category,
      originalUrl: form.originalUrl,
      thumbnailUrl: form.thumbnailUrl || undefined,
      releaseYear: releaseYear || undefined,
      genre: form.genre || undefined,
      durationMins: durationMins || undefined,
    }

    try {
      const url = editingItem ? `/api/media/${editingItem.id}` : "/api/media"
      const method = editingItem ? "PATCH" : "POST"
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error?.message ?? "Failed to save media item")
      }

      add({
        title: editingItem ? "Media updated" : "Media added",
        variant: "success",
      })
      onClose()
      onSuccess?.()
    } catch (err: any) {
      add({ title: err?.message ?? "Save failed", variant: "danger" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={editingItem ? "Edit media" : "Add media link"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Title <span className="text-muted-foreground font-normal">*</span></Label>
          <Input
            id="title"
            name="title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            maxLength={200}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="originalUrl">Video link (URL) <span className="text-muted-foreground font-normal">*</span></Label>
          <Input
            id="originalUrl"
            name="originalUrl"
            type="url"
            value={form.originalUrl}
            onChange={(e) => setForm({ ...form, originalUrl: e.target.value })}
            placeholder="https://www.youtube.com/watch?v=..."
            required
          />
          <p className="text-xs text-muted-foreground">
            Only https:// links are accepted. Playback mode is set automatically by the link&#39;s provider.
          </p>
          {urlCapabilityHint && (
            <p className={`text-xs ${urlCapabilityHint.synced ? "text-muted-foreground" : "text-amber-600"}`}>
              {urlCapabilityHint.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description (optional)</Label>
          <Input
            id="description"
            name="description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            maxLength={2000}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="thumbnailUrl">Thumbnail / poster URL (optional)</Label>
          <Input
            id="thumbnailUrl"
            name="thumbnailUrl"
            type="url"
            value={form.thumbnailUrl}
            onChange={(e) => setForm({ ...form, thumbnailUrl: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="releaseYear">Release year</Label>
            <Input id="releaseYear" type="number" value={form.releaseYear} onChange={(e) => setForm({ ...form, releaseYear: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="genre">Genre</Label>
            <Input id="genre" value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="durationMins">Duration (minutes)</Label>
            <Input id="durationMins" type="number" value={form.durationMins} onChange={(e) => setForm({ ...form, durationMins: e.target.value })} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          All fields above are optional except title and link.
        </p>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {editingItem ? "Save changes" : "Save link"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
