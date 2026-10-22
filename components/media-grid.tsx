"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog } from "@/components/ui/dialog"
import { MediaFormDialog, EditableMediaItem, type Category } from "@/components/media-form-dialog"
import { detectProvider, getProvider } from "@/lib/providers"

interface MediaItem {
  id: string
  title: string
  description: string | null
  category: Category
  originalUrl: string
  providerId: string
  providerVideoId: string | null
  thumbnailUrl: string | null
  accessMode: string
  playbackMode: string
  availability: string
  homeTeam: string | null
  awayTeam: string | null
  competition: string | null
  matchStatus: string | null
  releaseYear: number | null
  genre: string | null
  durationMins: number | null
  createdAt: Date
  kickoffAt: Date | null
}
interface MediaGridProps {
  items: MediaItem[]
}

export function MediaGrid({ items }: MediaGridProps) {
  const router = useRouter()
  const { add } = useToast()
  const [editing, setEditing] = useState<EditableMediaItem | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this media item? This cannot be undone.")) return
    setDeletingId(id)
    try {
      const response = await fetch(`/api/media/${id}`, { method: "DELETE" })
      if (!response.ok) throw new Error("Delete failed")
      add({ title: "Media removed", variant: "success" })
      router.refresh()
    } catch {
      add({ title: "Delete failed", variant: "danger" })
    } finally {
      setDeletingId(null)
    }
  }

  const capabilityLabel = (item: MediaItem) => {
    const provider = getProvider(item.providerId as any)
    if (item.playbackMode === "SYNCHRONIZED") return <Badge variant="success" size="sm">Synced playback</Badge>
    if (item.playbackMode === "EXTERNAL") return <Badge variant="muted" size="sm">External link</Badge>
    return <Badge variant="danger" size="sm">Unsupported</Badge>
  }

  return (
    <div className="space-y-6">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <p>No saved media yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => {
            const detected = detectProvider(item.originalUrl)
            return (
              <div
                key={item.id}
                className="flex flex-col rounded-lg border border-border bg-surface p-4 hover:bg-surface-hover transition-colors"
              >
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt=""
                    className="w-full h-40 object-cover rounded-md mb-3 bg-surface-hover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-40 rounded-md bg-surface-hover flex items-center justify-center text-muted-foreground text-sm mb-3">
                    {item.category === "FOOTBALL" ? "⚽" : "🎬"}
                  </div>
                )}
                <div className="flex items-center justify-between mb-1">
                  <Badge
                    variant={item.category === "FOOTBALL" ? "success" : "default"}
                    className="text-xs"
                  >
                    {item.category === "FOOTBALL" ? "Football" : "Movie"}
                  </Badge>
                  {capabilityLabel(item)}
                </div>
                <Link
                  href={`/media/${item.id}`}
                  className="text-sm font-medium text-foreground hover:text-accent"
                >
                  {item.title}
                </Link>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                  {item.description ?? item.originalUrl}
                </p>
                <div className="mt-auto flex items-center gap-1">
                  {item.homeTeam && item.awayTeam && (
                    <span className="text-xs text-muted-foreground">
                      {item.homeTeam} vs {item.awayTeam}
                    </span>
                  )}
                  {item.providerId && item.providerVideoId && (
                    <a
                      href={item.providerId === "youtube" ? `https://youtu.be/${item.providerVideoId}` : item.originalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-accent underline-offset-4 hover:underline"
                      title="Open on provider"
                    >
                      Source
                    </a>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const next: EditableMediaItem = {
                        id: item.id,
                        title: item.title,
                        description: item.description,
                        category: item.category,
                        originalUrl: item.originalUrl,
                        thumbnailUrl: item.thumbnailUrl,
                        homeTeam: item.homeTeam,
                        awayTeam: item.awayTeam,
                        competition: item.competition,
                        kickoffAt:
                          item.kickoffAt instanceof Date
                            ? item.kickoffAt.toISOString()
                            : String(item.kickoffAt ?? null),
                        matchStatus: item.matchStatus,
                        releaseYear: item.releaseYear,
                        genre: item.genre,
                        durationMins: item.durationMins,
                      }
                      setEditing(next)
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={deletingId === item.id}
                    onClick={() => handleDelete(item.id)}
                  >
                    {deletingId === item.id ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <MediaFormDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        editingItem={editing ?? undefined}
        onSuccess={() => {
          setEditing(null)
          router.refresh()
        }}
      />
    </div>
  )
}
