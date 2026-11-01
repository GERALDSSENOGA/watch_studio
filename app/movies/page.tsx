import { auth } from "@/lib/auth"
import { listMedia } from "@/lib/services/media.service"
import { MediaGrid } from "@/components/media-grid"

export default async function MoviesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  const { search: searchQuery } = await searchParams
  const session = await auth()
  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
        <p>Sign in to view your movie links.</p>
      </div>
    )
  }

  const user = session.user
  const { items } = await listMedia(user.id, {
    category: "MOVIE",
    search: searchQuery || undefined,
    take: 100,
  })

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">Movies</h1>
      <MediaGrid items={items} />
    </div>
  )
}
