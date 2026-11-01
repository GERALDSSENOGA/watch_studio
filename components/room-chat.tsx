"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Avatar } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

interface ChatMessage {
  id: string
  userId: string
  userName: string | null
  userImage: string | null
  body: string
  createdAt: string
}

interface RoomChatProps {
  roomId: string
  user: { id: string; name: string | null; image: string | null }
  messages: ChatMessage[]
  send: (payload: unknown) => void
  onMessageRemoved?: (messageId: string) => void
}

export function RoomChat({ roomId, user, messages, send }: RoomChatProps) {
  const [body, setBody] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const messagesEndRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = body.trim()
    if (!trimmed) return
    setSending(true)
    send({ type: "chat.send", roomId, body: trimmed })
    setBody("")
    setSending(false)
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle>Room chat</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto pb-2 space-y-3">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center">No messages yet.</p>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className="flex gap-2 animate-in fade-in slide-in-from-top-2 duration-200"
            >
              <Avatar
                src={message.userImage ?? undefined}
                name={message.userName ?? undefined}
                size={24}
              />
              <div className="flex flex-col">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-semibold">{message.userName ?? "User"}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-sm break-words">{message.body}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <form onSubmit={handleSend} className="mt-3 flex gap-2 border-t border-border pt-3">
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Say something…"
            disabled={sending}
            className="flex-1"
          />
          <Button type="submit" disabled={sending || !body.trim()}>
            Send
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
