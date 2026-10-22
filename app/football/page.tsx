import { auth } from "@/lib/auth"
import { listMedia } from "@/lib/services/media.service"
import { MediaGrid } from "@/components/media-grid"

export default async function FootballPage({
  searchParams,
}: {
  searchParams?: { search?: string }
}) {
  const session = await auth()
  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
        <p>Sign in to view your football links.</p>
      </div>
    )
  }

  const user = session.user
  const { items } = await listMedia(user.id, {
    category: "FOOTBALL",
    search: searchParams?.search || undefined,
    take: 100,
  })

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">Football</h1>
      <MediaGrid items={items} />
    </div>
  )
}
