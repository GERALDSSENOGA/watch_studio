import { auth } from "@/lib/auth"
import { getMedia } from "@/lib/services/media.service"
import { getProvider, youtubeEmbedUrl, youtubeWatchUrl } from "@/lib/providers"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CopyLinkButton, DeleteMediaButton, ReportMediaButton } from "./media-actions"

export default async function MediaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
        <p>Sign in to view media details.</p>
      </div>
    )
  }

  const { id } = await params
  let media: any
  try {
    media = await getMedia(id, { ownerId: session.user.id })
  } catch (err: any) {
    if (err?.code === "NOT_FOUND") {
      return (
        <div className="mx-auto max-w-2xl px-6 py-12 text-center">
          <h2 className="text-lg font-medium">Media not found</h2>
          <p className="mt-2 text-muted-foreground">The item does not exist or you do not own it.</p>
          <Link href="/library"><Button>Go to library</Button></Link>
        </div>
      )
    }
    if (err?.code === "FORBIDDEN") {
      return (
        <div className="mx-auto max-w-2xl px-6 py-12 text-center">
          <h2 className="text-lg font-medium">Not your media</h2>
          <p className="mt-2 text-muted-foreground">You can only view media items you own.</p>
          <Link href="/library"><Button>Go to library</Button></Link>
        </div>
      )
    }
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center">
        <h2 className="text-lg font-medium">Unable to load media</h2>
        <Link href="/library"><Button>Go to library</Button></Link>
      </div>
    )
  }

  const provider = getProvider(media.providerId as any)
  const synced = media.playbackMode === "SYNCHRONIZED"
  const embeddable = media.accessMode === "EMBED"

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <nav className="flex items-center gap-2 mb-6">
        <Link href="/library" className="text-sm text-muted-foreground hover:text-foreground">← Library</Link>
        <span className="text-xs text-muted-foreground">&gt;</span>
        <span className="text-sm font-medium">{media.title}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="default">{media.category}</Badge>
                <Badge variant="muted">{media.providerId}</Badge>
              </div>
              <CardTitle>{media.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {media.description && <p className="mb-3">{media.description}</p>}
              {media.category === "MOVIE" && (
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {media.releaseYear && <span>{media.releaseYear}</span>}
                  {media.genre && <span>{media.genre}</span>}
                  {media.durationMins && <span>{media.durationMins} min</span>}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Saved {new Date(media.createdAt).toLocaleDateString()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Playback</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-border bg-surface p-3">
                <p className="text-sm font-medium mb-1">Provider capabilities</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>
                    Embed: <span className="text-foreground">{provider.embedSupported ? "Yes" : "No"}</span>
                  </li>
                  <li>
                    Synchronized playback:
                    <span className="text-foreground">{provider.syncSupported ? "Yes" : "No"}</span>
                  </li>
                  <li>
                    External-link fallback:
                    <span className="text-foreground">{provider.externalFallbackRequired ? "Required" : "Not required"}</span>
                  </li>
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">{provider.notes}</p>
              </div>

              {embeddable && synced && (
                <div className="rounded-lg border border-border bg-surface p-3">
                  <p className="text-sm font-medium mb-1">Mode A — synchronized embedded playback</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    The official embedded player can be controlled and kept in sync across a watch room.
                  </p>
                  <div className="aspect-video rounded-lg bg-black overflow-hidden">
                    <iframe
                      src={youtubeEmbedUrl(media.providerVideoId ?? "")}
                      title={media.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      sandbox="allow-same-origin allow-scripts allow-popups allow-presentation"
                      className="w-full h-full"
                      loading="lazy"
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Embeddability depends on the video owner&apos;s settings and YouTube&apos;s terms. If this
                    video cannot be embedded, the room falls back to Mode B automatically.
                  </p>
                </div>
              )}

              {!embeddable && provider.externalFallbackRequired && (
                <div className="rounded-lg border border-border bg-surface p-3">
                  <p className="text-sm font-medium mb-1">Mode B — external provider playback</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    This source cannot be embedded or controlled by WatchStudio. Open it on the
                    provider&apos;s site; the room stays available for chat and coordination.
                  </p>
                  <Link
                    href={media.providerId === "youtube" ? youtubeWatchUrl(media.providerVideoId ?? "") : media.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button-focus-ring inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-hover"
                  >
                    Watch on provider ↗
                  </Link>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Playback is not synchronized — WatchStudio cannot observe or control it.
                  </p>
                </div>
              )}

              {!synced && media.playbackMode !== "SYNCHRONIZED" && (
                <div className="rounded-lg border border-danger bg-danger-muted p-3">
                  <p className="text-sm font-medium text-danger mb-1">Mode C — not playable here</p>
                  <p className="text-xs text-muted-foreground">
                    This source is not playable through WatchStudio. Select a different source to
                    create a synchronized watch room.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Link
              href={`/rooms/create?media=${media.id}`}
              className="button-focus-ring w-full rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-hover"
            >
              Start watch room with this media
            </Link>
            <CopyLinkButton />
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Manage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href={`/media/${media.id}`}><Button type="button" variant="ghost">Edit</Button></Link>
              <DeleteMediaButton mediaId={media.id} />
              <ReportMediaButton mediaId={media.id} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
