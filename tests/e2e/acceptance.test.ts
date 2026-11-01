import { test, expect } from "@playwright/test"

const BASE_URL = "http://localhost:3000"
const YOUTUBE_EMBEDDABLE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
const MOVIE_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw"
const EXTERNAL_URL = "https://watch.skysports.com/live"
const BAD_URL = "javascript:alert(1)"

function makeUser(prefix: string) {
  return {
    name: `${prefix} Tester`,
    email: `${prefix}.${Date.now()}@example.com`,
    password: "Password123!",
  }
}

/** Register a user and wait for the signed-in dashboard. */
async function registerUser(page: any, user: any) {
  await page.goto(`${BASE_URL}/register`, { waitUntil: "load" })
  await page.getByLabel("Full name").fill(user.name)
  await page.getByLabel("Email").fill(user.email)
  await page.getByLabel("Password").fill(user.password)
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page).toHaveURL(`${BASE_URL}/`, { timeout: 20000 })
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 20000 })
}

/** Accept an invitation via the API (shares the page's session cookie) and
 *  navigate the page to the room. The accept page's server-side redirect is
 *  not reliably followed by Playwright's `goto` in this dev environment, so
 *  we call the same server-side service through the API instead. */
async function acceptInvitation(page: any, token: string, roomUrl: string) {
  const res = await page.request.post(`${BASE_URL}/api/invitations/${token}`, { timeout: 30000 })
  expect(res.status()).toBe(200)
  await page.goto(roomUrl, { waitUntil: "commit" })
}

/** Create a fully isolated browser context + page and register a user in it.
 *  Used for multi-user tests so user A and user B never share cookies. */
async function isolatedUser(browser: any, user: any) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await registerUser(page, user)
  return { page, context }
}

/** Fill a visible media dialog input by id (add and edit dialogs share ids, so
 *  we target the visible one to avoid strict-mode violations). */
function dialogInput(page: any, id: string) {
  return page.locator(`input[id="${id}"]`).filter({ visible: true })
}

/** Wait for the media dialog to open, then return its visible title input.
 *  Retries the click if hydration has not attached the handler yet. */
async function openMediaDialog(page: any) {
  const btn = page.getByRole("button", { name: "Add media link" })
  for (let attempt = 0; attempt < 3; attempt++) {
    await btn.click()
    try {
      await expect(dialogInput(page, "title")).toBeVisible({ timeout: 4000 })
      return
    } catch {
      // Dialog did not open (handler not attached yet); retry.
    }
  }
  await expect(dialogInput(page, "title")).toBeVisible({ timeout: 15000 })
}

/** Click a visible button inside the open media dialog by accessible name. */
function dialogButton(page: any, name: string) {
  return page.getByRole("button", { name }).filter({ visible: true }).first()
}

/** Add a media link via the library dialog and wait for it to appear. */
async function addMedia(page: any, title: string, url: string, category: "MOVIE" | "MOVIE") {
  await page.goto(`${BASE_URL}/library`, { waitUntil: "commit" })
  await openMediaDialog(page)
  await dialogInput(page, "title").fill(title)
  await dialogInput(page, "originalUrl").fill(url)
  if (category === "MOVIE") {
    await dialogButton(page, "Movie").click()
  }
  await dialogButton(page, "Save link").click()
  await expect(page.locator(`text=${title}`)).toBeVisible({ timeout: 15000 })
}

test.describe.serial("Test A: Registration and authentication", () => {
  test("user can register and account persists", async ({ page }) => {
    const consoleErrors: string[] = []
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text())
    })

    const user = makeUser("alice")
    await registerUser(page, user)

    // Duplicate email rejected by the registration API
    const res = await page.request.post(`${BASE_URL}/api/auth/register`, {
      data: { email: user.email, password: "Password123!", name: "x" },
    })
    expect(res.status()).toBe(409)

    expect(consoleErrors.filter((e) => e.includes("PrismaClient"))).toEqual([])
  })

  test("protected page shows sign-in prompt when not authenticated", async ({ page }) => {
    await page.goto(`${BASE_URL}/profile`, { waitUntil: "commit" })
    await expect(page.getByText("Sign in to view your profile")).toBeVisible()
  })

  test("session persists after refresh", async ({ page }) => {
    const user = makeUser("alice")
    await registerUser(page, user)
    await page.reload({ waitUntil: "commit" })
    await expect(page).toHaveURL(`${BASE_URL}/`, { timeout: 15000 })
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()
  })
})

test.describe.serial("Test A2: authentication flows", () => {
  test("duplicate email registration is rejected with a useful message", async ({ page }) => {
    const user = makeUser("alice")
    await registerUser(page, user)

    // Sign out, then try to register the same email again through the UI.
    await page.getByRole("button", { name: "Sign out" }).click()
    await page.waitForTimeout(500)
    await page.goto(`${BASE_URL}/register`, { waitUntil: "load" })
    await page.getByLabel("Full name").fill("Dup Tester")
    await page.getByLabel("Email").fill(user.email)
    await page.getByLabel("Password").fill(user.password)
    await page.getByRole("button", { name: "Create account" }).click()
    await expect(page.getByText(/already exists/i)).toBeVisible({ timeout: 15000 })
  })

  test("invalid login produces a useful error", async ({ page }) => {
    const user = makeUser("alice")
    await registerUser(page, user)
    await page.getByRole("button", { name: "Sign out" }).click()
    await page.waitForTimeout(500)

    await page.goto(`${BASE_URL}/login`, { waitUntil: "load" })
    await page.getByLabel("Email").fill(user.email)
    await page.getByLabel("Password").fill("WrongPassword999")
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page.getByText("Invalid email or password.")).toBeVisible({ timeout: 15000 })

    // Correct credentials still work afterwards.
    await page.getByLabel("Password").fill(user.password)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 20000 })
  })

  test("logout invalidates the session", async ({ page }) => {
    const user = makeUser("alice")
    await registerUser(page, user)
    await page.getByRole("button", { name: "Sign out" }).click()

    // After logout the dashboard shows the signed-out state and the library
    // (protected) shows the sign-in prompt.
    await expect(page.getByText("Welcome to WatchStudio")).toBeVisible({ timeout: 15000 })
    await page.goto(`${BASE_URL}/library`, { waitUntil: "commit" })
    await expect(page.getByText("Sign in to view your library.")).toBeVisible()
  })
})

test.describe.serial("Test B: Media management", () => {
  test("user can add movie links", async ({ page }) => {
    const user = makeUser("alice")
    await registerUser(page, user)
    await addMedia(page, "Test Media Match", YOUTUBE_EMBEDDABLE_URL, "MOVIE")
    await addMedia(page, "Test Movie", MOVIE_URL, "MOVIE")

    await page.goto(`${BASE_URL}/library`, { waitUntil: "commit" })
    await expect(page.getByText("Test Media Match")).toBeVisible()
    await expect(page.getByText("Test Movie")).toBeVisible()
  })

  test("user can edit media through the dialog", async ({ page }) => {
    const user = makeUser("alice")
    await registerUser(page, user)
    await addMedia(page, "Editable Media", YOUTUBE_EMBEDDABLE_URL, "MOVIE")

    await page.goto(`${BASE_URL}/library`, { waitUntil: "commit" })
    await page.getByRole("button", { name: "Edit" }).first().click()

    // The dialog must populate with the record's existing values.
    await expect(dialogInput(page, "title")).toHaveValue("Editable Media")
    await expect(dialogInput(page, "originalUrl")).toHaveValue(YOUTUBE_EMBEDDABLE_URL)

    // Change the title and description, then save via the visible button.
    await dialogInput(page, "title").fill("Edited Media Match")
    await dialogInput(page, "description").fill("Updated description")
    await page.getByRole("button", { name: "Save changes" }).click()

    // The dialog closes on success.
    await expect(page.getByRole("button", { name: "Save changes" })).toBeHidden()

    // Refresh the library and verify both edits persisted.
    await page.goto(`${BASE_URL}/library`, { waitUntil: "commit" })
    await expect(page.getByText("Edited Media Match")).toBeVisible()
    await expect(page.getByText("Updated description")).toBeVisible()
    await expect(page.getByText("Editable Media")).not.toBeVisible()
  })

  test("invalid edit shows an error and preserves the user's edits", async ({ page }) => {
    const user = makeUser("alice")
    await registerUser(page, user)
    await addMedia(page, "Invalid Edit Item", YOUTUBE_EMBEDDABLE_URL, "MOVIE")

    await page.goto(`${BASE_URL}/library`, { waitUntil: "commit" })
    await page.getByRole("button", { name: "Edit" }).first().click()
    await expect(dialogInput(page, "title")).toHaveValue("Invalid Edit Item")

    // http:// is a syntactically valid URL but fails the server-side https rule.
    await dialogInput(page, "title").fill("Renamed But Rejected")
    await dialogInput(page, "originalUrl").fill("http://example.com/video")
    await page.getByRole("button", { name: "Save changes" }).click()

    // A useful error is reported and the dialog stays open with edits intact.
    await expect(page.getByText(/Provide a valid https:\/\/ URL/)).toBeVisible()
    await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible()
    await expect(dialogInput(page, "title")).toHaveValue("Renamed But Rejected")

    // The stored record is unchanged.
    await expect(dialogInput(page, "originalUrl")).toHaveValue("http://example.com/video")
    await page.getByRole("button", { name: "Cancel" }).first().click()
    await page.reload({ waitUntil: "commit" })
    await expect(page.getByText("Invalid Edit Item")).toBeVisible()
    await expect(page.getByText("Renamed But Rejected")).not.toBeVisible()
  })

  test("another user cannot update user A's media", async ({ browser }) => {
    const userA = makeUser("alice")
    const { page: pageA, context: contextA } = await isolatedUser(browser, userA)
    await addMedia(pageA, "Owned Media", YOUTUBE_EMBEDDABLE_URL, "MOVIE")

    // Resolve the media id from the library link.
    const mediaLink = pageA.getByText("Owned Media").first()
    await mediaLink.waitFor()
    const href = await mediaLink.getAttribute("href")
    const mediaId = href!.split("/").pop()!

    // User B (isolated context) attempts to modify A's record directly.
    const userB = makeUser("bob")
    const { page: pageB, context: contextB } = await isolatedUser(browser, userB)
    const res = await pageB.request.patch(`${BASE_URL}/api/media/${mediaId}`, {
      data: { title: "Hijacked Title" },
      headers: { "Content-Type": "application/json" },
    })
    expect(res.status()).toBe(403)

    // A still sees the original title.
    await pageA.goto(`${BASE_URL}/library`, { waitUntil: "commit" })
    await expect(pageA.getByText("Hijacked Title")).not.toBeVisible()

    await contextB.close()
    await contextA.close()
  })

  test("URL validation rejects unsafe schemes", async ({ page }) => {
    const user = makeUser("alice")
    await registerUser(page, user)
    await page.goto(`${BASE_URL}/library`, { waitUntil: "commit" })
    await page.getByRole("button", { name: "Add media link" }).click()
    await dialogInput(page, "title").fill("Bad Link")
    await dialogInput(page, "originalUrl").fill(BAD_URL)
    await dialogButton(page, "Save link").click()
    await expect(page.getByText(/Provide a valid/)).toBeVisible()
  })

  test("another user cannot see user A's media", async ({ browser }) => {
    const userA = makeUser("alice")
    const { page: pageA } = await isolatedUser(browser, userA)
    await addMedia(pageA, "Private Media", YOUTUBE_EMBEDDABLE_URL, "MOVIE")

    // Register B in an isolated context with its own cookies.
    const userB = makeUser("bob")
    const { page: pageB, context: contextB } = await isolatedUser(browser, userB)
    await pageB.goto(`${BASE_URL}/library`, { waitUntil: "commit" })
    await expect(pageB.getByText("Private Media")).not.toBeVisible()

    await contextB.close()
    await pageA.close()
  })
})

test.describe.serial("Test C: Private room creation", () => {
  test("user can create a room without Prisma error", async ({ page }) => {
    const consoleErrors: string[] = []
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text())
    })

    const user = makeUser("alice")
    await registerUser(page, user)
    await addMedia(page, "Room Media", YOUTUBE_EMBEDDABLE_URL, "MOVIE")

    await page.getByRole("link", { name: "Watch Rooms" }).click()
    await page.getByRole("button", { name: "Create room" }).click()
    await expect(page).toHaveURL(`${BASE_URL}/rooms/create`, { timeout: 15000 })

    // Media select is populated with the user's media (option is not visible text).
    await expect(page.locator('select#media option:has-text("Room Media")')).toBeAttached()

    await page.getByLabel("Room name").fill("Test Room")
    await page.getByRole("button", { name: "Create room" }).click()
    await expect(page).not.toHaveURL(`${BASE_URL}/rooms/create`, { timeout: 15000 })
    await expect(page).toHaveURL(/\/rooms\/[a-zA-Z0-9-]+$/, { timeout: 15000 })
    await expect(page.getByText("Test Room")).toBeVisible({ timeout: 15000 })

    await page.reload({ waitUntil: "commit" })
    await expect(page.getByText("Test Room")).toBeVisible({ timeout: 15000 })

    expect(consoleErrors.filter((e) => e.includes("PrismaClient"))).toEqual([])
  })

  test("room appears in room list", async ({ page }) => {
    const user = makeUser("alice")
    await registerUser(page, user)
    await addMedia(page, "Room Media", YOUTUBE_EMBEDDABLE_URL, "MOVIE")

    await page.getByRole("link", { name: "Watch Rooms" }).click()
    await page.getByRole("button", { name: "Create room" }).click()
    await page.getByLabel("Room name").fill("Listed Room")
    await page.getByRole("button", { name: "Create room" }).click()
    await expect(page).not.toHaveURL(`${BASE_URL}/rooms/create`, { timeout: 15000 })
    await expect(page).toHaveURL(/\/rooms\/[a-zA-Z0-9-]+$/, { timeout: 15000 })

    await page.getByRole("link", { name: "Watch Rooms" }).click()
    await expect(page.getByText("Listed Room")).toBeVisible()
  })
})

test.describe.serial("Test D: Invitations and membership", () => {
  test("user A creates invitation and user B accepts", async ({ page, browser }) => {
    const userA = makeUser("alice")
    await registerUser(page, userA)
    await addMedia(page, "Invite Media", YOUTUBE_EMBEDDABLE_URL, "MOVIE")

    await page.getByRole("link", { name: "Watch Rooms" }).click()
    await page.getByRole("button", { name: "Create room" }).click()
    await page.getByLabel("Room name").fill("Invite Room")
    await page.getByRole("button", { name: "Create room" }).click()
    await expect(page).not.toHaveURL(`${BASE_URL}/rooms/create`, { timeout: 15000 })
    await expect(page).toHaveURL(/\/rooms\/[a-zA-Z0-9-]+$/, { timeout: 15000 })
    const roomUrl = page.url()

    // Capture the plaintext token from the invitation-creation API response.
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

    // Register B in an isolated context with its own cookies.
    const userB = makeUser("bob")
    const { page: pageB, context: contextB } = await isolatedUser(browser, userB)
    await acceptInvitation(pageB, inviteToken!, roomUrl)
    await expect(pageB.getByText("Invite Room")).toBeVisible({ timeout: 15000 })

    await contextB.close()
    await page.close()
  })

  test("unauthorized user cannot see private room", async ({ browser }) => {
    const userA = makeUser("alice")
    const { page: pageA } = await isolatedUser(browser, userA)
    await addMedia(pageA, "Secret Media", YOUTUBE_EMBEDDABLE_URL, "MOVIE")

    await pageA.getByRole("link", { name: "Watch Rooms" }).click()
    await pageA.getByRole("button", { name: "Create room" }).click()
    await pageA.getByLabel("Room name").fill("Secret Room")
    await pageA.getByRole("button", { name: "Create room" }).click()
    await expect(pageA).not.toHaveURL(`${BASE_URL}/rooms/create`, { timeout: 15000 })
    await expect(pageA).toHaveURL(/\/rooms\/[a-zA-Z0-9-]+$/, { timeout: 15000 })

    // Register C in an isolated context with its own cookies.
    const userC = makeUser("carol")
    const { page: pageC, context: contextC } = await isolatedUser(browser, userC)
    await pageC.goto(`${BASE_URL}/rooms`, { waitUntil: "commit" })
    await expect(pageC.getByText("Secret Room")).not.toBeVisible()

    await contextC.close()
    await pageA.close()
  })

  test("users can chat in the same room", async ({ page, browser }) => {
    const userA = makeUser("alice")
    await registerUser(page, userA)
    await addMedia(page, "Chat Media", YOUTUBE_EMBEDDABLE_URL, "MOVIE")

    await page.getByRole("link", { name: "Watch Rooms" }).click()
    await page.getByRole("button", { name: "Create room" }).click()
    await page.getByLabel("Room name").fill("Chat Room")
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

    const userB = makeUser("bob")
    const { page: pageB, context: contextB } = await isolatedUser(browser, userB)
    await acceptInvitation(pageB, inviteToken!, roomUrl)

    // Wait for both WebSocket connections to be ready (full room UI rendered)
    // and for both clients to have joined the room. When B's page shows Alice's
    // presence, both sockets have been added to the server's room set, so chat
    // messages sent by either client will be broadcast to both.
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 15000 })
    await expect(pageB.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 15000 })
    // B's page showing Alice's presence confirms both sockets are in the server's room set.
    await expect(pageB.getByText(userA.name ?? "alice Tester").first()).toBeVisible({ timeout: 15000 })
    // Submit chat via Enter key on the input (a toast overlay can intercept
    // clicks on the Send button).
    await page.getByPlaceholder("Say something…").fill("Hello from A")
    await page.getByPlaceholder("Say something…").press("Enter")
    await expect(page.getByText("Hello from A")).toBeVisible()
    await expect(pageB.getByText("Hello from A")).toBeVisible()

    await pageB.getByPlaceholder("Say something…").fill("Hello from B")
    await pageB.getByPlaceholder("Say something…").press("Enter")
    await expect(pageB.getByText("Hello from B")).toBeVisible()
    await expect(page.getByText("Hello from B")).toBeVisible()

    // Messages survive a refresh: the history endpoint must return them.
    await page.reload({ waitUntil: "commit" })
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 20000 })
    await expect(page.getByText("Hello from A")).toBeVisible({ timeout: 15000 })
    await expect(page.getByText("Hello from B")).toBeVisible({ timeout: 15000 })

    await contextB.close()
    await page.close()
  })

  test("host and member see synchronized playback state", async ({ page, browser }) => {
    const userA = makeUser("alice")
    await registerUser(page, userA)
    await addMedia(page, "Sync Media", YOUTUBE_EMBEDDABLE_URL, "MOVIE")

    await page.getByRole("link", { name: "Watch Rooms" }).click()
    await page.getByRole("button", { name: "Create room" }).click()
    await page.getByLabel("Room name").fill("Sync Room")
    // Select the synchronized media so the room has a Mode A source.
    await page.selectOption("#media", { label: "Sync Media (MOVIE)" })
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

    const userB = makeUser("bob")
    const { page: pageB, context: contextB } = await isolatedUser(browser, userB)
    await acceptInvitation(pageB, inviteToken!, roomUrl)

    // Wait for page A's WebSocket to connect (full room UI rendered) before
    // checking the playback mode badge.
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText("Mode A · synchronized")).toBeVisible({ timeout: 15000 })
    await expect(pageB.getByText("Mode A · synchronized")).toBeVisible({ timeout: 15000 })
    // Both sockets in the server's room set (B's page shows Alice's presence).
    await expect(pageB.getByText(userA.name ?? "alice Tester").first()).toBeVisible({ timeout: 15000 })

    // NOTE: with server-authoritative initialization, a freshly loaded player
    // is cued and PAUSED (the server session starts at PAUSED v1). The host's
    // first command creates the session; both directions are exercised.
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible({ timeout: 15000 })

    // Host plays; both clients reflect PLAYING.
    await page.getByRole("button", { name: "Play" }).click()
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible()
    await expect(pageB.getByRole("button", { name: "Pause" })).toBeVisible()

    // Host pauses; both clients reflect PAUSED.
    await page.getByRole("button", { name: "Pause" }).click()
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible()
    await expect(pageB.getByRole("button", { name: "Play" })).toBeVisible()

    await contextB.close()
    await page.close()
  })

  test("unsupported provider shows external fallback in room", async ({ page }) => {
    const user = makeUser("alice")
    await registerUser(page, user)
    await addMedia(page, "External Media", EXTERNAL_URL, "MOVIE")

    await page.getByRole("link", { name: "Watch Rooms" }).click()
    await page.getByRole("button", { name: "Create room" }).click()
    await page.getByLabel("Room name").fill("External Room")
    await page.selectOption("#media", { label: "External Media (MOVIE)" })
    await page.getByRole("button", { name: "Create room" }).click()
    await expect(page).toHaveURL(/\/rooms\//, { timeout: 15000 })
    // An unsupported/generic source shows the single combined Mode C panel
    // with the preserved open-the-link affordance (not Mode B + Mode C
    // stacked together).
    await expect(page.getByText(/Mode C — this source can't be embedded or synchronized/i)).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByRole("link", { name: /Open link in a new tab/i })).toBeVisible()
    await expect(page.getByText("Mode B — watch on provider")).toHaveCount(0)
  })
})
