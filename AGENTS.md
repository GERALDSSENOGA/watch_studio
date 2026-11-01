<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Base44 sandbox environment

Run and verify the app here with `docker compose -f docker-compose.base44.yml up -d --build`
(entry point: host port 3000, health path `/login`).

- **Two processes are required.** `web` is `next dev` on :3000; `ws` is the
  standalone WebSocket server (`node server/ws.mts`, Node ≥ 22 strips the
  TypeScript types natively) on :3001. Rooms show "Connecting to room…" forever
  if `ws` is down or `NEXT_PUBLIC_WS_URL` points to the wrong origin — the room
  header only renders after the socket authenticates.
- **Setup services.** `install` runs `npm ci` + `prisma generate` into a shared
  `watchstudio_node_modules` volume (web/ws mount it read-write; never run two
  installers at once). `migrate` runs `prisma migrate deploy`. Both must
  complete before web/ws start. Re-running `install` is what picks up a changed
  lockfile: `docker compose -f docker-compose.base44.yml run --rm install`.
- **The database is disposable but persistent** in the `watchstudio_pgdata`
  volume; `migrate` applies `prisma/migrations` in order and is idempotent.
- **URLs are derived from `BASE44_PUBLIC_HOST_SUFFIX`** at runtime
  (`NEXTAUTH_URL`, `WS_ORIGIN`, `NEXT_PUBLIC_WS_URL=wss://3001-…`). Never
  hardcode a sandbox host: the suffix changes when the sandbox is recreated.
- **HTTPS-specific behaviour.** Behind the preview proxy the app is served over
  HTTPS, so Auth.js prefixes its cookies with `__Secure-`. `app/rooms/[id]/page.tsx`
  and `lib/ws-auth.ts` therefore accept both the plain and `__Secure-` session
  cookie names/salts.
- **Server Actions require `experimental.serverActions.allowedOrigins`.**
  The proxy forwards `Origin: https://3000-<public host>` while
  `x-forwarded-host` is the internal sandbox host, so Server Actions abort with
  `Invalid Server Actions request` (symptom: `/rooms/create` spins forever).
  `next.config.ts` adds the preview origin — and `allowedDevOrigins` for dev
  assets/HMR — only when `BASE44_PREVIEW_MODE === "1"`, so ordinary
  development is unchanged.
- **Secrets.** `.env.base44-defaults` holds a dev-only `NEXTAUTH_SECRET`
  placeholder and is listed first; `/run/base44/app.env` (platform-managed)
  comes last so a dashboard value always wins. Local DB credentials are inline
  in the compose file.
- **Verifying.** `curl -sS -o /dev/null -w '%{http_code}' http://localhost:3000/`
  should return 200, `docker compose … ps` should show `db`, `web`, `ws` as
  `healthy`. Checks run inside the containers, e.g.
  `docker compose -f docker-compose.base44.yml exec -T web npx vitest run`
  (`tsc --noEmit` and `eslint` also work there).
- **Auth is required for almost everything.** Register a throwaway account
  through `/register` to exercise rooms, chat, or the library; there is no seed
  data and no pre-made user.
