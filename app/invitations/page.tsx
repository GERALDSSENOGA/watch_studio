import { auth } from "@/lib/auth"
import { listSentInvitations } from "@/lib/services/invitation.service"
import { Button } from "@/components/ui/button"

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

  const revoke = async (id: string) => {
    if (!window.confirm("Revoke this invitation? It can no longer be used to join the room.")) return
    const response = await fetch(`/api/invitations/${id}/revoke`, { method: "POST" })
    if (response.ok) window.location.reload()
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Invitations</h1>
          <p className="text-muted-foreground">Invitations you have sent. Revoke to make a link unusable.</p>
        </div>
      </div>

      {invitations.length === 0 ? (
        <p className="text-muted-foreground">No invitations sent yet.</p>
      ) : (
        <div className="space-y-3">
          {invitations.map((inv: any) => (
            <div key={inv.id} className="flex items-center justify-between gap-3 p-4 rounded-lg border border-border bg-surface">
              <div>
                <p className="text-sm font-medium">{inv.room.name}</p>
                <p className="text-xs text-muted-foreground">
                  Invited {new Date(inv.createdAt).toLocaleDateString()} ·
                  expires {new Date(inv.tokenExpiresAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={inv.status === "PENDING" ? "default" : "muted"}>
                  {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                </Badge>
                {inv.invitee && (
                  <span className="text-xs text-muted-foreground">Accepted by {inv.invitee.name}</span>
                )}
                {inv.status === "PENDING" && (
                  <Button type="button" variant="danger" size="sm" onClick={() => revoke(inv.id)}>
                    Revoke
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { Badge } from "@/components/ui/badge"
