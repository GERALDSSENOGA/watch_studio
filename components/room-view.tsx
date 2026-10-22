"use client"

import * as React from "react"
import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useRoomSocket } from "@/hooks/useRoomSocket"
import { RoomPlayer } from "@/components/room-player"
import { RoomChat } from "@/components/room-chat"
import { RoomPresence } from "@/components/room-presence"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import { Spinner } from "@/components/ui/spinner"

interface RoomViewProps {
  room: {
    id: string
    name: string
    description: string | null
    status: string
    hostId: string
    currentMediaId: string | null
    currentMedia: any
    members: Array<{ id: string; userId: string; role: string; user: any }>
  }
  playback: any
  wsToken: string | undefined
  user: { id: string; name: string | null; image: string | null }
  mediaItems: Array<{ id: string; title: string }>
}

export function RoomView({
  room,
  playback,
  wsToken,
  user,
  mediaItems,
}: RoomViewProps) {
  const router = useRouter()
  const { add } = useToast()
  const isHost = room.hostId === user.id
  const isModeratorOrHost = room.members.some((m) => m.userId === user.id && (m.role === "HOST" || m.role === "MODERATOR"))

  const [messages, setMessages] = useState<any[]>([])
  const [presence, setPresence] = useState<Array<{ userId: string; userName: string | null; role: string }>>([])
  const [serverPlayback, setServerPlayback] = useState<any>(playback)
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null)
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [closing, setClosing] = useState(false)

  const { send, connected: socketConnected, authenticated: socketAuthenticated } = useRoomSocket({
    token: wsToken,
    onAuth: () => {
      send({ type: "room.join", roomId: room.id })
    },
    onPresence: (users) => setPresence(users),
    onPresenceJoined: (u) => setPresence((p) => [...p.filter((x) => x.userId !== u.userId), u]),
    onPresenceLeft: (u) => setPresence((p) => p.filter((x) => x.userId !== u.userId)),
    onChatMessage: (message) => setMessages((m) => [...m, message]),
    onPlaybackState: (state) => setServerPlayback(state),
    onPlaybackError: (code, message) => add({ title: "Playback: " + code, description: message, variant: "danger" }),
    onError: (code, message) => add({ title: "Connection: " + code, description: message, variant: "danger" }),
  })

  // Fetch chat history once connected.
  useEffect(() => {
    if (!socketConnected) return
    fetch(`/api/chat/${room.id}/messages?limit=50`)
      .then((r) => r.json())
      .then((data) => {
        setMessages((data.messages ?? []).reverse())
      })
      .catch(() => {
        add({ title: "Could not load chat history", variant: "danger" })
      })
  }, [socketConnected, room.id, add])

  const createInvitation = async () => {
    setCreatingInvite(true)
    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: room.id }),
      })
      if (!response.ok) throw new Error("Failed to create invitation")
      const { token } = await response.json()
      const url = `${window.location.origin}/invitations/accept?token=${token}`
      setInvitationUrl(url)
      navigator.clipboard.writeText(url)
      add({ title: "Invitation copied", variant: "success" })
    } catch (err: any) {
      add({ title: err?.message ?? "Invitation failed", variant: "danger" })
    } finally {
      setCreatingInvite(false)
    }
  }

  const removeMember = async (targetUserId: string) => {
    if (!window.confirm("Remove this participant from the room?")) return
    try {
      const response = await fetch(`/api/rooms/${room.id}/members/${targetUserId}`, { method: "DELETE" })
      if (!response.ok) throw new Error("Remove failed")
    } catch (err: any) {
      add({ title: err?.message ?? "Remove failed", variant: "danger" })
    }
  }

  const closeRoom = async () => {
    if (!window.confirm("Close this room? Participants will be removed.")) return
    setClosing(true)
    try {
      const response = await fetch(`/api/rooms/${room.id}`, { method: "DELETE" })
      if (!response.ok) throw new Error("Close failed")
      router.push("/rooms")
    } catch (err: any) {
      add({ title: err?.message ?? "Close failed", variant: "danger" })
    } finally {
      setClosing(false)
    }
  }

  const changeMedia = async (mediaId: string) => {
    try {
      const response = await fetch(`/api/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentMediaId: mediaId }),
      })
      if (!response.ok) throw new Error("Failed to change media")
      router.refresh()
    } catch (err: any) {
      add({ title: err?.message ?? "Change failed", variant: "danger" })
    }
  }

  const sendChat = useCallback(
    (payload: unknown) => send({ type: "chat.send", roomId: room.id, ...(payload as any) }),
    [send, room.id]
  )

  if (!socketConnected || !socketAuthenticated) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-6 flex flex-col items-center justify-center min-h-[600px]">
        <Spinner /> <p className="mt-2">Connecting to room…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <header className="mb-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{room.name}</h1>
          {room.description && <p className="text-muted-foreground">{room.description}</p>}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {isHost || isModeratorOrHost ? (
            <>
              <Button onClick={createInvitation} disabled={creatingInvite}>
                {creatingInvite ? "Creating…" : "Invite friends"}
              </Button>
              <Button type="button" variant="danger" onClick={closeRoom} disabled={closing}>
                Close room
              </Button>
            </>
          ) : (
            <Button disabled>Invite friends</Button>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Player + playback column */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="muted">{room.status.toLowerCase()}</Badge>
              {room.currentMedia ? (
                <Badge variant="default">{room.currentMedia.category}</Badge>
              ) : null}
            </div>
            {isHost && mediaItems.length > 0 && (
              <select
                defaultValue={room.currentMediaId ?? ""}
                onChange={(e) => {
                  if (e.target.value) changeMedia(e.target.value)
                }}
                className="ml-auto rounded-md border border-border bg-surface px-2 py-1 text-sm"
              >
                <option value="">Change media</option>
                {mediaItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          <RoomPlayer
            roomId={room.id}
            media={{
              id: room.currentMedia?.id ?? "",
              title: room.currentMedia?.title ?? "No media selected",
              originalUrl: room.currentMedia?.originalUrl ?? "",
              providerId: room.currentMedia?.providerId ?? "generic",
              providerVideoId: room.currentMedia?.providerVideoId ?? null,
              playbackMode: room.currentMedia?.playbackMode ?? "UNSUPPORTED",
              accessMode: room.currentMedia?.accessMode ?? "EXTERNAL",
            }}
            playback={serverPlayback}
            isHost={isHost}
            userId={user.id}
            send={send}
          />

          {!room.currentMedia && (
            <Card className="text-center py-12 text-muted-foreground">
              <CardContent>
                No media selected. Host: choose media above, or edit the room to add a saved link.
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar: presence + chat */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Watching</CardTitle>
            </CardHeader>
            <CardContent>
              <RoomPresence users={presence} />
            </CardContent>
          </Card>
          <RoomChat roomId={room.id} user={user} initialMessages={messages} send={sendChat} />
        </div>
      </div>

      <aside className="mt-6 lg:hidden">
        <Card>
          <CardHeader><CardTitle>Invitation</CardTitle></CardHeader>
          <CardContent>
            {invitationUrl ? (
              <div className="flex gap-2">
                <input
                  readOnly
                  value={invitationUrl}
                  className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => {
                  navigator.clipboard.writeText(invitationUrl ?? "")
                  add({ title: "Copied", variant: "success" })
                }}>
                  Copy
                </Button>
              </div>
            ) : (
              <Button onClick={createInvitation} disabled={creatingInvite}>
                {creatingInvite ? "Creating…" : "Create invitation"}
              </Button>
            )}
          </CardContent>
        </Card>
      </aside>

      {/* Member management (desktop sidebar) */}
      <div className="hidden lg:block">
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {room.members.map((m) => {
              const isMe = m.userId === user.id
              return (
                <div key={m.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Avatar src={m.user.image} name={m.user.name} size={26} />
                    <span className="text-sm">{m.user.name}</span>
                    {m.role === "HOST" && <span className="text-[10px] font-bold text-accent">HOST</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {isHost && m.role !== "HOST" && !isMe && (
                      <Button type="button" variant="danger" size="sm" onClick={() => removeMember(m.userId)}>
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
