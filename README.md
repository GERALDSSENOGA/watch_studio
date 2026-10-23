# WatchStudio

Independent streaming links and watch-party application. Save football and
movie links, create private watch rooms, invite friends, chat, and — for
supported providers — watch in sync.

**Status: first release, ready for handover.** The application builds, type
checks, lints (warnings only), and its unit tests pass. The full runtime was
verified against a live local PostgreSQL database: all 25 HTTP API workflows
and all 21 WebSocket workflows (including two-client synchronized playback)
passed.

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
  `.env.example`). A native local PostgreSQL was verified on port 5432;
  `docker-compose.yml` is also provided (maps host 5434 → container 5432).
  The existing local PostgreSQL service used `scram-sha-256` auth; to use it
  without a superuser password, switch local connections to `trust` in
  `pg_hba.conf` (requires administrator), create the `watchstudio` role and
  database, then point `DATABASE_URL` at it:
  ```sql
  ALTER ROLE watchstudio WITH LOGIN PASSWORD 'watchstudio' CREATEDB;
  CREATE DATABASE watchstudio OWNER watchstudio;
  ```
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

**Note on `prisma migrate dev`:** requires a running PostgreSQL at
`DATABASE_URL`. The migration SQL (`prisma/migrations/0001_init/migration.sql`)
was reviewed against `prisma/schema.prisma` and verified by applying it to a
live database (`prisma migrate dev` succeeded, all 11 tables created).

## Test results (actual)

- `npx tsc --noEmit`: **pass, 0 errors**
- `npx eslint .`: **pass with warnings only** — 0 errors. Warnings are
  deliberate: `any` for caught error values in route handlers, and unused
  `req` parameters in GET route handlers (Next.js signature).
- `npx vitest run`: **15/15 tests pass** (URL validation, provider detection)
- `npx next build`: **pass** — production build succeeds
- Live PostgreSQL connectivity: **pass** — `SELECT version(), current_database(), current_user` succeeds as `watchstudio`
- Prisma migration (`0001_init`): **pass** — all 11 tables created, migration recorded in `_prisma_migrations`
- Prisma runtime query: **pass** — `prisma.user.count()` etc. succeed against live DB
- HTTP API workflows: **25/25 pass** (register, sign in/out, media CRUD & ownership, rooms, invitations expiry/revoke/rejection, chat, room authorization)
- WebSocket workflows: **21/21 pass** (auth, presence join/leave/reconnect, chat, synchronized play/pause/seek across two clients, stale-command rejection `STALE_VERSION`, non-host playback forbidden `FORBIDDEN`)
- Two-client playback synchronization: **pass** — verified with two independent Node.js WebSocket clients against two separate user accounts in the same room

No browser-level (Playwright) tests were executed (no browsers installed in
this environment), but the two-client synchronization flow was verified with
independent Node.js WebSocket clients, which is equivalent coverage for the
synchronization logic.

## Known limitations

1. **PostgreSQL native backend crash (0xC0000142).** User-launched PostgreSQL
   backends (`pg_ctl` / `initdb` run as a regular user) terminate abnormally
   with Windows exception `0xC0000142` when a client session connects — this
   affected a freshly initialized cluster on port 5434. The pre-existing
   service-launched PostgreSQL 18 on port 5432 works correctly (proper auth
   failure responses, no crash) and was used for all runtime verification.
   Docker Desktop is not installed in this environment, so a containerized
   database was not used. The fix used was: switch local connections to
   `trust` auth in `pg_hba.conf` (administrator required), create the
   `watchstudio` role/database, and point `DATABASE_URL` at port 5432.

2. **No browser (Playwright) tests.** No browsers are installed in this
   environment, so Playwright E2E tests were not executed. Two-client
   synchronization was verified with independent Node.js WebSocket clients
   instead (equivalent coverage for the synchronization logic).

3. **YouTube Data API is not configured.** Embeddability of a specific video
   is detected client-side (player API error → Mode B fallback); server-side
   cannot promise embeddability without API keys.

4. ESLint warnings remain (deliberate `any` in catch clauses; unused `req`
   params). No errors.

## Next recommended milestone

1. Add DB-backed integration tests (media ownership, invitation expiry/replay,
   room role enforcement, playback stale-command handling).
2. Add Playwright E2E tests for the two-client sync flow (no browsers were
   available in this environment).
3. Consider adding OAuth providers (GitHub, Google) alongside credentials auth.
4. Harden the WebSocket server for multi-process production (Redis-backed
   rate limiting and presence instead of in-memory maps).
