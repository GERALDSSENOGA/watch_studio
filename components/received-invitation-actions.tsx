"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"

interface ReceivedInvitationActionsProps {
  invitationId: string
}

export function ReceivedInvitationActions({ invitationId }: ReceivedInvitationActionsProps) {
  const [pendingAction, setPendingAction] = React.useState<"accept" | "decline" | null>(null)

  const respond = async (action: "accept" | "decline") => {
    setPendingAction(action)
    try {
      const response = await fetch(`/api/invitations/${invitationId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        alert(err?.message ?? `Failed to ${action} invitation`)
        return
      }
      window.location.reload()
    } catch {
      alert(`Failed to ${action} invitation`)
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        onClick={() => respond("accept")}
        disabled={pendingAction !== null}
      >
        {pendingAction === "accept" ? "Accepting…" : "Accept"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => respond("decline")}
        disabled={pendingAction !== null}
      >
        {pendingAction === "decline" ? "Declining…" : "Decline"}
      </Button>
    </div>
  )
}
