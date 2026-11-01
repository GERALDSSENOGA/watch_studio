import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  // Run the suite serially initially to avoid shared-state collisions between
  // tests that create users, rooms, media, and WebSocket connections. Parallel
  // execution can be re-enabled once the suite is stable.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    navigationTimeout: 30000,
    actionTimeout: 15000,
  },
  timeout: 90000,
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Exercise the full playback-sync path in both clients: the app never
        // force-plays (it uses cue + authoritative reconciliation), and this
        // flag lets the tests observe programmatic play() without the
        // browser's autoplay policy independently suppressing it.
        launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
      },
    },
  ],
  webServer: undefined,
})
