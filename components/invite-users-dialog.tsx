"use client"

import * as React from "react"
import { useState, useCallback, useEffect } from "react"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface UserItem {
  id: string
  name: string
  image: string | null
  status: string | null
}

interface InviteUsersDialogProps {
  open: boolean
  onClose: () => void
  roomId: string
  onInviteSent?: () => void
}

export function InviteUsersDialog({
  open,
  onClose,
  roomId,
  onInviteSent,
}: InviteUsersDialogProps) {
  const { add } = useToast()
  const [users, setUsers] = useState<UserItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState("")

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/users?roomId=${encodeURIComponent(roomId)}&take=50`)
      if (!res.ok) throw new Error("Failed to load users")
      const data = await res.json()
      setUsers((data.users ?? []).map((u: any) => ({
        id: u.id,
        name: u.name ?? "Unnamed user",
        image: u.image ?? null,
        status: u.status ?? null,
      })))
    } catch {
      add({ title: "Could not load users", variant: "danger" })
    } finally {
      setLoading(false)
    }
  }, [roomId, add])

  useEffect(() => {
    if (open) fetchUsers()
  }, [open, fetchUsers])

  const filteredUsers = users.filter((u) =>
    (u.name ?? "").toLowerCase().includes(search.toLowerCase())
  )

  const toggleUser = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const isSelected = (userId: string) => selected.has(userId)

  const sendInvites = async () => {
    if (selected.size === 0) return
    setSending(true)
    let success = 0
    let fail = 0
    for (const userId of selected) {
      try {
        const res = await fetch("/api/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId, inviteeId: userId }),
        })
        if (res.ok) success++
        else fail++
      } catch {
        fail++
      }
    }
    setSending(false)
    setSelected(new Set())
    if (success > 0) {
      add({ title: `Invitation sent to ${success} user${success > 1 ? "s" : ""}`, variant: "success" })
      onInviteSent?.()
    }
    if (fail > 0) {
      add({ title: `${fail} invitation(s) failed to send`, variant: "danger" })
    }
    onClose()
  }

  if (!open) return null

  return (
    <Dialog open={open} onClose={onClose} title="Invite users to room">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="invite-search">Search users</Label>
          <Input
            id="invite-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            disabled={loading}
          />
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading users…</p>
        ) : filteredUsers.length === 0 ? (
          <p className="text-muted-foreground text-sm">No users found.</p>
        ) : (
          <Card>
            <CardContent className="p-3 space-y-2">
              {filteredUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-surface-hover cursor-pointer transition-colors"
                  onClick={() => toggleUser(u.id)}
                >
                  <input
                    type="checkbox"
                    checked={isSelected(u.id)}
                    onChange={() => toggleUser(u.id)}
                    className="rounded-md border-input bg-background text-accent focus:ring-accent focus:ring-2 shrink-0"
                  />
                  {u.image ? (
                    <img
                      src={u.image}
                      alt={u.name ?? ""}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-surface flex items-center justify-center text-xs font-medium">
                      {u.name?.charAt(0)?.toUpperCase() ?? "U"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <Badge variant="muted" size="sm">
                      {u.status === "active" ? "Active" : "Offline"}
                    </Badge>
                  </div>
                  {isSelected(u.id) && (
                    <Badge variant="default" size="sm">Selected</Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={sending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={selected.size === 0 || sending}
            onClick={sendInvites}
          >
            {sending ? "Sending…" : `Invite ${selected.size}`}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
