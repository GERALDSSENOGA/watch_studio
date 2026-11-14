"use client"

import { classNames } from "@/lib/utils"

/**
 * Indeterminate loading indicator: a row of dots with a travelling highlight,
 * used instead of a spinner where a calmer, less busy progress cue fits better.
 */
export function DottedLoader({
  label,
  dotCount = 10,
  className,
}: {
  label?: string
  dotCount?: number
  className?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={classNames("flex flex-col items-center gap-3", className)}
    >
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {Array.from({ length: dotCount }).map((_, index) => (
          <span
            key={index}
            className="loading-dot h-1.5 w-1.5 rounded-full bg-foreground"
            style={{ animationDelay: `${index * 90}ms` }}
          />
        ))}
      </div>
      {label ? <p className="text-sm text-muted">{label}</p> : null}
    </div>
  )
}
