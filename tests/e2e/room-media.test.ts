/**
 * Regression tests for room-media selection and playback-mode display
 * (Issues B/C from the screen recording):
 *  - A room created without media shows ONLY the actionable "No media
 *    selected" guidance — not "Mode C · unsupported" plus two overlapping
 *    error panels.
 *  - A room with an unsupported (generic) source shows ONE combined Mode C
 *    panel with an actionable "open link" affordance — not Mode B + Mode C
 *    stacked together.
 *  - A room's selected media survives a refresh.
 */
import { test, expect } from "@playwright/test"

const BASE_URL = "http://localhost:3000"
const YOUTUBE_EMBEDDABLE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
const UNSUPPORTED_URL = "https://example.com/some-stream"

function makeUser(prefix: string) {
  return { name: `${prefix} Tester`, email: `${prefix}.${Date.now()}@example.com`, password: "Password123!" }
}

async function registerUser(page: any, user: any) {
  await page.goto(`${BASE_URL}/register`, { waitUntil: "load" })
  await page.getByLabel("Full name").fill(user.name)
  await page.getByLabel("Email").fill(user.email)
  await page.getByLabel("Password").fill(user.password)
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page).toHaveURL(`${BASE_URL}/`, { timeout: 20000 })
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 20000 })
}

async function addMedia(page: any, title: string, url: string, category: "MOVIE" | "MOVIE") {
  await page.goto(`${BASE_URL}/library`, { waitUntil: "commit" })
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByRole("button", { name: "Add media link" }).click()
    try {
      await expect(page.locator('input[id="title"]').filter({ visible: true })).toBeVisible({ timeout: 4000 })
      break
    } catch {
      if (attempt === 2) throw new Error("Add-media dialog did not open")
    }
  }
  await page.locator('input[id="title"]').filter({ visible: true }).fill(title)
  await page.locator('input[id="originalUrl"]').filter({ visible: true }).fill(url)
  if (category === "MOVIE") await page.getByRole("button", { name: "Movie" }).filter({ visible: true }).first().click()
  await page.getByRole("button", { name: "Save link" }).filter({ visible: true }).first().click()
  await expect(page.locator(`text=${title}`)).toBeVisible({ timeout: 15000 })
}

async function createRoom(page: any, roomName: string, mediaTitle: string | null, category?: string) {
  await page.getByRole("link", { name: "Watch Rooms" }).click()
  await page.getByRole("button", { name: "Create room" }).click()
  await page.getByLabel("Room name").fill(roomName)
  if (mediaTitle && category) {
    await page.selectOption("#media", { label: `${mediaTitle} (${category})` })
  }
  await page.getByRole("button", { name: "Create room" }).click()
  await expect(page).not.toHaveURL(`${BASE_URL}/rooms/create`, { timeout: 15000 })
  await expect(page).toHaveURL(/\/rooms\/[a-zA-Z0-9-]+$/, { timeout: 15000 })
}

test("an empty room shows only the guidance card (no misleading mode panels)", async ({ page }) => {
  const user = makeUser("alice")
  await registerUser(page, user)
  await createRoom(page, "Empty Media Room", null)

  // The actionable guidance must be present.
  await expect(page.getByText("No media selected", { exact: false }).first()).toBeVisible({ timeout: 15000 })

  // The misleading mode badge and both error panels must NOT render.
  await expect(page.getByText("Mode C · unsupported")).toHaveCount(0)
  await expect(page.getByText(/Mode C —/)).toHaveCount(0)
  await expect(page.getByText(/Mode B —/)).toHaveCount(0)
})

test("an unsupported source shows one combined panel with an actionable link", async ({ page }) => {
  const user = makeUser("alice")
  await registerUser(page, user)
  await addMedia(page, "Generic Stream", UNSUPPORTED_URL, "MOVIE")
  await createRoom(page, "Unsupported Room", "Generic Stream", "MOVIE")

  // Exactly one Mode C explanation panel, including the preserved
  // open-the-link affordance.
  await expect(page.getByText(/Mode C — this source can't be embedded or synchronized/i)).toHaveCount(1)
  await expect(page.getByRole("link", { name: /Open link in a new tab/i })).toHaveCount(1)
  // The old stacked Mode B panel must not appear alongside it.
  await expect(page.getByText("Mode B — watch on provider")).toHaveCount(0)
})

test("a direct video file renders a native player instead of the external fallback", async ({ page }) => {
  const user = makeUser("alice")
  await registerUser(page, user)
  await addMedia(page, "Direct File Clip", "https://example.com/clip.mp4", "MOVIE")
  await createRoom(page, "Direct File Room", "Direct File Clip", "MOVIE")

  // A real <video> element is rendered (embedded, local-only playback).
  await expect(page.locator("video")).toHaveCount(1, { timeout: 15000 })
  await expect(page.getByText("Mode B · embedded (no sync)")).toBeVisible()
  // The generic "watch on provider" panel must NOT be shown for a direct file.
  await expect(page.getByText("Mode B — watch on provider")).toHaveCount(0)
})

test("selected media persists across refresh and Mode A renders", async ({ page }) => {
  const user = makeUser("alice")
  await registerUser(page, user)
  await addMedia(page, "Persist Sync Media", YOUTUBE_EMBEDDABLE_URL, "MOVIE")
  await createRoom(page, "Persist Room", "Persist Sync Media", "MOVIE")

  await expect(page.getByText("Mode A · synchronized")).toBeVisible({ timeout: 20000 })
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 20000 })

  // Refresh: the room keeps its selected media (Mode A renders; the media
  // remains attached to the host's change-media selector).
  await page.reload({ waitUntil: "commit" })
  await expect(page.getByText("Mode A · synchronized")).toBeVisible({ timeout: 20000 })
  await expect(page.locator('select option:has-text("Persist Sync Media")').first()).toBeAttached({
    timeout: 20000,
  })
  // No "no media selected" regression after refresh.
  await expect(page.getByText("No media selected", { exact: false })).toHaveCount(0)

  // Sanity: an embeddable YouTube URL stays recognized as Mode A.
  await expect(page.getByText(YOUTUBE_EMBEDDABLE_URL)).toHaveCount(0)
})
