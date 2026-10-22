import dotenv from "dotenv"
dotenv.config()

import { WebSocketServer, WebSocket } from "ws"
import { validateSessionToken } from "../lib/auth"
import { prisma } from "../lib/db"
import { applyCommand, getSession } from "../lib/services/playback.service"
import { createMessage, getMessages } from "../lib/services/chat.service"
import { assertMembership } from "../lib/services/room.service"

const PORT = Number(process.env.WS_PORT ?? 3001)
const HEARTBEAT_INTERVAL_MS = 30_000
const RECONCILIATION_INTERVAL_MS = 5_000

interface AuthedSocket extends WebSocket {
  userId?: string
  userName?: string
  roomId?: string
  authenticated: boolean
  lastPong: number
  isAlive: boolean
}

const clients = new Set<AuthedSocket>()
const roomClients = new Map<string, Set<AuthedSocket>>()

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

function presenceSnapshot(roomId: string) {
  const set = roomClients.get(roomId)
  if (!set) return []
  return Array.from(set)
    .filter((c) => c.authenticated && c.userId)
    .map((c) => ({ userId: c.userId!, userName: c.userName, role: "member" }))
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
  const role = await assertMembership(roomId, socket.userId)
  if (!role) return

  socket.roomId = roomId
  roomSet(roomId).add(socket)

  sendTo(socket, { type: "room.joined", roomId, role, presence: presenceSnapshot(roomId) })
  broadcast(roomId, { type: "presence.joined", userId: socket.userId, userName: socket.userName, role }, socket)

  // Send current playback state so a reconciling client converges immediately.
  const session = await getSession(roomId)
  if (session) {
    sendTo(socket, {
      type: "playback.state",
      roomId,
      state: session.state,
      positionMs: session.positionMs,
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
      positionMs: updated.positionMs,
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
      case "playback.reconcile": {
        const mm = m as { version?: unknown }
        if (socket.roomId && typeof mm.version === "number")
          await handleReconcile(socket, socket.roomId, mm.version)
        break
      }
      default:
        sendTo(socket, { type: "error", code: "UNKNOWN_MESSAGE" })
    }
  })

  socket.on("close", () => {
    clients.delete(socket)
    if (socket.roomId) {
      roomClients.get(socket.roomId)?.delete(socket)
      if (socket.authenticated && socket.userId) {
        broadcast(socket.roomId, {
          type: "presence.left",
          userId: socket.userId,
          userName: socket.userName,
        })
      }
      if (roomClients.get(socket.roomId)?.size === 0) {
        roomClients.delete(socket.roomId)
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
      positionMs: session.positionMs,
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
