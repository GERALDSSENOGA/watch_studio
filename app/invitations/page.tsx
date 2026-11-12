import { auth } from "@/lib/auth"
import Link from "next/link"
import { listSentInvitations } from "@/lib/services/invitation.service"
import { InvitationsList } from "@/components/invitations-list"

export default async function InvitationsPage() {
  const session = await auth()
  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
        <p>Sign in to view your invitations.</p>
      </div>
    )
  }

  const invitations = await listSentInvitations(session.user.id)

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Invitations</h1>
          <p className="text-muted-foreground">
            Invitations you have sent. Revoke to make a link unusable.
          </p>
          <Link href="/invitations/received" className="text-sm text-accent hover:underline">
            View invitations received →
          </Link>
        </div>
      </div>
      <InvitationsList invitations={invitations} />
    </div>
  )
}
