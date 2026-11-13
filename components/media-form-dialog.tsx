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
import { formatTimecode, parseTimecode } from "@/lib/timecode"

export type Category = "MOVIE"

export type ContentRating = "G" | "PG" | "PG-13" | "R" | "NC-17"

export type ContentWarning = "sexual_content" | "violence" | "profanity" | "drug_use" | "horror" | "other"

export interface SkipSegment {
  startMs: number
  endMs: number
  reason: string
}

/** Skip segment while it is being typed: boundaries stay as timecodes so the
 *  user never sees or edits raw milliseconds. */
type SkipSegmentDraft = {
  start: string
  end: string
  reason: string
}

function toDraft(segments: SkipSegment[]): SkipSegmentDraft[] {
  return segments.map((seg) => ({
    start: formatTimecode(seg.startMs),
    end: formatTimecode(seg.endMs),
    reason: seg.reason,
  }))
}

const CONTENT_RATINGS: ContentRating[] = ["G", "PG", "PG-13", "R", "NC-17"]

const CONTENT_WARNINGS: Array<{ value: ContentWarning; label: string }> = [
  { value: "sexual_content", label: "Sexual content" },
  { value: "violence", label: "Violence" },
  { value: "profanity", label: "Profanity" },
  { value: "drug_use", label: "Drug use" },
  { value: "horror", label: "Horror / frightening" },
  { value: "other", label: "Other" },
]

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
  contentFilterEnabled: boolean
  contentRating: ContentRating | null
  contentWarnings: ContentWarning[]
  skipSegments: SkipSegment[]
}

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
    contentFilterEnabled: item?.contentFilterEnabled ?? false,
    contentRating: item?.contentRating ?? null,
    contentWarnings: item?.contentWarnings ?? [],
    skipSegments: toDraft(item?.skipSegments ?? []),
  })

  // `editingItem` takes precedence over `defaultValues`. The dialog stays
  // mounted across open/close, so we derive a target key that changes whenever
  // the seed source changes (closed / add / edit item / default values), and
  // re-seed the form synchronously during render.
  const seedSource = editingItem ?? defaultValues ?? null
  const targetKey = open ? editingItem?.id ?? "add" : "closed"
  const [prevTargetKey, setPrevTargetKey] = useState(targetKey)
  interface MediaForm {
    title: string
    description: string
    category: Category
    originalUrl: string
    thumbnailUrl: string
    releaseYear: string
    genre: string
    durationMins: string
    contentFilterEnabled: boolean
    contentRating: ContentRating | null
    contentWarnings: ContentWarning[]
    skipSegments: SkipSegmentDraft[]
  }

  const [form, setForm] = useState<MediaForm>(() => seedForm(seedSource, defaultCategory))
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
  const addSkipSegment = React.useCallback(() => {
    setForm((prev) => ({
      ...prev,
      skipSegments: [...prev.skipSegments, { start: "", end: "", reason: "" }],
    }))
  }, [])

  const removeSkipSegment = React.useCallback((index: number) => {
    setForm((prev) => ({
      ...prev,
      skipSegments: prev.skipSegments.filter((_, i) => i !== index),
    }))
  }, [])

  const updateSkipSegment = React.useCallback(
    (index: number, field: keyof SkipSegmentDraft, value: string) => {
      setForm((prev) => {
        const segments = [...prev.skipSegments]
        segments[index] = { ...segments[index], [field]: value }
        return { ...prev, skipSegments: segments }
      })
    },
    []
  )

  const toggleContentWarning = React.useCallback((warning: ContentWarning) => {
    setForm((prev) => ({
      ...prev,
      contentWarnings: prev.contentWarnings.includes(warning)
        ? prev.contentWarnings.filter((w) => w !== warning)
        : [...prev.contentWarnings, warning],
    }))
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    // Convert the typed timecodes to the stored millisecond boundaries.
    const skipSegments: SkipSegment[] = []
    for (const [index, draft] of form.skipSegments.entries()) {
      const startMs = parseTimecode(draft.start)
      const endMs = parseTimecode(draft.end)
      if (startMs === null || endMs === null) {
        add({
          title: `Skip segment ${index + 1}`,
          description: "Enter start and end as M:SS or H:MM:SS, e.g. 28:01.",
          variant: "danger",
        })
        return
      }
      if (endMs <= startMs) {
        add({
          title: `Skip segment ${index + 1}`,
          description: "The end time must be after the start time.",
          variant: "danger",
        })
        return
      }
      skipSegments.push({ startMs, endMs, reason: draft.reason })
    }

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
      contentFilterEnabled: form.contentFilterEnabled,
      contentRating: form.contentRating,
      contentWarnings: form.contentWarnings.length ? form.contentWarnings : undefined,
      skipSegments: skipSegments.length ? skipSegments : undefined,
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

        {/* Content filter / parental controls section */}
        <div className="space-y-3 pt-4 border-t border-border">
          <div className="flex items-center gap-2">
            <input
              id="contentFilterEnabled"
              type="checkbox"
              checked={form.contentFilterEnabled}
              onChange={(e) => setForm({ ...form, contentFilterEnabled: e.target.checked })}
              className="rounded-md border-input bg-background text-accent focus:ring-accent focus:ring-2"
            />
            <Label htmlFor="contentFilterEnabled" className="cursor-pointer">
              Enable content filtering & parental controls
            </Label>
          </div>

          {form.contentFilterEnabled && (
            <div className="space-y-3 pl-4">
              <div className="space-y-2">
                <Label htmlFor="contentRating">Content rating</Label>
                <select
                  id="contentRating"
                  value={form.contentRating ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, contentRating: (e.target.value as ContentRating) || null })
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <option value="">None set</option>
                  {CONTENT_RATINGS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Content warnings</Label>
                <div className="flex flex-wrap gap-2">
                  {CONTENT_WARNINGS.map((w) => (
                    <label key={w.value} className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={form.contentWarnings.includes(w.value)}
                        onChange={() => toggleContentWarning(w.value)}
                        className="rounded-md border-input bg-background text-accent focus:ring-accent focus:ring-2"
                      />
                      {w.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Skip segments (auto-skip mature scenes)</Label>
                <p className="text-xs text-muted-foreground">
                  Segments are skipped automatically during playback. Enter times as they appear
                  on the player — M:SS or H:MM:SS (e.g. 28:01).
                </p>
                {form.skipSegments.map((seg, i) => (
                  <div
                    key={i}
                    className="flex gap-2 items-start bg-surface p-2 rounded-md border border-border"
                  >
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Start</Label>
                      <input
                        type="text"
                        value={seg.start}
                        onChange={(e) => updateSkipSegment(i, "start", e.target.value)}
                        placeholder="28:01"
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">End</Label>
                      <input
                        type="text"
                        value={seg.end}
                        onChange={(e) => updateSkipSegment(i, "end", e.target.value)}
                        placeholder="28:47"
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Reason</Label>
                      <input
                        type="text"
                        value={seg.reason}
                        onChange={(e) => updateSkipSegment(i, "reason", e.target.value)}
                        placeholder="e.g. sexual scene"
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSkipSegment(i)}
                      className="h-9 shrink-0 p-1 text-danger"
                      aria-label="Remove skip segment"
                    >
                      ×
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addSkipSegment}
                  className="w-auto text-xs"
                >
                  + Add skip segment
                </Button>
              </div>
            </div>
          )}
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
