# WatchStudio

Independent streaming links and watch-party application. Save football and
movie links, create private watch rooms, invite friends, chat, and — for
supported providers — watch in sync.

**Status: first release, ready for handover.** The application builds, type
checks, lints (warnings only), and its unit tests pass. A fully verified
runtime against a live PostgreSQL database could not be completed in this
environment because the local PostgreSQL backend aborts client connections
(see "Known limitations").

## Project directory

`C:\Users\ICMFI\Desktop\WatchStudio` — an independent, self-contained project.
No existing application was modified or overwritten.

## Technology stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS
- PostgreSQL (Prisma ORM, migrations)
- Auth.js / next-auth v5 (`@auth/prisma-adapter`) — credentials provider,
  bcrypt password hashing, database-backed sessions
- `ws` WebSocket server (`server/ws.mts`) — room presence, chat, playback
- Zod validation at API boundaries
- Vitest + vitest alias — unit tests for pure logic modules

## What is implemented

### Authentication and accounts (server-authorized)
- Registration with email + bcrypt-hashed password (`/api/auth/register`)
- Sign in / sign out via next-auth credentials provider; database sessions
  (`next-auth.session-token` cookie), 30-day max age
- Session persistence and protected routes (middleware + `auth()` in every
  route handler and page)
- User profiles: display name, optional avatar, account creation date, status,
  owned media and rooms
- Authorization enforced on the server for every protected action

### Media library
- Add/edit/remove football and movie links (`/api/media`, `POST/PATCH/DELETE`)
- URL validation: only `https://` accepted; `javascript:`, `data:`, `file:`,
  `ws:`, IP-literal hosts rejected
- Provider detection from URL patterns; playback capability declared per
  provider (see "Provider integration")
- Metadata: football (home/away team, competition, kickoff, match status) and
  movies (release year, genre, duration); all optional
- Search and filter by category, availability, and text
- My Library, Football, Movies pages; media detail page with real capability
  labels (embedded / synced / external / unsupported)

### Private watch rooms and invitations
- Create private rooms (name, description, media, max members); host/moderator/
  member roles with server-enforced permissions
- Cryptographically secure unpredictable invitations: plaintext token returned
  once, only `bcrypt` hash stored; expiration (7 days default); revocation;
  acceptance tracked; membership caps; token reuse/replay rejected
- Accept invitation → transaction marks it accepted and creates membership;
  private rooms never exposed to non-members
- Host/moderator can remove members; host can close rooms

### Real-time chat and presence
- Room-scoped chat persisted in PostgreSQL; sender name + timestamp;
  membership enforced for read/write; length/payload validation; removed-message
  moderation
- Presence: connected participants, disconnect/reconnect handling, last-seen
  timestamps, reauthorization on reconnect, room isolation

### Playback synchronization (server-authoritative)
- Playback session per active room: state (playing/paused), position ms,
  monotonically increasing version, host/controller, updated-at, updated-by
- Host issues play/pause/seek → server authenticates, verifies role, validates
  optimistic concurrency (version check), records state, broadcasts to room;
  clients reconcile; periodic reconciliation bounds drift; stale commands
  rejected
- External-link mode: room metadata and chat synchronized; playback explicitly
  not claimed as synchronized
- Unsourced/unplayable mode: useful explanation, never a blank player

### Security
- HTTPS-only URL acceptance; SSRF rejection (no server fetching of user URLs)
- CSP, sandboxed iframes, escaped user content, Zod validation
- Rate limiting: login, invitation create/accept, failed attempts
- `.env.example` placeholders only; no secrets committed
- Reports and moderation endpoint for flagged links/rooms

## Provider integration

| Provider | Embed | Official API | Commands | Position | Sync | External fallback | Notes |
|----------|-------|--------------|----------|----------|------|-------------------|-------|
| YouTube | yes | IFrame API | yes | yes | yes | no | Only publicly embeddable videos synchronize. A specific video's embeddability can't be proven server-side without the YouTube Data API; the client adapter detects embed refusal and the room falls back to Mode B honestly. |
| Direct video file | yes | no | no | yes | no | no | Browser `<video>`; no cross-participant sync. |
| Generic / other | no | no | no | no | no | yes | "Watch on provider" link; chat/presence remain available. |

YouTube is the one documented, genuinely supported integration. No mock playback
is presented as real functionality. WatchStudio never downloads, proxies,
records, or rehosts third-party streams and never bypasses DRM, paywalls, or
regional restrictions.

### Playback modes
- **Mode A** — synchronized embedded playback (YouTube, when embeddable)
- **Mode B** — external provider playback (link + "Watch on provider"; room stays useful)
- **Mode C** — unsupported/unavailable source (explanation + return action)

## Required external credentials / manual setup

- **PostgreSQL database** — connection string in `DATABASE_URL` (example in
  `.env.example`). `docker-compose.yml` is provided to start a local Postgres
  on port 5434 matching `.env.example`.
- **NEXTAUTH_SECRET** — at least 32 random characters (`openssl rand -base64 32`).
- **NEXTAUTH_URL** — e.g. `http://localhost:3000`.
- **WS_PORT** / **NEXT_PUBLIC_WS_URL** — WebSocket server (default `:3001` /
  `ws://localhost:3001`).
- Optional **YOUTUBE_API_KEY** — not wired; embeddability is detected
  client-side. Placeholder in `.env.example`.

No production service credentials are required for local development. No
`.env` file with secrets is committed.

## Commands

| Task | Command |
|------|---------|
| Install dependencies | `npm install` |
| Type check | `npx tsc --noEmit` |
| Lint | `npx eslint .` |
| Unit tests | `npx vitest run` |
| Production build | `npx next build` |
| Dev web server | `npm run dev` (Next.js on :3000) |
| Dev WebSocket server | `npx run-ws` — see package scripts (run `node server/ws.mts`) |
| Generate Prisma client | `npx prisma generate` |
| Create/migrate database | `npx prisma migrate dev` (requires a running PostgreSQL at `DATABASE_URL`) |
| Studio (DB GUI) | `npx prisma studio` |

Both servers are needed for real-time rooms: `npm run dev` (Next.js) and
`node server/ws.mts` (WebSocket) — they can run concurrently with `concurrently`
(`npm run dev:walls` if wired in package.json scripts).

## Database

`prisma/schema.prisma` is the source of truth. `prisma/migrations/0001_init/
migration.sql` is the hand-written SQL migration matching the schema (tables:
`User`, `Account`, `Session`, `VerificationToken` [auth adapter], `MediaItem`,
`WatchRoom`, `RoomMember`, `Invitation`, `ChatMessage`, `PlaybackSession`,
`Report`). `prisma/migrations/migration_lock.toml` pins the provider.

**Note on `prisma migrate dev`:** could not be executed in this environment
because the local PostgreSQL backend terminates client connections abnormally
(0xC0000142) — see "Known limitations". The migration SQL was reviewed
manually against `schema.prisma`.

## Test results (actual)

- `npx tsc --noEmit`: **pass, 0 errors**
- `npx eslint .`: **pass with warnings only** — 0 errors. Warnings are
  deliberate: `any` for caught error values in route handlers, and unused
  `req` parameters in GET route handlers (Next.js signature).
- `npx vitest run`: **12/12 tests pass** (URL validation, provider detection)
- `npx next build`: **pass** — production build succeeds

No browser-level (Playwright) two-client synchronization tests were executed,
because they require a running app + database, which the environment cannot
provide (see limitations). This is a gap before production use.

## Known limitations

1. **PostgreSQL cannot run here.** The native `postgres.exe` backend (PostgreSQL
   17, both the pre-existing cluster on :5432 and a freshly initialized cluster
   on :5434) terminates abnormally with exception 0xC0000142 when a client
   session connects. Docker Desktop is not installed, so a containerized
   database is unavailable. Consequently:
   - `prisma migrate dev` / `prisma migrate deploy` could not be run.
   - Prisma Client runtime queries, auth flows, room creation, invitations,
     chat, and playback synchronization could not be exercised end-to-end
     against a live database.
   - Browser-level two-client sync tests could not be run.
   Everything that does not require a live database (type check, lint, unit
   tests, production build) passes.

2. **Two-client synchronization is designed but not empirically verified** in
   this environment. The server-authoritative flow (version checks, optimistic
   concurrency, periodic reconciliation, reconnection recovery) is implemented
   and unit-testable in principle, but a live two-browser test was not
   possible.

3. **YouTube Data API is not configured.** Embeddability of a specific video
   is detected client-side (player API error → Mode B fallback); server-side
   cannot promise embeddability without API keys.

4. ESLint warnings remain (deliberate `any` in catch clauses; unused `req`
   params). No errors.

## Next recommended milestone

1. Provision PostgreSQL (e.g. `docker compose up -d db`), run
   `cp .env.example .env`, fill `NEXTAUTH_SECRET`, `npx prisma migrate dev`,
   `npx prisma generate`.
2. Run `npm run dev` + `node server/ws.mts` and verify the 14 required user
   flows end to end, including a two-browser synchronization test.
3. Add DB-backed integration tests (media ownership, invitation expiry/replay,
   room role enforcement, playback stale-command handling).
4. Add Playwright E2E tests for the two-client sync flow.
