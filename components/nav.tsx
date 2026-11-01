"use client"

import * as React from "react"
import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Avatar } from "@/components/ui/avatar"

const navItems = [
  { href: "/", label: "Home" },
  { href: "/movies", label: "Movies" },
  { href: "/library", label: "My Library" },
  { href: "/rooms", label: "Watch Rooms" },
  { href: "/invitations", label: "Invitations" },
  { href: "/profile", label: "Profile" },
]

export function Nav() {
  const { data: session } = useSession({ required: false })
  const pathname = usePathname()

  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 p-3 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-xl tracking-tight"
          aria-label="WatchStudio home"
        >
          <span className="rounded bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
            WS
          </span>
          <span className="font-serif">WatchStudio</span>
        </Link>

        <div className="flex items-center gap-1 overflow-x-auto lg:overflow-visible lg:min-w-[320px]">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            )
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {!session ? (
            <>
              <Link href="/register" className="text-sm text-muted-foreground hover:text-foreground">
                Create account
              </Link>
              <Link href="/login" className="button-focus-ring rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-hover">
                Sign in
              </Link>
            </>
          ) : (
            <>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-hover"
              >
                Sign out
              </button>
              <Avatar
                src={session.user?.image ?? undefined}
                name={session.user?.name ?? undefined}
                size={30}
              />
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
