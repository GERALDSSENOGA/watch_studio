"use client"

import * as React from "react"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"

interface PresenceUser {
  userId: string
  userName: string | null
  role: string
}

interface RoomPresenceProps {
  users: PresenceUser[]
}

export function RoomPresence({ users }: RoomPresenceProps) {
  const sorted = [...users].sort((a, b) => {
    const order = { HOST: 0, MODERATOR: 1, MEMBER: 2 }
    return (order[a.role as keyof typeof order] ?? 99) - (order[b.role as keyof typeof order] ?? 99)
  })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Participants ({sorted.length})
        </span>
      </div>
      <div className="space-y-1.5">
        {sorted.map((member) => (
          <div key={member.userId} className="flex items-center gap-2">
            <Avatar src={undefined} name={member.userName ?? undefined} size={26} />
            <span className="text-sm">{member.userName ?? "User"}</span>
            <Badge variant="muted" size="sm">
              {member.role.charAt(0).toUpperCase() + member.role.slice(1).toLowerCase()}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  )
}
