import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getInvitationStatus } from "@/lib/services/invitation.service"
export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const session = await auth()
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
  const response = await fetch(`${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/invitations/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center">
        <h2 className="text-lg font-medium">Unable to join</h2>
        <p className="mt-2 text-muted-foreground">{body.message ?? "This invitation could not be accepted."}</p>
      </div>
    )
  }

  redirect(`/rooms/${status.roomId}`)
}
