import { auth } from "@/lib/auth"
import { listMedia } from "@/lib/services/media.service"
import { MediaGrid } from "@/components/media-grid"
import { AddMediaButton } from "@/components/add-media-button"

export default async function MoviesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  const session = await auth()
  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
        <p>Sign in to view your movie links.</p>
      </div>
    )
  }

  const user = session.user
  const { search } = await searchParams
  const { items } = await listMedia(user.id, {
    category: "MOVIE",
    search: search || undefined,
    take: 100,
  })

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Movies</h1>
        <AddMediaButton />
      </div>
      <MediaGrid items={items} />
    </div>
  )
}
