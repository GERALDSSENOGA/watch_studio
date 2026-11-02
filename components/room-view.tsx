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
import ScreenShare, { type ScreenShareHandle } from "@/components/screen-share"
import { ErrorBoundary } from "@/components/error-boundary"
import { useScreenShareGlobal } from "@/components/screen-share-context"

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
  // Zoom-style collapsible sidebar: hidden by default, opens when toggled.
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Global screen-share context (persists across page navigation)
  const {
    isSharing,
    localStream,
    error: shareError,
    peerCount,
    startShare,
    stopShare,
    toggleShare,
    handleHostSignal,
    addPeer,
    remoteStream,
    isSharingFromHost,
    sharerId,
    receiveError,
    stopReceiving,
    handleGuestSignal,
    setSendSignal,
  } = useScreenShareGlobal()

  const screenShareRef = React.useRef<ScreenShareHandle | null>(null)
  const applySyncStateRef = React.useRef<((state: any) => void) | null>(null)
  const signalHandlerRef = React.useRef<((signal: { type: string; [key: string]: unknown }) => void) | null>(null)

  const { send, connected: socketConnected, authenticated: socketAuthenticated } = useRoomSocket({
    token: wsToken,
    onAuth: () => {
      send({ type: "room.join", roomId: room.id })
    },
    onPresence: (users) => setPresence(users),
    onPresenceJoined: (u) => {
      setPresence((p) => [...p.filter((x) => x.userId !== u.userId), u])
      // Host: create a peer connection for the newly joined guest
      if (isHost && isSharing && localStream) {
        addPeer(u.userId, user.id)
      }
    },
    onPresenceLeft: (u) => setPresence((p) => p.filter((x) => x.userId !== u.userId)),
    onChatMessage: (message) => setMessages((m) => [...m, message]),
    onPlaybackState: (state) => setServerPlayback(state),
    onPlaybackSync: (state) => {
      applySyncStateRef.current?.({
        currentTime: state.currentTime,
        isPlaying: state.isPlaying,
        playbackRate: state.playbackRate,
        updatedAt: state.updatedAt,
        hostId: state.hostId,
      })
    },
    onWebRTCSignal: (signal) => {
      signalHandlerRef.current?.(signal)
    },
    onPlaybackError: (code, message) => add({ title: "Playback: " + code, description: message, variant: "danger" }),
    onError: (code, message) => add({ title: "Connection: " + code, description: message, variant: "danger" }),
  })

  // Route WebRTC signals via WebSocket
  useEffect(() => {
    setSendSignal((signal: { type: string; [key: string]: unknown }) => {
      send(signal)
    })
  }, [send, setSendSignal])

  // When returning to the room while already sharing, re-broadcast screen share
  // state and re-establish peer connections with existing members.
  const hasReannouncedRef = React.useRef(false)

  // Sharing stopped → a later share must announce itself again.
  useEffect(() => {
    if (!isSharing) hasReannouncedRef.current = false
  }, [isSharing])

  useEffect(() => {
    if (!isHost || !isSharing || !localStream || !socketConnected || hasReannouncedRef.current)
      return

    // Wait for presence to be populated (from room.joined)
    if (presence.length === 0) return

    hasReannouncedRef.current = true

    // Notify everyone that screen sharing is active
    send({
      type: "webrtc.screen-share.started",
      roomId: room.id,
      from: user.id,
    })

    // Create peer connections for all existing members
    presence.forEach((m) => {
      if (m.userId !== user.id) {
        addPeer(m.userId, user.id)
      }
    })
  }, [isHost, isSharing, localStream, socketConnected, room, user.id, presence, send, addPeer])

  // Handle incoming WebRTC signals from the socket
  useEffect(() => {
    signalHandlerRef.current = (signal: { type: string; [key: string]: unknown }) => {
      if (isHost) {
        handleHostSignal(signal as any)
      } else {
        handleGuestSignal(signal as any)
      }
    }
  }, [isHost, handleHostSignal, handleGuestSignal])

  // Fetch chat history once connected. The history endpoint is
  // /api/chat/[roomId] (GET returns the room-scoped message list).
  useEffect(() => {
    if (!socketConnected) return
    fetch(`/api/chat/${room.id}?limit=50`)
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

  const playerColSpan = sidebarOpen ? "lg:col-span-7" : "lg:col-span-12"

  return (
    <div className="mx-auto max-w-7xl px-6 py-6 relative min-h-screen flex flex-col">
      {/* Header: room name only */}
      <header className="mb-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{room.name}</h1>
          {room.description && <p className="text-muted-foreground">{room.description}</p>}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-12 flex-1 min-h-0">
        {/* Player + playback column */}
        <div className={`${playerColSpan} space-y-6`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="muted">{room.status.toLowerCase()}</Badge>
              {room.currentMedia ? (
                <Badge
                  variant={
                    room.currentMedia.providerId === "youtube"
                      ? "success"
                      : "default"
                  }
                >
                  {room.currentMedia.providerId === "youtube"
                    ? "Synced playback (YouTube)"
                    : room.currentMedia.category}
                </Badge>
              ) : null}
              {room.currentMedia?.providerId === "youtube" && (
                <Badge variant="default" size="sm">
                  Native sync
                </Badge>
              )}
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

          <ErrorBoundary
            fallback={
              <Card className="text-center py-12 text-muted-foreground">
                <CardContent>
                  <p>Video player error. You can still use chat and screen sharing.</p>
                </CardContent>
              </Card>
            }
          >
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
              setReceivedSyncStateRef={applySyncStateRef}
            />
          </ErrorBoundary>

          {room.currentMedia?.providerId !== "youtube" || isSharing || isSharingFromHost ? (
            <ErrorBoundary
              fallback={
                <Card className="text-center py-12 text-muted-foreground">
                  <CardContent>
                    <p>Screen share error. You can still use video player and chat.</p>
                  </CardContent>
                </Card>
              }
            >
              <ScreenShare
                roomId={room.id}
                userId={user.id}
                isHost={isHost}
                send={send}
                onSignal={(handler) => {
                  signalHandlerRef.current = handler
                }}
              />
            </ErrorBoundary>
          ) : (
            <Card className="relative overflow-hidden">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground">
                  Native sync available
                </CardTitle>
              </CardHeader>
              <CardContent className="min-h-[300px] flex flex-col items-center justify-center bg-black rounded-lg p-6">
                <div className="flex flex-col items-center gap-3">
                  <Badge variant="success" size="sm">
                    YouTube video detected
                  </Badge>
                  <p className="text-xs text-muted-foreground text-center max-w-xs">
                    This video plays natively in the room with synchronized
                    play, pause, and seek — no screen sharing needed.
                  </p>
                  <p className="text-xs text-muted-foreground text-center max-w-xs">
                    Host: use the &ldquo;Change media&rdquo; dropdown to select a
                    YouTube link from your library.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {!room.currentMedia && (
            <Card className="text-center py-12 text-muted-foreground">
              <CardContent>
                No media selected. Host: choose media above, or edit the room to add a saved link.
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar: presence + chat (+ members) */}
        {sidebarOpen && (
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader className="flex items-center justify-between pb-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="default" size="sm">
                      Participants ({presence.length})
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSidebarOpen(false)}
                      aria-label="Hide sidebar"
                    >
                      ✕
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <RoomPresence users={presence} />
                </CardContent>
              </Card>
              <ErrorBoundary
            fallback={
              <Card className="text-center py-12 text-muted-foreground">
                <CardContent>
                  <p>Chat error. You can still use video player and screen sharing.</p>
                </CardContent>
              </Card>
            }
          >
            <RoomChat roomId={room.id} user={user} messages={messages} send={sendChat} />
          </ErrorBoundary>
              {/* Member management (desktop sidebar) */}
              {isHost || isModeratorOrHost ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Member management</CardTitle>
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
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Bottom control bar (Zoom-style) */}
      <div className="mt-6 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-surface/50 backdrop-blur-md border border-surface">
        <div className="flex items-center gap-2">
          {isHost || isModeratorOrHost ? (
            <>
              <Button onClick={createInvitation} disabled={creatingInvite} size="sm">
                {creatingInvite ? "Creating…" : "Invite friends"}
              </Button>
              <Button type="button" variant="danger" onClick={closeRoom} disabled={closing} size="sm">
                Close room
              </Button>
            </>
          ) : (
            <Button disabled size="sm">Invite friends</Button>
          )}
        </div>

        {/* Zoom-style sidebar toggle */}
        <Button
          type="button"
          variant={sidebarOpen ? "default" : "ghost"}
          size="sm"
          onClick={() => setSidebarOpen((prev) => !prev)}
          aria-label={sidebarOpen ? "Hide participants & chat" : "Show participants & chat"}
        >
          {sidebarOpen ? "Hide sidebar" : <span className="flex items-center gap-1">👥 Participants <span className="text-xs opacity-70">(show)</span></span>}
        </Button>
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
    </div>
  )
}
