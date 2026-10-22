import type { Metadata } from "next"
import { SessionProvider } from "next-auth/react"
import "./globals.css"
import { Nav } from "@/components/nav"
import { ToastProvider } from "@/components/ui/toast"

export const metadata: Metadata = {
  title: "WatchStudio",
  description: "Save and watch video links with friends, in sync.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SessionProvider>
      <html lang="en" suppressHydrationWarning>
        <body className="antialiased min-h-screen text-foreground bg-background">
          <Nav />
          <ToastProvider>
            <main>{children}</main>
          </ToastProvider>
        </body>
      </html>
    </SessionProvider>
  )
}
