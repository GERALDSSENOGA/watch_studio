"use client"

import * as React from "react"
import { classNames } from "@/lib/utils"

export function Badge({
  className,
  variant = "default",
  size,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "success" | "warning" | "danger" | "muted"
  size?: "sm"
}) {
  const variants: Record<string, string> = {
    default: "border-transparent bg-accent text-accent-foreground",
    success: "border-transparent bg-success text-success-foreground",
    warning: "border-transparent bg-warning text-warning-foreground",
    danger: "border-transparent bg-danger text-danger-foreground",
    muted: "border-transparent bg-surface-hover text-muted-foreground",
  }
  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-full border font-semibold transition-colors",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-0.5 text-xs",
        variants[variant],
        className
      )}
      {...props}
    />
  )
}
