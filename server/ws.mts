import dotenv from "dotenv"
dotenv.config()

import { WebSocketServer, WebSocket } from "ws"
import { validateSessionToken } from "../lib/ws-auth.ts"
import { prisma } from "../lib/db.ts"
import { applyCommand, getSession, effectivePositionMs } from "../lib/services/playback.service.ts"
import { createMessage, getMessages } from "../lib/services/chat.service.ts"
import { assertMembership } from "../lib/services/room.service.ts"
import { dedupePresenceByUser, type PresenceEntry } from "../lib/presence.ts"

const PORT = Number(process.env.WS_PORT ?? 3001)
const HEARTBEAT_INTERVAL_MS = 30_000
const RECONCILIATION_INTERVAL_MS = 5_000

interface AuthedSocket extends WebSocket {
  userId?: string
  userName?: string
  roomId?: string
  role?: string
  authenticated: boolean
  lastPong: number
  isAlive: boolean
}

const clients = new Set<AuthedSocket>()
const roomClients = new Map<string, Set<AuthedSocket>>()

// Last host-authoritative sync state per room, used to onboard new joiners.
const roomSyncState = new Map<
  string,
  {
    currentTime: number
    isPlaying: boolean
    playbackRate: number
    updatedAt: number
    hostId: string | null
    version: number
  }
>()

function roomSet(roomId: string): Set<AuthedSocket> {
  let set = roomClients.get(roomId)
  if (!set) {
    set = new Set()
    roomClients.set(roomId, set)
  }
  return set
}

function broadcast(roomId: string, payload: unknown, exclude?: AuthedSocket) {
  const set = roomClients.get(roomId)
  if (!set) return
  const message = JSON.stringify(payload)
  for (const client of set) {
    if (client === exclude) continue
    if (client.readyState === WebSocket.OPEN) client.send(message)
  }
}

function sendTo(client: AuthedSocket, payload: unknown) {
  if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(payload))
}

function sendToUser(roomId: string, userId: string, payload: unknown) {
  const set = roomClients.get(roomId)
  if (!set) return
  const message = JSON.stringify(payload)
  for (const client of set) {
    if (client.authenticated && client.userId === userId && client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  }
}

function sendSyncState(client: AuthedSocket, roomId: string) {
  const state = roomSyncState.get(roomId)
  if (!state) return
  sendTo(client, {
    type: "playback.sync.state",
    roomId,
    currentTime: state.currentTime,
    isPlaying: state.isPlaying,
    playbackRate: state.playbackRate,
    updatedAt: state.updatedAt,
    hostId: state.hostId,
    version: state.version,
  })
}

function presenceSnapshot(roomId: string) {
  const set = roomClients.get(roomId)
  if (!set) return []
  // One entry per authenticated USER, not per socket: the same account may
  // have several live connections (multiple tabs, a reconnect racing the old
  // socket's teardown). Without deduplication the client renders duplicate
  // participants for one user (duplicate React keys). The dedupe logic is
  // shared with the client via lib/presence.ts so both sides behave
  // identically and are unit-testable.
  const entries: PresenceEntry[] = []
  for (const c of set) {
    if (!c.authenticated || !c.userId) continue
    entries.push({ userId: c.userId, userName: c.userName ?? null, role: c.role ?? "member" })
  }
  return dedupePresenceByUser(entries)
}

/** True when at least one OTHER socket in the room still belongs to this user. */
function userStillConnected(roomId: string, socket: AuthedSocket): boolean {
  const set = roomClients.get(roomId)
  if (!set) return false
  for (const c of set) {
    if (c !== socket && c.authenticated && c.userId && c.userId === socket.userId) return true
  }
  return false
}

async function authenticate(socket: AuthedSocket, token: string | null) {
  if (!token) {
    sendTo(socket, { type: "auth.error", code: "TOKEN_REQUIRED" })
    socket.close(1008, "Authentication required")
    return false
  }
  const session = await validateSessionToken(token)
  if (!session) {
    sendTo(socket, { type: "auth.error", code: "INVALID_TOKEN" })
    socket.close(1008, "Invalid or expired session")
    return false
  }
  socket.authenticated = true
  socket.userId = session.user.id
  socket.userName = session.user.name ?? session.user.email ?? "User"
  sendTo(socket, { type: "auth.ok", user: session.user })
  return true
}

async function handleJoin(socket: AuthedSocket, roomId: string) {
  if (!socket.authenticated || !socket.userId) return
  try {
    const role = await assertMembership(roomId, socket.userId)
    if (!role) return

    const alreadyInRoom = socket.roomId === roomId && roomClients.get(roomId)?.has(socket)
    socket.roomId = roomId
    socket.role = role
    roomSet(roomId).add(socket)

    // Always (re-)send the joiner the authoritative snapshot so their UI
    // syncs, but only broadcast presence.joined when this is a genuinely new
    // participant: repeated joins (StrictMode remounts, duplicate join
    // messages, tab reconnects) must be idempotent.
    sendTo(socket, { type: "room.joined", roomId, role, presence: presenceSnapshot(roomId) })
    if (!alreadyInRoom) {
      broadcast(roomId, { type: "presence.joined", userId: socket.userId, userName: socket.userName, role }, socket)
    }

    // Send current playback state so a reconciling client converges immediately.
    const session = await getSession(roomId)
    if (session) {
      sendTo(socket, {
        type: "playback.state",
        roomId,
        state: session.state,
        positionMs: effectivePositionMs(session),
        version: session.version,
        updatedBy: session.updatedById,
        updatedAt: session.updatedAt,
        media: {
          id: session.media.id,
          title: session.media.title,
          providerId: session.providerId,
          originalUrl: session.media.originalUrl,
        },
      })
    }

    // Send the latest host-authoritative sync state so a new joiner can
    // converge immediately without waiting for the next heartbeat.
    sendSyncState(socket, roomId)
  } catch (err: any) {
    sendTo(socket, { type: "room.error", code: err.code ?? "ROOM_JOIN_FAILED", message: err.message ?? "Failed to join room" })
  }
}

async function handleChat(socket: AuthedSocket, roomId: string, body: string) {
  if (!socket.authenticated || !socket.userId) return
  await assertMembership(roomId, socket.userId)

  const message = await createMessage({
    roomId,
    userId: socket.userId,
    userName: socket.userName ?? "User",
    body,
  })

  broadcast(roomId, {
    type: "chat.message",
    message: {
      id: message.id,
      userId: message.userId,
      userName: socket.userName,
      userImage: message.user.image ?? undefined,
      body: message.body,
      createdAt: message.createdAt,
    },
  })
}

async function handlePlaybackCommand(socket: AuthedSocket, roomId: string, command: unknown) {
  if (!socket.authenticated || !socket.userId) return
  await assertMembership(roomId, socket.userId)

  const c = command as {
    action?: string
    positionMs?: number
    version?: number
  }
  if (!c.action || typeof c.version !== "number") {
    sendTo(socket, { type: "playback.error", code: "INVALID_COMMAND" })
    return
  }

  try {
    const [updated] = await applyCommand({
      roomId,
      userId: socket.userId,
      command: {
        action: c.action as "play" | "pause" | "seek",
        positionMs: c.positionMs,
        version: c.version,
      },
    })
    const payload = {
      type: "playback.state",
      roomId,
      state: updated.state,
      positionMs: effectivePositionMs(updated),
      version: updated.version,
      updatedBy: updated.updatedById,
      updatedAt: updated.updatedAt,
      media: {
        id: updated.media.id,
        title: updated.media.title,
        providerId: updated.providerId,
        originalUrl: updated.media.originalUrl,
      },
    }
    // Broadcast to everyone in the room, including the sender, so all clients
    // converge on the server-authoritative state.
    broadcast(roomId, payload)
  } catch (err: any) {
    sendTo(socket, {
      type: "playback.error",
      code: err.code ?? "COMMAND_REJECTED",
      message: err.message ?? "Command rejected",
    })
  }
}

async function handleReconcile(socket: AuthedSocket, roomId: string, version: number) {
  if (!socket.authenticated) return
  const session = await getSession(roomId)
  if (!session) return
  if (session.version !== version) {
    sendTo(socket, {
      type: "playback.state",
      roomId,
      state: session.state,
      positionMs: session.positionMs,
      version: session.version,
      updatedBy: session.updatedById,
      updatedAt: session.updatedAt,
    })
  }
}

const wss = new WebSocketServer({ port: PORT })

// Heartbeat to detect dead connections.
setInterval(() => {
  for (const client of clients) {
    if (client.isAlive === false) return client.terminate()
    client.isAlive = false
    client.ping()
  }
}, HEARTBEAT_INTERVAL_MS)
wss.on("connection", (client) => {
  ;(client as AuthedSocket).isAlive = true
})
wss.on("connection", (ws, req) => {
  const socket = ws as AuthedSocket
  socket.lastPong = Date.now()
  socket.on("pong", () => {
    socket.lastPong = Date.now()
    socket.isAlive = true
  })
  clients.add(socket)

  let authed = false

  const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`)
  const token = url.searchParams.get("token")

  socket.on("message", async (raw) => {
    let message: unknown
    try {
      message = JSON.parse(String(raw))
    } catch {
      sendTo(socket, { type: "error", code: "INVALID_JSON" })
      return
    }

    const m = message as { type?: string }
    if (!authed) {
      if (m.type === "auth") {
        const mm = m as { token?: string }
        authed = await authenticate(socket, mm.token ?? token)
      } else {
        sendTo(socket, { type: "auth.error", code: "AUTHENTICATION_REQUIRED" })
      }
      return
    }

    try {
      switch (m.type) {
        case "room.join": {
          const mm = m as { roomId?: string }
          if (typeof mm.roomId === "string") await handleJoin(socket, mm.roomId)
          break
        }
        case "chat.send": {
          const mm = m as { body?: string }
          if (socket.roomId && typeof mm.body === "string") await handleChat(socket, socket.roomId, mm.body)
          break
        }
        case "playback.command": {
          const mm = m as { command?: unknown }
          if (socket.roomId) await handlePlaybackCommand(socket, socket.roomId, mm.command)
          break
        }
        case "playback.sync": {
          const mm = m as {
            currentTime?: number
            isPlaying?: boolean
            playbackRate?: number
            updatedAt?: number
          }
          if (
            !socket.roomId ||
            !socket.authenticated ||
            !socket.userId ||
            typeof mm.currentTime !== "number"
          ) {
            break
          }
          // Only the room host may author sync state.
          if (socket.role !== "HOST" && socket.role !== "MODERATOR") {
            sendTo(socket, {
              type: "playback.error",
              code: "FORBIDDEN",
              message: "Only the host can broadcast sync state",
            })
            break
          }
          const now = Date.now()
          const state = {
            currentTime: mm.currentTime,
            isPlaying: mm.isPlaying ?? false,
            playbackRate: mm.playbackRate ?? 1,
            updatedAt: mm.updatedAt ?? now,
            hostId: socket.userId,
          }
          // Persist latest sync state for new joiners.
          const existing = roomSyncState.get(socket.roomId)
          roomSyncState.set(socket.roomId, {
            ...state,
            hostId: socket.userId,
            version: (existing?.version ?? 0) + 1,
          })
          // Relay to everyone in the room (including the sender for echo consistency).
          broadcast(socket.roomId, {
            type: "playback.sync",
            roomId: socket.roomId,
            currentTime: state.currentTime,
            isPlaying: state.isPlaying,
            playbackRate: state.playbackRate,
            updatedAt: state.updatedAt,
            hostId: socket.userId,
          })
          break
        }
        case "playback.sync.request": {
          if (socket.roomId) {
            sendSyncState(socket, socket.roomId)
          }
          break
        }
        case "playback.reconcile": {
          const mm = m as { version?: unknown }
          if (socket.roomId && typeof mm.version === "number")
            await handleReconcile(socket, socket.roomId, mm.version)
          break
        }
        case "webrtc.offer": {
          const mm = m as { to?: string; sdp?: string; roomId?: string }
          if (!socket.authenticated || !socket.roomId || !mm.to || !mm.sdp) break
          sendToUser(socket.roomId, mm.to, {
            type: "webrtc.offer",
            roomId: socket.roomId,
            from: socket.userId,
            sdp: mm.sdp,
          })
          break
        }
        case "webrtc.answer": {
          const mm = m as { to?: string; sdp?: string; roomId?: string }
          if (!socket.authenticated || !socket.roomId || !mm.to || !mm.sdp) break
          sendToUser(socket.roomId, mm.to, {
            type: "webrtc.answer",
            roomId: socket.roomId,
            from: socket.userId,
            sdp: mm.sdp,
          })
          break
        }
        case "webrtc.ice-candidate": {
          const mm = m as { to?: string; candidate?: unknown; roomId?: string }
          if (!socket.authenticated || !socket.roomId || !mm.to || !mm.candidate) break
          sendToUser(socket.roomId, mm.to, {
            type: "webrtc.ice-candidate",
            roomId: socket.roomId,
            from: socket.userId,
            candidate: mm.candidate,
          })
          break
        }
        case "webrtc.screen-share.started": {
          if (!socket.authenticated || !socket.roomId) break
          broadcast(socket.roomId, {
            type: "webrtc.screen-share.started",
            roomId: socket.roomId,
            from: socket.userId,
          }, socket)
          break
        }
        case "webrtc.screen-share.stopped": {
          if (!socket.authenticated || !socket.roomId) break
          broadcast(socket.roomId, {
            type: "webrtc.screen-share.stopped",
            roomId: socket.roomId,
            from: socket.userId,
          }, socket)
          break
        }
        default:
          sendTo(socket, { type: "error", code: "UNKNOWN_MESSAGE" })
      }
    } catch (err: any) {
      sendTo(socket, { type: "error", code: err.code ?? "SERVER_ERROR", message: err.message ?? "Server error" })
    }
  })

  socket.on("close", () => {
    clients.delete(socket)
    if (socket.roomId) {
      const set = roomClients.get(socket.roomId)
      set?.delete(socket)
      if (socket.authenticated && socket.userId) {
        // Only announce departure when the user's LAST connection in this
        // room closed: another tab or a reconnecting socket must not remove
        // a user who is still connected.
        if (!userStillConnected(socket.roomId, socket)) {
          broadcast(socket.roomId, {
            type: "presence.left",
            userId: socket.userId,
            userName: socket.userName,
          })
        }
      }
      if (roomClients.get(socket.roomId)?.size === 0) {
        roomClients.delete(socket.roomId)
        roomSyncState.delete(socket.roomId)
      }
    }
  })

  socket.on("error", () => {
    socket.close()
  })

  // Authenticate immediately if a token was supplied in the query string.
  if (token) {
    authenticate(socket, token).then((ok) => {
      authed = ok
    })
  }
})

// Periodic reconciliation: keeps clients aligned and repairs drift.
setInterval(async () => {
  for (const [roomId, set] of roomClients.entries()) {
    if (set.size === 0) continue
    const session = await getSession(roomId).catch(() => null)
    if (!session) continue
    const payload = {
      type: "playback.state",
      roomId,
      state: session.state,
      positionMs: effectivePositionMs(session),
      version: session.version,
      updatedBy: session.updatedById,
      updatedAt: session.updatedAt,
    }
    const message = JSON.stringify(payload)
    for (const client of set) {
      if (client.readyState === WebSocket.OPEN) client.send(message)
    }
  }
}, RECONCILIATION_INTERVAL_MS)

process.on("SIGTERM", () => wss.close())
process.on("SIGINT", () => wss.close())

console.log(`[watchstudio] WebSocket server listening on :${PORT}`)
