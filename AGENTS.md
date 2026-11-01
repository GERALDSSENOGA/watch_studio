# Base44 dev environment notes

The app is two Node processes and must run from source with hot reload:

- `web` — `next dev` on host port 3000 (preview entry point, `base44.port: 3000`).
- `ws` — `server/ws.mts` started with `node --watch` on host port 3001 (`base44.port: 3001`).
  Room presence, chat and playback sync all need it; without it a room page stays on
  "Connecting to room…".
- `db` — PostgreSQL 17, local compose service (credentials generated in compose, not secrets).

Run it with `docker compose -f docker-compose.base44.yml up -d`.

## Non-obvious setup facts

- `npm ci` fails with ERESOLVE: the committed lockfile needs npm's legacy peer
  resolution (vitest 5 optionally peers on `@types/node` 22+, the repo pins 20).
  The `deps` service installs with `--legacy-peer-deps` and then runs `prisma generate`.
- Dependencies live in the shared `watchstudio_node_modules` volume, installed by the
  one-shot `deps` service; `migrate` applies `prisma migrate deploy`; `web` and `ws`
  wait for both (`condition: service_completed_successfully`).
- `NEXTAUTH_SECRET` is required at boot by next-auth and by `lib/ws-auth.ts`. It is a
  platform secret (`/run/base44/app.env`, generated placeholder for development).
- Browser-facing URLs come from compose env, never hardcoded:
  `NEXTAUTH_URL=https://3000-$BASE44_PUBLIC_HOST_SUFFIX` and
  `NEXT_PUBLIC_WS_URL=wss://3001-$BASE44_PUBLIC_HOST_SUFFIX`. The WebSocket is reachable
  through the preview proxy (verified with a `wss://` handshake).
- Behind the HTTPS proxy next-auth v5 issues `__Secure-authjs.session-token`; the room
  page and `lib/ws-auth.ts` now accept both the `__Secure-` and plain `authjs.session-token`
  names.
- `next.config.ts` appends the preview origin to `allowedDevOrigins` only when
  `BASE44_PREVIEW_MODE === "1"` (Next blocks dev assets/HMR from a foreign origin).
- Next 16 warns that the `middleware` convention is deprecated in favor of `proxy`; harmless.

## Verifying it works

- `curl http://localhost:3000/` → 200; `docker compose ... ps` shows web/ws healthy.
- Unit tests: `docker compose -f docker-compose.base44.yml exec -T web npx vitest run`
  (15 tests, 3 files).
- Realtime: sign in through the UI, open a room, and the sidebar shows
  `Participants (n)` and chat messages appear.

## Known app-level issues (not environment problems)

- `/library`'s "Add media link" button has no click handler, so media can only be
  created through `POST /api/media`.
- `app/rooms/create/page.tsx` is a server component that calls `React.useState`, so the
  create-room form cannot render; rooms can be created through `POST /api/rooms`.
- `app/invitations/accept/page.tsx` reads `searchParams.token` without awaiting it.
