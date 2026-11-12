import { auth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export default async function ReceivedInvitationsPage() {
  const session = await auth()
  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
        <p>Sign in to view your invitations.</p>
      </div>
    )
  }

  const res = await fetch("/api/invitations/received", { cache: "no-store" })
  if (!res.ok) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Invitations received</h1>
        </div>
        <div className="rounded-lg border border-danger bg-danger-muted p-4 text-center">
          <p className="text-sm text-danger">Failed to load invitations.</p>
        </div>
      </div>
    )
  }

  const { invitations } = await res.json()

  const pending = (invitations ?? []).filter((i: any) => i.status === "PENDING")
  const resolved = (invitations ?? []).filter((i: any) => i.status !== "PENDING")

  const respond = async (invitationId: string, action: "accept" | "decline") => {
    const r = await fetch(`/api/invitations/${invitationId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      alert(err?.message ?? `Failed to ${action} invitation`)
      return
    }
    ;(window as any).location?.reload()
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Invitations received</h1>
          <p className="text-muted-foreground">
            Invitations sent to you. Accept to join the room, or decline to dismiss.
          </p>
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-muted-foreground">No pending invitations.</p>
        </div>
      ) : (
        <>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Pending
          </h2>
          <div className="space-y-3">
            {pending.map((inv: any) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-3 p-4 rounded-lg border border-border bg-surface"
              >
                <div>
                  <p className="text-sm font-medium">{inv.room?.name ?? "Room"}</p>
                  <p className="text-xs text-muted-foreground">
                    From{" "}
                    {inv.inviter?.name ?? "A user"} ·
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => respond(inv.id, "accept")}
                  >
                    Accept
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => respond(inv.id, "decline")}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {resolved.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mt-8 mb-4">
            History
          </h2>
          <div className="space-y-3">
            {resolved.map((inv: any) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-surface/50"
              >
                <div>
                  <p className="text-sm font-medium">{inv.room?.name ?? "Room"}</p>
                  <p className="text-xs text-muted-foreground">
                    From{" "}
                    {inv.inviter?.name ?? "A user"} ·
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge
                  variant={
                    inv.status === "ACCEPTED"
                      ? "success"
                      : inv.status === "DECLINED"
                        ? "muted"
                        : "danger"
                  }
                  size="sm"
                >
                  {inv.status.charAt(0).toUpperCase() + inv.status.slice(1).toLowerCase()}
                </Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
