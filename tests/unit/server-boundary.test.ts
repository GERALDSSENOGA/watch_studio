import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fs from "node:fs"
import * as path from "node:path"

/**
 * Regression tests for the Prisma browser-runtime defect.
 *
 * Root cause: `/rooms/create` page was a client component ("use client") that
 * directly imported `listMedia` from `lib/services/media.service.ts`, which
 * imports `@/lib/db` (PrismaClient). PrismaClient cannot run in the browser,
 * causing: "PrismaClient is unable to run in this browser environment".
 *
 * Fix: Replaced direct service imports in the client component with calls to
 * Next.js server actions ("use server") that run database queries on the server.
 *
 * These tests verify:
 * 1. Client components ("use client") do not import server-only modules
 * 2. Server actions ("use server") are used for database access
 * 3. Server actions enforce authentication
 */

const APP_DIR = path.resolve(process.cwd(), "app")
const COMPONENTS_DIR = path.resolve(process.cwd(), "components")
const HOOKS_DIR = path.resolve(process.cwd(), "hooks")

/**
 * Recursively find all .tsx and .ts files under a directory.
 */
function findFiles(dir: string, extensions = [".tsx", ".ts"]): string[] {
  let results: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results = results.concat(findFiles(fullPath, extensions))
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath)
    }
  }
  return results
}

/**
 * Check if a file is a client component ("use client" directive).
 */
function isClientComponent(filePath: string): boolean {
  const content = fs.readFileSync(filePath, "utf-8")
  return /^["']use client["']/m.test(content)
}

/**
 * Check if a file imports server-only modules (Prisma, db, services).
 */
function importsServerOnlyModules(filePath: string): boolean {
  const content = fs.readFileSync(filePath, "utf-8")
  const serverOnlyPatterns = [
    /from ["']@\/lib\/db["']/,
    /from ["']@\/lib\/services\//,
    /from ["']@prisma\/client["']/,
    /from ["']\.\.\/lib\/db["']/,
    /from ["']\.\.\/lib\/services\//,
    /from ["']\.\.\/\.\.\/lib\/db["']/,
    /from ["']\.\.\/\.\.\/lib\/services\//,
  ]
  return serverOnlyPatterns.some((p) => p.test(content))
}

/**
 * Check if a file is a server action ("use server" directive).
 */
function isServerAction(filePath: string): boolean {
  const content = fs.readFileSync(filePath, "utf-8")
  return /^["']use server["']/m.test(content)
}

describe("Server/client boundary (Prisma runtime defect regression)", () => {
  it("client components do not import server-only modules", () => {
    const violations: Array<{ file: string; import: string }> = []

    for (const dir of [APP_DIR, COMPONENTS_DIR, HOOKS_DIR]) {
      if (!fs.existsSync(dir)) continue
      const files = findFiles(dir)
      for (const file of files) {
        if (isClientComponent(file) && importsServerOnlyModules(file)) {
          violations.push({ file, import: "server-only module" })
        }
      }
    }

    expect(violations).toEqual([])
  })

  it("/rooms/create page uses server actions for database access", () => {
    const createRoomPage = path.join(APP_DIR, "rooms/create/page.tsx")
    const content = fs.readFileSync(createRoomPage, "utf-8")

    // Page should be a client component (uses useSession, router, etc.)
    expect(isClientComponent(createRoomPage)).toBe(true)

    // Should NOT directly import media.service (Prisma)
    expect(content).not.toContain("@/lib/services/media.service")

    // Should import server actions
    expect(content).toContain("./action")
    expect(content).toContain("./list-media-action")
  })

  it("server actions use 'use server' directive", () => {
    const actionFile = path.join(APP_DIR, "rooms/create/action.ts")
    const listMediaActionFile = path.join(APP_DIR, "rooms/create/list-media-action.ts")

    expect(fs.existsSync(actionFile)).toBe(true)
    expect(fs.existsSync(listMediaActionFile)).toBe(true)
    expect(isServerAction(actionFile)).toBe(true)
    expect(isServerAction(listMediaActionFile)).toBe(true)
  })

  it("server actions enforce authentication", () => {
    const actionFile = path.join(APP_DIR, "rooms/create/action.ts")
    const listMediaActionFile = path.join(APP_DIR, "rooms/create/list-media-action.ts")

    const actionContent = fs.readFileSync(actionFile, "utf-8")
    const listMediaContent = fs.readFileSync(listMediaActionFile, "utf-8")

    // Both should import auth and check session
    expect(actionContent).toContain("from \"@/lib/auth\"")
    expect(actionContent).toContain("await auth()")
    expect(actionContent).toContain("if (!session?.user)")
    expect(listMediaContent).toContain("from \"@/lib/auth\"")
    expect(listMediaContent).toContain("await auth()")
    expect(listMediaContent).toContain("if (!session?.user)")
  })
})
