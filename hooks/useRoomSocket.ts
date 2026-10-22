"use client"

import { useEffect, useRef, useCallback } from "react"

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
  handlersRef.current = handlers

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
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const url = `${baseUrl}/?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
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
        default:
          break
      }
    }

    ws.onclose = () => {
      wsRef.current = null
      handlersRef.current.onDisconnect?.()
      if (authenticatedRef.current) {
        reconnectTimerRef.current = setTimeout(connect, 2000)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [token, baseUrl])

  const send = useCallback((payload: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload))
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  return {
    send,
    connected: wsRef.current?.readyState === WebSocket.OPEN,
    authenticated: authenticatedRef.current,
  }
}
