import { auth } from "@/lib/auth"
import { listMedia } from "@/lib/services/media.service"
import { MediaGrid } from "@/components/media-grid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; search?: string; availability?: string }>
}) {
  const { category, search, availability } = await searchParams
  const session = await auth()
  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
        <p>Sign in to view your library.</p>
      </div>
    )
  }

  const user = session.user
  const { items, total } = await listMedia(user.id, {
    category: (category ?? undefined) as "FOOTBALL" | "MOVIE" | undefined,
    search: search || undefined,
    availability: availability ?? undefined,
    take: 100,
  })

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">My Library</h1>
          <p className="text-muted-foreground">{total} saved items</p>
        </div>
        <Button>Add media link</Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 mb-6 items-end lg:items-start">
        <div className="flex-1 max-w-sm">
          <label className="block text-sm font-medium mb-2">Search</label>
          <Input
            placeholder="Title, teams, competition…"
            defaultValue={search ?? ""}
          />
        </div>
        <div className="flex gap-2">
          <Badge
            variant={category === "FOOTBALL" ? "success" : "default"}
            className="text-sm px-3 py-2 cursor-pointer"
          >
            Football
          </Badge>
          <Badge
            variant={category === "MOVIE" ? "default" : "muted"}
            className="text-sm px-3 py-2 cursor-pointer"
          >
            Movies
          </Badge>
          <Badge variant="muted" className="text-sm px-3 py-2 cursor-pointer">
            All
          </Badge>
        </div>
      </div>

      <MediaGrid items={items} />
    </div>
  )
}
