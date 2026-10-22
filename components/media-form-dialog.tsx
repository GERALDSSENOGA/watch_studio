"use client"

import * as React from "react"
import { useState, useCallback } from "react"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { parseMediaUrl } from "@/lib/url"

export type Category = "FOOTBALL" | "MOVIE"

interface MediaFormDialogProps {
  open: boolean
  onClose: () => void
  defaultCategory?: Category
  onSuccess?: () => void
  editingItem?: EditableMediaItem | null
}

export type EditableMediaItem = {
  id: string
  title: string
  description: string | null
  category: Category
  originalUrl: string
  thumbnailUrl: string | null
  homeTeam: string | null
  awayTeam: string | null
  competition: string | null
  kickoffAt: string | null
  matchStatus: string | null
  releaseYear: number | null
  genre: string | null
  durationMins: number | null
}

export function MediaFormDialog({
  open,
  onClose,
  defaultCategory = "FOOTBALL",
  onSuccess,
  editingItem,
}: MediaFormDialogProps) {
  const { add } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(() => ({
    title: editingItem?.title ?? "",
    description: editingItem?.description ?? "",
    category: editingItem?.category ?? defaultCategory,
    originalUrl: editingItem?.originalUrl ?? "",
    thumbnailUrl: editingItem?.thumbnailUrl ?? "",
    homeTeam: editingItem?.homeTeam ?? "",
    awayTeam: editingItem?.awayTeam ?? "",
    competition: editingItem?.competition ?? "",
    kickoffAt: editingItem?.kickoffAt ?? "",
    matchStatus: editingItem?.matchStatus ?? "",
    releaseYear: String(editingItem?.releaseYear ?? ""),
    genre: editingItem?.genre ?? "",
    durationMins: String(editingItem?.durationMins ?? ""),
  }))

  const isFootball = form.category === "FOOTBALL"

  const reset = useCallback(() => {
    setForm({
      title: "",
      description: "",
      category: defaultCategory,
      originalUrl: "",
      thumbnailUrl: "",
      homeTeam: "",
      awayTeam: "",
      competition: "",
      kickoffAt: "",
      matchStatus: "",
      releaseYear: "",
      genre: "",
      durationMins: "",
    })
  }, [defaultCategory])

  React.useEffect(() => {
    if (!open) reset()
  }, [open, reset])

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
    }
    if (isFootball) {
      body.homeTeam = form.homeTeam || undefined
      body.awayTeam = form.awayTeam || undefined
      body.competition = form.competition || undefined
      body.kickoffAt = form.kickoffAt || undefined
      body.matchStatus = form.matchStatus || undefined
    } else {
      body.releaseYear = releaseYear || undefined
      body.genre = form.genre || undefined
      body.durationMins = durationMins || undefined
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
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            maxLength={200}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Type</Label>
          <div className="grid gap-2">
            <Button
              variant={isFootball ? "default" : "ghost"}
              onClick={(e) => { e.preventDefault(); setForm({ ...form, category: "FOOTBALL" }) }}
            >
              Football
            </Button>
            <Button
              variant={!isFootball ? "default" : "ghost"}
              onClick={(e) => { e.preventDefault(); setForm({ ...form, category: "MOVIE" }) }}
            >
              Movie
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="originalUrl">Video link (URL) <span className="text-muted-foreground font-normal">*</span></Label>
          <Input
            id="originalUrl"
            type="url"
            value={form.originalUrl}
            onChange={(e) => setForm({ ...form, originalUrl: e.target.value })}
            placeholder="https://www.youtube.com/watch?v=..."
            required
          />
          <p className="text-xs text-muted-foreground">
            Only https:// links are accepted. Playback mode is set automatically by the link's provider.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description (optional)</Label>
          <Input
            id="description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            maxLength={2000}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="thumbnailUrl">Thumbnail / poster URL (optional)</Label>
          <Input
            id="thumbnailUrl"
            type="url"
            value={form.thumbnailUrl}
            onChange={(e) => setForm({ ...form, thumbnailUrl: e.target.value })}
          />
        </div>

        {isFootball ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="homeTeam">Home team</Label>
                <Input
                  id="homeTeam"
                  value={form.homeTeam}
                  onChange={(e) => setForm({ ...form, homeTeam: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="awayTeam">Away team</Label>
                <Input
                  id="awayTeam"
                  value={form.awayTeam}
                  onChange={(e) => setForm({ ...form, awayTeam: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="competition">Competition</Label>
              <Input
                id="competition"
                value={form.competition}
                onChange={(e) => setForm({ ...form, competition: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="kickoffAt">Kickoff date/time</Label>
                <Input id="kickoffAt" type="datetime-local" value={form.kickoffAt} onChange={(e) => setForm({ ...form, kickoffAt: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="matchStatus">Status</Label>
                <Input id="matchStatus" value={form.matchStatus} onChange={(e) => setForm({ ...form, matchStatus: e.target.value })} />
              </div>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}

        <div className="space-y-2">
          <Label htmlFor="originalUrl">All fields above are optional except title and link.</Label>
        </div>

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
