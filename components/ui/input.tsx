"use client"

import * as React from "react"
import { classNames } from "@/lib/utils"

export function Input({
  className,
  type = "text",
  disabled,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return (
    <input
      type={type}
      className={classNames(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        error && "border-danger",
        className
      )}
      disabled={disabled}
      {...props}
    />
  )
}
