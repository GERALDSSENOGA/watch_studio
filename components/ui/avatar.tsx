"use client"

import * as React from "react"
import { classNames } from "@/lib/utils"

export function Avatar({
  className,
  src,
  name,
  size = 32,
}: {
  className?: string
  src?: string
  name?: string
  size?: number
}) {
  return (
    <div
      className={classNames(
        "relative flex shrink-0 items-center justify-center rounded-full border",
        `h-${size} w-${size}`,
        className
      )}
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="rounded-full"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-bold">
          {(name?.match(/\b\w/g) || []).join("").toUpperCase().slice(0, 2) || "?"}
        </div>
      )}
    </div>
  )
}
