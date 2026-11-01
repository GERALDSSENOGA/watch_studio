"use client"

import * as React from "react"
import { useEffect, useCallback, useRef } from "react"
import { createPortal } from "react-dom"
import { classNames } from "@/lib/utils"

export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener("keydown", handleKeyDown)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = ""
    }
  }, [open, handleKeyDown])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={containerRef}
        className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-lg border border-border bg-surface shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        {title && (
          <div className="shrink-0 px-4 py-3 border-b border-border">
            <h2 id="dialog-title" className="text-lg font-semibold">
              {title}
            </h2>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        <div className="shrink-0 px-4 py-3 border-t border-border flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}

import { Button } from "./button"
