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

async function addMedia(page: any, title: string, url: string, category: "MOVIE" | "MOVIE") {
  await page.goto(`${BASE_URL}/library`, { waitUntil: "commit" })
  // Retry the click: hydration can briefly lag the click.
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

async function isolatedUser(browser: any, user: any) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await registerUser(page, user)
  return { page, context }
}

/** Read the REAL YouTube player state (-1 unstarted, 1 playing, 2 paused,
 *  5 cued) via the IFrame API — not a button label. */
async function ytState(page: any): Promise<number | null> {
  return page.evaluate(() => {
    const p = (window as any).YT?.get?.("watchstudio-yt-player")
    return p ? p.getPlayerState() : null
  })
}

/** Read the REAL player position in seconds via the IFrame API. */
async function ytPositionSeconds(page: any): Promise<number | null> {
  return page.evaluate(() => {
    const p = (window as any).YT?.get?.("watchstudio-yt-player")
    return p ? p.getCurrentTime() : null
  })
}

/** Create a room (as the page's user) backed by the given media title, and
 *  capture the invitation token from the creation API response. */
async function createRoomWithInvite(page: any, roomName: string, mediaTitle: string, category: string) {
  await page.getByRole("link", { name: "Watch Rooms" }).click()
  await page.getByRole("button", { name: "Create room" }).click()
  await page.getByLabel("Room name").fill(roomName)
  await page.selectOption("#media", { label: `${mediaTitle} (${category})` })
  await page.getByRole("button", { name: "Create room" }).click()
  await expect(page).not.toHaveURL(`${BASE_URL}/rooms/create`, { timeout: 15000 })
  await expect(page).toHaveURL(/\/rooms\/[a-zA-Z0-9-]+$/, { timeout: 15000 })
  const roomUrl = page.url()

  let inviteToken: string | null = null
  page.on("response", async (res: any) => {
    if (res.url().includes("/api/invitations") && res.request().method() === "POST") {
      const body = await res.json().catch(() => ({}))
      if (body.token) inviteToken = body.token
    }
  })
  await page.getByRole("button", { name: "Invite friends" }).click()
  await expect(page.getByText("Invitation copied", { exact: false })).toBeVisible({ timeout: 15000 })
  await expect.poll(() => inviteToken, { timeout: 10000 }).toBeTruthy()
  return { roomUrl, inviteToken: inviteToken! }
}

/** Wait until a room page has a live WebSocket, joined presence, and a ready
 *  YouTube player (the "Loading player…" overlay is gone). */
async function waitForRoomReady(page: any, hostName: string) {
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 20000 })
  await expect(page.getByText("Mode A · synchronized")).toBeVisible({ timeout: 20000 })
  await expect(page.getByText("Loading player…")).toBeHidden({ timeout: 30000 })
  await expect(page.getByText(hostName).first()).toBeVisible({ timeout: 20000 })
}

test.describe.serial("Playback synchronization (real embedded players)", () => {
  test("a newly loaded player does not play while the server state is paused", async ({ page }) => {
    const userA = makeUser("alice")
    await registerUser(page, userA)
    await addMedia(page, "Init Sync Media", YOUTUBE_EMBEDDABLE_URL, "MOVIE")
    await createRoomWithInvite(page, "Init Sync Room", "Init Sync Media", "MOVIE")

    await waitForRoomReady(page, userA.name)
    await page.waitForTimeout(1000)

    // The authoritative session is PAUSED v1 (no commands yet).
    await expect(page.getByText(/^1s|0s/).first()).toBeVisible()
    // The REAL player must NOT be playing (state 1). Cued (5) / paused (2) / unstarted (-1) are honest.
    const state = await ytState(page)
    expect(state).not.toBe(1)
  })

  test("host play and pause propagate to both real players", async ({ page, browser }) => {
    const userA = makeUser("alice")
    await registerUser(page, userA)
    await addMedia(page, "Sync Media", YOUTUBE_EMBEDDABLE_URL, "MOVIE")
    const { roomUrl, inviteToken } = await createRoomWithInvite(page, "Play Sync Room", "Sync Media", "MOVIE")

    const userB = makeUser("bob")
    const { page: pageB, context: contextB } = await isolatedUser(browser, userB)
    const res: any = await pageB.request.post(`${BASE_URL}/api/invitations/${inviteToken}`, { timeout: 30000 })
    expect(res.status()).toBe(200)
    await pageB.goto(roomUrl, { waitUntil: "commit" })

    // Host plays (first command creates the authoritative session). The host
    // applies locally; B applies from the broadcast.
    await page.getByRole("button", { name: "Play" }).click()
    await expect(pageB.getByRole("button", { name: "Pause" })).toBeVisible({ timeout: 15000 })
    await expect.poll(() => ytState(page), { timeout: 20000 }).toBe(1)
    await expect.poll(() => ytState(pageB), { timeout: 20000 }).toBe(1)

    // Host pauses. Both real players stop.
    await page.getByRole("button", { name: "Pause" }).click()
    await expect(pageB.getByRole("button", { name: "Play" })).toBeVisible({ timeout: 15000 })
    await expect.poll(() => ytState(page), { timeout: 20000 }).toBe(2)
    await expect.poll(() => ytState(pageB), { timeout: 20000 }).toBe(2)

    await contextB.close()
  })

  test("seek updates the authoritative position and both real players", async ({ page, browser }) => {
    const userA = makeUser("alice")
    await registerUser(page, userA)
    await addMedia(page, "Seek Sync Media", YOUTUBE_EMBEDDABLE_URL, "MOVIE")
    const { roomUrl, inviteToken } = await createRoomWithInvite(page, "Seek Sync Room", "Seek Sync Media", "MOVIE")

    const userB = makeUser("bob")
    const { page: pageB, context: contextB } = await isolatedUser(browser, userB)
    const res: any = await pageB.request.post(`${BASE_URL}/api/invitations/${inviteToken}`, { timeout: 30000 })
    expect(res.status()).toBe(200)
    await pageB.goto(roomUrl, { waitUntil: "commit" })

    await waitForRoomReady(page, userA.name)
    await waitForRoomReady(pageB, userA.name)

    // Host seeks to 30s (fill fires a single onChange). First create the
    // session by playing.
    await page.getByRole("button", { name: "Play" }).first().click()
    await page.locator('input[type="number"]').fill("30")
    // The displayed position is authoritative and ADVANCES while playing, so
    // parse and compare instead of matching an exact "30s" prefix.
    const hostDisplay = await page.getByText(/s · v/).first().textContent()
    console.log(`SEEK host display after seek: ${hostDisplay}`)
    expect(parseInt((hostDisplay ?? "0s").replace("s", ""), 10)).toBeGreaterThanOrEqual(30)
    await expect
      .poll(
        async () => parseInt(((await pageB.getByText(/s · v/).first().textContent()) ?? "0s").replace("s", ""), 10),
        { timeout: 15000 }
      )
      .toBeGreaterThanOrEqual(30)

    // Real player positions on BOTH clients land near 30s.
    await expect.poll(() => ytPositionSeconds(page), { timeout: 20000 }).toBeGreaterThan(25)
    await expect.poll(() => ytPositionSeconds(pageB), { timeout: 20000 }).toBeGreaterThan(25)
    const posA = await ytPositionSeconds(page)
    const posB = await ytPositionSeconds(pageB)
    console.log(`SEEK actual positions — host: ${posA?.toFixed(1)}s, member: ${posB?.toFixed(1)}s`)
    expect(Math.abs((posA ?? 0) - (posB ?? 0))).toBeLessThan(5)

    await contextB.close()
  })

  test("late joiner and reconnecting client recover the authoritative state", async ({ page, browser }) => {
    const userA = makeUser("alice")
    await registerUser(page, userA)
    await addMedia(page, "Late Sync Media", YOUTUBE_EMBEDDABLE_URL, "MOVIE")
    const { roomUrl, inviteToken } = await createRoomWithInvite(page, "Late Sync Room", "Late Sync Media", "MOVIE")

    // Host plays and seeks to 20s before anyone else joins. The host display
    // is set optimistically by the seek command.
    await waitForRoomReady(page, userA.name)
    await page.getByRole("button", { name: "Play" }).click()
    await page.locator('input[type="number"]').fill("20")
    const hostDisplay = await page.getByText(/s · v/).first().textContent()
    console.log(`LATE-SETUP host display after seek: ${hostDisplay}`)
    expect(parseInt((hostDisplay ?? "0s").replace("s", ""), 10)).toBeGreaterThanOrEqual(20)
    await expect.poll(() => ytState(page), { timeout: 20000 }).toBe(1)

    // B joins LATE: must receive the authoritative state (playing, >= 20s and
    // advancing — the effective position grows while the session is PLAYING).
    const userB = makeUser("bob")
    const { page: pageB, context: contextB } = await isolatedUser(browser, userB)
    const res: any = await pageB.request.post(`${BASE_URL}/api/invitations/${inviteToken}`, { timeout: 30000 })
    expect(res.status()).toBe(200)
    await pageB.goto(roomUrl, { waitUntil: "commit" })
    await waitForRoomReady(pageB, userA.name)
    const displayed = await pageB.getByText(/s · v/).first().textContent()
    const displayedSeconds = parseInt((displayed ?? "0s").replace("s", ""), 10)
    console.log(`LATE JOIN displayed server position: ${displayedSeconds}s`)
    expect(displayedSeconds).toBeGreaterThanOrEqual(20)
    await expect.poll(() => ytState(pageB), { timeout: 20000 }).toBe(1)
    const latePos = await ytPositionSeconds(pageB)
    console.log(`LATE JOIN actual position: ${latePos?.toFixed(1)}s`)
    expect(latePos ?? 0).toBeGreaterThan(15)

    // B reconnects (full reload): state recovery from the server.
    await pageB.reload({ waitUntil: "commit" })
    await waitForRoomReady(pageB, userA.name)
    const reconnected = await pageB.getByText(/s · v/).first().textContent()
    const reconnectedSeconds = parseInt((reconnected ?? "0s").replace("s", ""), 10)
    console.log(`RECONNECT displayed server position: ${reconnectedSeconds}s`)
    expect(reconnectedSeconds).toBeGreaterThanOrEqual(20)
    await expect.poll(() => ytState(pageB), { timeout: 20000 }).toBe(1)

    await contextB.close()
  })

  test("stale commands are rejected and non-hosts cannot control playback", async ({ page, browser }) => {
    const userA = makeUser("alice")
    await registerUser(page, userA)
    await addMedia(page, "Guard Sync Media", YOUTUBE_EMBEDDABLE_URL, "MOVIE")
    const { roomUrl, inviteToken } = await createRoomWithInvite(page, "Guard Sync Room", "Guard Sync Media", "MOVIE")

    const userB = makeUser("bob")
    const { page: pageB, context: contextB } = await isolatedUser(browser, userB)
    const res: any = await pageB.request.post(`${BASE_URL}/api/invitations/${inviteToken}`, { timeout: 30000 })
    expect(res.status()).toBe(200)
    await pageB.goto(roomUrl, { waitUntil: "commit" })
    await waitForRoomReady(page, userA.name)
    await waitForRoomReady(pageB, userA.name)

    // Resolve the room id.
    const roomId = roomUrl.split("/").pop()!

    // Non-host cannot control playback (same applyCommand the WS handler uses).
    const forbidden = await pageB.request.post(`${BASE_URL}/api/playback/${roomId}`, {
      data: { action: "play", version: 1 },
      headers: { "Content-Type": "application/json" },
    })
    expect(forbidden.status()).toBe(403)

    // Host advances the version to 2.
    const played = await page.request.post(`${BASE_URL}/api/playback/${roomId}`, {
      data: { action: "play", version: 1 },
      headers: { "Content-Type": "application/json" },
    })
    expect(played.status()).toBe(200)

    // A stale command (version 1 again) must not override the newer version.
    const stale = await page.request.post(`${BASE_URL}/api/playback/${roomId}`, {
      data: { action: "pause", version: 1 },
      headers: { "Content-Type": "application/json" },
    })
    expect(stale.status()).toBe(409)

    // The UI still reflects the newer state (playing) on both clients.
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible({ timeout: 15000 })
    await expect(pageB.getByRole("button", { name: "Pause" })).toBeVisible({ timeout: 15000 })

    // Non-host's control is disabled in the UI.
    await expect(pageB.getByRole("button", { name: "Pause" })).toBeDisabled()

    await contextB.close()
  })
})
