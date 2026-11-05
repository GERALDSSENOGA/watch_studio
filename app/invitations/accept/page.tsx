import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getInvitationStatus, acceptInvitation } from "@/lib/services/invitation.service"
import { Button } from "@/components/ui/button"
export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const session = await auth()
  const { token } = await searchParams
  if (!session?.user) {
    redirect(`/login?callbackUrl=/invitations/accept?token=${token}`)
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center">
        <h2 className="text-lg font-medium">Invalid invitation</h2>
        <p className="mt-2 text-muted-foreground">No invitation token was provided.</p>
      </div>
    )
  }

  const status = await getInvitationStatus(token)
  if (!status) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center">
        <h2 className="text-lg font-medium">Invitation not found</h2>
        <p className="mt-2 text-muted-foreground">This invitation does not exist or its room is no longer active.</p>
      </div>
    )
  }

  if (status.status !== "PENDING") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center">
        <h2 className="text-lg font-medium">Invitation {status.status.toLowerCase()}</h2>
        <p className="mt-2 text-muted-foreground">
          This invitation can no longer be used to join {status.roomName}.
        </p>
      </div>
    )
  }

  if (status.expired) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center">
        <h2 className="text-lg font-medium">Invitation expired</h2>
        <p className="mt-2 text-muted-foreground">
          This invitation expired on {new Date(status.expiresAt).toLocaleString()}.
        </p>
      </div>
    )
  }

  // Accept the invitation server-side so the token is never exposed to the browser.
  // Call the service directly (in the same process) instead of looping back over
  // HTTP to /api/invitations/:token, which is unreliable under load.
  try {
    await acceptInvitation({ token, userId: session.user.id })
  } catch (err: any) {
    // If already a member, just redirect to the room
    if (err?.code === "ALREADY_MEMBER") {
      redirect(`/rooms/${status.roomId}`)
    }
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center">
        <h2 className="text-lg font-medium">Unable to join room</h2>
        <p className="mt-2 text-muted-foreground">
          {err?.message ?? "An unexpected error occurred."}
        </p>
        <Link href="/rooms">
          <Button>Go to rooms</Button>
        </Link>
      </div>
    )
  }

  redirect(`/rooms/${status.roomId}`)
}
