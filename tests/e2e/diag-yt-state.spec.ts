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

test("diagnose YT state transitions", async ({ page }) => {
  test.setTimeout(90000)
  page.on("console", (m) => {
    if (m.text().includes("YT-STATE")) console.log("BROWSER:", m.text())
  })

  const userA = makeUser("alice")
  await registerUser(page, userA)
  await page.goto(`${BASE_URL}/library`, { waitUntil: "commit" })
  await page.getByRole("button", { name: "Add media link" }).click()
  await page.locator('input[id="title"]').filter({ visible: true }).fill("Diag YT Media")
  await page.locator('input[id="originalUrl"]').filter({ visible: true }).fill(YOUTUBE_EMBEDDABLE_URL)
  await page.getByRole("button", { name: "Save link" }).filter({ visible: true }).first().click()
  await expect(page.locator("text=Diag YT Media")).toBeVisible({ timeout: 15000 })

  await page.getByRole("link", { name: "Watch Rooms" }).click()
  await page.getByRole("button", { name: "Create room" }).click()
  await page.getByLabel("Room name").fill("Diag YT Room")
  await page.selectOption("#media", { label: "Diag YT Media (MOVIE)" })
  await page.getByRole("button", { name: "Create room" }).click()
  await expect(page).not.toHaveURL(`${BASE_URL}/rooms/create`, { timeout: 15000 })
  await expect(page).toHaveURL(/\/rooms\/[a-zA-Z0-9-]+$/, { timeout: 15000 })

  await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 20000 })
  await expect(page.getByText("Loading player…")).toBeHidden({ timeout: 30000 })

  // Hook YT state events.
  await page.evaluate(() => {
    const p = (window as any).YT?.get?.("watchstudio-yt-player")
    console.log("YT-STATE hook, initial:", p?.getPlayerState(), "player found:", !!p)
    p?.addEventListener("onStateChange", (e: any) => console.log("YT-STATE", e.data))
  })

  const stateOf = () =>
    page.evaluate(() => {
      const p = (window as any).YT?.get?.("watchstudio-yt-player")
      return p ? p.getPlayerState() : null
    })

  console.log("initial state:", await stateOf())
  await page.getByRole("button", { name: "Play" }).click()
  await page.waitForTimeout(3000)
  console.log("after play:", await stateOf())
  await page.getByRole("button", { name: "Pause" }).click()
  await page.waitForTimeout(3000)
  console.log("after pause:", await stateOf())
  await page.waitForTimeout(2000)
  console.log("2s later:", await stateOf())
})
