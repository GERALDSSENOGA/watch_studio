/**
 * Playwright regression test for the reported console error:
 *   "Encountered two children with the same key, <userId>"
 * in components/room-presence.tsx — the Watching panel rendered the same user
 * twice. This test drives the real WebSocket presence flow with two
 * authenticated users joining through a real invitation and fails if the
 * duplicate-key error or duplicate participant rows appear.
 */
import { test, expect } from "@playwright/test"

const BASE_URL = "http://localhost:3000"
const YOUTUBE_EMBEDDABLE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

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

async function addMedia(page: any, title: string, url: string) {
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
  await page.getByRole("button", { name: "Save link" }).filter({ visible: true }).first().click()
  await expect(page.locator(`text=${title}`)).toBeVisible({ timeout: 15000 })
}

test("presence renders each user exactly once (no duplicate-key warning)", async ({ page, browser }) => {
  test.setTimeout(120000)
  // Collect console errors so the duplicate-key warning fails the test.
  const consoleErrors: string[] = []
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text())
  })
  page.on("pageerror", (err) => consoleErrors.push(String(err)))

  const userA = makeUser("alice")
  await registerUser(page, userA)
  await addMedia(page, "Presence Sync Media", YOUTUBE_EMBEDDABLE_URL)

  // Create room with the saved media selected.
  await page.getByRole("link", { name: "Watch Rooms" }).click()
  await page.getByRole("button", { name: "Create room" }).click()
  await page.getByLabel("Room name").fill("Presence Room")
  await page.selectOption("#media", { label: "Presence Sync Media (MOVIE)" })
  await page.getByRole("button", { name: "Create room" }).click()
  await expect(page).not.toHaveURL(`${BASE_URL}/rooms/create`, { timeout: 15000 })
  await expect(page).toHaveURL(/\/rooms\/[a-zA-Z0-9-]+$/, { timeout: 15000 })
  const roomUrl = page.url()

  let inviteToken: string | null = null
  page.on("response", async (res) => {
    if (res.url().includes("/api/invitations") && res.request().method() === "POST") {
      const body = await res.json().catch(() => ({}))
      if (body.token) inviteToken = body.token
    }
  })
  await page.getByRole("button", { name: "Invite friends" }).click()
  await expect(page.getByText("Invitation copied", { exact: false })).toBeVisible({ timeout: 15000 })
  await expect.poll(() => inviteToken, { timeout: 10000 }).toBeTruthy()

  // Second independent user joins through the invitation API + room page.
  const userB = makeUser("bob")
  const contextB = await browser.newContext()
  const pageB = await contextB.newPage()
  await registerUser(pageB, userB)
  const res: any = await pageB.request.post(`${BASE_URL}/api/invitations/${inviteToken}`, { timeout: 30000 })
  expect(res.status()).toBe(200)
  await pageB.goto(roomUrl, { waitUntil: "commit" })
  await expect(pageB.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 20000 })

  // The host's presence must show exactly once, and both users appear.
  await expect(page.getByText(userA.name).first()).toBeVisible({ timeout: 20000 })
  await expect(page.getByText(userB.name).first()).toBeVisible({ timeout: 20000 })
  const participantCount = await page.getByText(/Participants \(\d+\)/).first().textContent()
  console.log("participant counter:", participantCount)
  expect(participantCount).toMatch(/Participants \(2\)/)

  // The duplicate-key React error must not appear anywhere.
  const duplicateKeyErrors = consoleErrors.filter((e) => e.includes("two children with the same key"))
  expect(duplicateKeyErrors).toEqual([])

  await contextB.close()
})
