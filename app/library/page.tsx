import { auth } from "@/lib/auth"
import { listMedia } from "@/lib/services/media.service"
import { MediaGrid } from "@/components/media-grid"
import { AddMediaButton } from "@/components/add-media-button"
import { Input } from "@/components/ui/input"

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; availability?: string }>
}) {
  const session = await auth()
  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
        <p>Sign in to view your library.</p>
      </div>
    )
  }

  const user = session.user
  const sp = await searchParams
  const { items, total } = await listMedia(user.id, {
    take: 100,
  })

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">My Library</h1>
          <p className="text-muted-foreground">{total} saved items</p>
        </div>
        <AddMediaButton />
      </div>

      <div className="flex-1 max-w-sm">
        <label className="block text-sm font-medium mb-2">Search</label>
        <Input
          placeholder="Title…"
          defaultValue={sp.search ?? ""}
        />
      </div>

      <MediaGrid items={items} />
    </div>
  )
}
