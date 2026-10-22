"use client"

import * as React from "react"
import { classNames } from "@/lib/utils"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "danger" | "link"
  size?: "default" | "sm"
}

export function Button({
  className,
  variant = "default",
  size = "default",
  disabled,
  ...props
}: ButtonProps) {

  const base =
    "inline-flex items-center justify-center gap-2 rounded-md border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none"
  const sizeClasses: Record<string, string> = {
    default: "h-10 px-4 text-sm",
    sm: "h-9 px-3 text-xs",
  }
  const variants: Record<string, string> = {
    default: "bg-accent text-foreground hover:bg-accent-hover border-transparent",
    ghost: "bg-surface hover:bg-surface-hover border-transparent text-foreground",
    danger: "bg-danger-muted text-danger border border-danger hover:bg-danger/20",
    link: "bg-transparent border-transparent text-accent hover:underline",
  }

  return (
    <button
      className={classNames(base, sizeClasses[size], variants[variant], className)}
      disabled={disabled}
      {...props}
    />
  )
}
