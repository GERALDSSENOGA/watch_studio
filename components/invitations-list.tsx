"use client"

import * as React from "react"
import { useState } from "react"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface Invitation {
  id: string
  status: string
  room: { name: string }
  createdAt: string | Date
  tokenExpiresAt: string | Date
  invitee: { name: string | null } | null
}

interface InvitationsListProps {
  invitations: Invitation[]
}

export function InvitationsList({ invitations }: InvitationsListProps) {
  const { add } = useToast()
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const revoke = async (id: string) => {
    if (!window.confirm("Revoke this invitation? It can no longer be used to join the room.")) return
    setRevokingId(id)
    try {
      const response = await fetch("/api/invitations/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId: id }),
      })
      if (response.ok) {
        add({ title: "Invitation revoked", variant: "success" })
        // Remove optimistically
        ;(window as any).location?.reload()
      } else {
        add({ title: "Revoke failed", variant: "danger" })
      }
    } catch {
      add({ title: "Revoke failed", variant: "danger" })
    } finally {
      setRevokingId(null)
    }
  }

  if (invitations.length === 0) {
    return <p className="text-muted-foreground">No invitations sent yet.</p>
  }

  return (
    <div className="space-y-3">
      {invitations.map((inv) => (
        <div key={inv.id} className="flex items-center justify-between gap-3 p-4 rounded-lg border border-border bg-surface">
          <div>
            <p className="text-sm font-medium">{inv.room.name}</p>
            <p className="text-xs text-muted-foreground">
              Invited{" "}
              {inv.createdAt instanceof Date
                ? inv.createdAt.toLocaleDateString()
                : new Date(inv.createdAt).toLocaleDateString()} ·
              expires{" "}
              {inv.tokenExpiresAt instanceof Date
                ? inv.tokenExpiresAt.toLocaleDateString()
                : new Date(inv.tokenExpiresAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={inv.status === "PENDING" ? "default" : "muted"}
            >
              {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
            </Badge>
            {inv.invitee && (
              <span className="text-xs text-muted-foreground">
                Accepted by {inv.invitee.name}
              </span>
            )}
            {inv.status === "PENDING" && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={revokingId === inv.id}
                onClick={() => revoke(inv.id)}
              >
                {revokingId === inv.id ? "Revoking…" : "Revoke"}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
