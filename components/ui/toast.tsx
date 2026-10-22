"use client"

import * as React from "react"
import { classNames } from "@/lib/utils"

type Toast = { id: string; title: string; description?: string; variant?: "default" | "danger" | "success" }

type ToastContext = {
  toasts: Toast[]
  add: (toast: Omit<Toast, "id">) => void
  remove: (id: string) => void
}

const ToastContext = React.createContext<ToastContext | null>(null)

let nextId = 0
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const add = (toast: Omit<Toast, "id">) => {
    const id = String(++nextId)
    setToasts((t) => [...t, { ...toast, id }])
    if (toast.variant !== "success") {
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000)
    }
  }

  const remove = (id: string) => setToasts((t) => t.filter((x) => x.id !== id))

  return (
    <ToastContext.Provider value={{ toasts, add, remove }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={classNames(
              "pointer-events-auto flex w-[380px] flex-col gap-2 rounded-lg border bg-surface p-4 text-sm shadow-lg",
              t.variant === "danger" ? "border-danger" : "border-border",
              t.variant === "success" ? "border-success" : ""
            )}
          >
            <div className="flex items-start gap-2">
              <div className="shrink-0">{t.variant === "danger" ? "✕" : t.variant === "success" ? "✓" : "ℹ"}</div>
              <div>
                {t.title && <p className="font-semibold">{t.title}</p>}
                {t.description && <p className="text-muted-foreground">{t.description}</p>}
              </div>
              <button
                onClick={() => remove(t.id)}
                className="ml-2 inline opacity-50 hover:opacity-100"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function ToastContainer() {
  return null
}

export function useToast() {
  const context = React.useContext(ToastContext)
  if (!context) throw new Error("useToast must be used within a ToastProvider")
  return context
}
