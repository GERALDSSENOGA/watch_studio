"use client"

import { useEffect, useRef, useCallback, useState } from "react"

// Module-level socket cache shared across all RoomView instances so the
// signaling WebSocket survives page navigation (e.g. leaving a room tab while
// screen sharing is active). Without this, each mount/unmount closes the
// socket and pending WebRTC ICE restarts fail because signaling is unavailable.
let sharedSocketRef: WebSocket | null = null
let sharedListeners: Array<{ token: string; handlers: RoomSocketEventHandlers }> = []

export type RoomSocketEventHandlers = {
  onAuth?: (user: { id: string; name: string | null; email: string | null; image: string | null }) => void
  onPresence?: (users: Array<{ userId: string; userName: string | null; role: string }>) => void
  onPresenceJoined?: (user: { userId: string; userName: string | null; role: string }) => void
  onPresenceLeft?: (user: { userId: string; userName: string | null }) => void
  onChatMessage?: (message: {
    id: string
    userId: string
    userName: string | null
    userImage: string | null
    body: string
    createdAt: string
  }) => void
  onPlaybackState?: (state: {
    roomId: string
    state: string
    positionMs: number
    version: number
    updatedBy: string | null
    updatedAt: string
    media: { id: string; title: string; providerId: string; originalUrl: string }
  }) => void
  onPlaybackError?: (code: string, message?: string) => void
  onPlaybackSync?: (state: {
    roomId: string
    currentTime: number
    isPlaying: boolean
    playbackRate: number
    updatedAt: number
    hostId: string | null
  }) => void
  onWebRTCSignal?: (signal: { type: string; [key: string]: unknown }) => void
  onError?: (code: string, message?: string) => void
  onConnect?: () => void
  onDisconnect?: () => void
}

export function useRoomSocket({
  token,
  ...handlers
}: { token?: string } & RoomSocketEventHandlers) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const authenticatedRef = useRef(false)
  const handlersRef = useRef(handlers)
  const connectRef = useRef<(() => void) | null>(null)
  const [connected, setConnected] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  const baseUrl = (() => {
    if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_WS_URL) {
      return process.env.NEXT_PUBLIC_WS_URL
    }
    if (typeof window !== "undefined" && window.location) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
      return `${protocol}//${window.location.host}`
    }
    return "ws://localhost:3001"
  })()

  const connect = useCallback(() => {
    if (!token) return

    // Register this instance's handlers so incoming messages reach it.
    // Read from the ref: `handlers` is re-created on every render, and using it
    // here would give `connect` a new identity each render, re-running the
    // mount effect and tearing down/re-opening the socket in a loop.
    const listenerIndex = sharedListeners.findIndex((l) => l.token === token)
    if (listenerIndex === -1) {
      sharedListeners.push({ token, handlers: handlersRef.current })
    } else {
      sharedListeners[listenerIndex] = { token, handlers: handlersRef.current }
    }

    // Reuse the shared socket if it's open; otherwise create a new one.
    if (sharedSocketRef && sharedSocketRef.readyState === WebSocket.OPEN) {
      wsRef.current = sharedSocketRef
      setConnected(true)
      if (authenticatedRef.current) {
        handlersRef.current.onConnect?.()
      }
      return
    }
    if (sharedSocketRef && sharedSocketRef.readyState === WebSocket.CONNECTING) {
      wsRef.current = sharedSocketRef
      return
    }

    const url = `${baseUrl}/?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    sharedSocketRef = ws
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      handlersRef.current.onConnect?.()
    }

    ws.onmessage = (event) => {
      let message: unknown
      try {
        message = JSON.parse(event.data)
      } catch {
        return
      }
      const m = message as { type?: string }
      switch (m.type) {
        case "auth.ok": {
          const mm = m as { user: { id: string; name: string | null; email: string | null; image: string | null } }
          if (wsRef.current !== ws) wsRef.current = ws
          setAuthenticated(true)
          authenticatedRef.current = true
          handlersRef.current.onAuth?.(mm.user)
          break
        }
        case "auth.error": {
          const mm = m as { code: string; message?: string }
          handlersRef.current.onError?.(mm.code, mm.message)
          break
        }
        case "room.joined": {
          const mm = m as { presence: Array<{ userId: string; userName: string | null; role: string }> }
          handlersRef.current.onPresence?.(mm.presence ?? [])
          break
        }
        case "presence.joined": {
          const mm = m as { userId: string; userName: string | null; role: string }
          handlersRef.current.onPresenceJoined?.(mm)
          break
        }
        case "presence.left": {
          const mm = m as { userId: string; userName: string | null }
          handlersRef.current.onPresenceLeft?.(mm)
          break
        }
        case "chat.message": {
          const mm = m as { message: { id: string; userId: string; userName: string | null; userImage: string | null; body: string; createdAt: string } }
          handlersRef.current.onChatMessage?.(mm.message)
          break
        }
        case "playback.state": {
          const mm = m as {
            roomId: string
            state: string
            positionMs: number
            version: number
            updatedBy: string | null
            updatedAt: string
            media: { id: string; title: string; providerId: string; originalUrl: string }
          }
          handlersRef.current.onPlaybackState?.(mm)
          break
        }
        case "playback.error": {
          const mm = m as { code: string; message?: string }
          handlersRef.current.onPlaybackError?.(mm.code, mm.message)
          break
        }
        case "playback.sync.state": {
          const mm = m as {
            roomId: string
            currentTime: number
            isPlaying: boolean
            playbackRate: number
            updatedAt: number
            hostId: string | null
          }
          handlersRef.current.onPlaybackSync?.(mm)
          break
        }
        case "webrtc.offer":
        case "webrtc.answer":
        case "webrtc.ice-candidate":
        case "webrtc.screen-share.started":
        case "webrtc.screen-share.stopped":
        case "webrtc.screen-share.resume": {
          handlersRef.current.onWebRTCSignal?.(m as { type: string; [key: string]: unknown })
          break
        }
        default:
          break
      }
    }

    ws.onclose = () => {
      setConnected(false)
      if (wsRef.current === ws) wsRef.current = null
      if (sharedSocketRef === ws) sharedSocketRef = null
      handlersRef.current.onDisconnect?.()
      if (authenticatedRef.current) {
        reconnectTimerRef.current = setTimeout(() => connectRef.current?.(), 2000)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [token, baseUrl])

  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  const send = useCallback((payload: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload))
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    connect()
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      // Remove our handlers from the shared listener list; don't close the
      // shared socket — other RoomView instances may still need it.
      sharedListeners = sharedListeners.filter((l) => l.token !== token)
      if (wsRef.current && wsRef.current !== sharedSocketRef) {
        wsRef.current.close()
      }
      wsRef.current = null
      setConnected(false)
      // If no listeners remain, close the shared socket.
      if (sharedListeners.length === 0 && sharedSocketRef) {
        sharedSocketRef.close()
        sharedSocketRef = null
      }
    }
  }, [connect, token])

  return {
    send,
    connected,
    authenticated,
  }
}
