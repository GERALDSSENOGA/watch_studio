import type { Metadata } from "next"
import { SessionProvider } from "next-auth/react"
import "./globals.css"
import { Nav } from "@/components/nav"
import { ToastProvider } from "@/components/ui/toast"
import { ScreenShareProvider } from "@/components/screen-share-context"
import { validateEnv, logEnvValidation } from "@/lib/env-validation"

// Validate environment on first server-side render
let envValidated = false
if (!envValidated && typeof process !== "undefined" && process.env) {
  const result = validateEnv(process.env as Record<string, string | undefined>)
  logEnvValidation(result)
  envValidated = true
}

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
            <ScreenShareProvider>
              <main>{children}</main>
            </ScreenShareProvider>
          </ToastProvider>
        </body>
      </html>
    </SessionProvider>
  )
}
