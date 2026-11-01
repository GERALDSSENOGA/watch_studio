# Cloud deployment options (alternative to VPS + GitHub Actions)

WatchStudio needs two long-running processes (Next.js + WebSocket server),
so it targets **Platform-as-a-Service with Docker support** or a VPS â€” not
serverless (Vercel/Netlify Functions) without reworking the WebSocket layer.

---

## Railway (recommended for simplicity)

Railway natively supports multi-service Docker Compose.

1. Connect your GitHub repo in Railway.
2. Add a PostgreSQL database service and link it to your app.
3. Set these variables in the Railway dashboard:
   - `DATABASE_URL` â€” internal Postgres connection string
   - `NEXTAUTH_SECRET` â€” `openssl rand -base64 32`
   - `NEXTAUTH_URL` â€” `https://your-domain.railway.app` (or custom domain)
   - `WS_PORT` â€” `3001`
   - `WS_ORIGIN` â€” your public URL
   - `NEXT_PUBLIC_WS_URL` â€” `wss://your-domain:3001` (or Railway WS proxy)
4. Deploy the root service with `docker compose -f docker-compose.prod.yml`.
   Railway will run the `web` service; add a second service for `ws` using the
   `command: node server/ws.mts` override.

---

## Render

Render supports Docker Compose via `render.yaml`.

Create `render.yaml` at the repo root:

```yaml
services:
  - type: web
    name: watchstudio-web
    env: docker
    dockerfilePath: Dockerfile
    dockerContext: .
    dockerCommand: npm start
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: watchstudio-db
          property: connectionString
      - key: NEXTAUTH_SECRET
        generateValue: true
      - key: NEXTAUTH_URL
        value: https://watchstudio.onrender.com
      - key: WS_PORT
        value: "3001"
      - key: WS_ORIGIN
        value: https://watchstudio.onrender.com
      - key: NEXT_PUBLIC_WS_URL
        value: wss://watchstudio-ws.onrender.com:3001
    healthCheckPath: /api/me

  - type: web
    name: watchstudio-ws
    env: docker
    dockerfilePath: Dockerfile
    dockerContext: .
    dockerCommand: node server/ws.mts
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: watchstudio-db
          property: connectionString
      - key: NEXTAUTH_SECRET
        sync: true

databases:
  - name: watchstudio-db
    plan: starter
    ipAllowList: []
```

Then run `npx prisma migrate deploy` once against the Render DB (via Render shell
or a one-off service) to create the 11 tables.

---

## Fly.io

1. `fly launch` â€” it detects the Dockerfile.
2. `fly postgres create --name watchstudio-db --region <region>` then
   `fly attach --app watchstudio watchstudio-db`.
3. Set secrets:
   ```
   fly secrets set NEXTAUTH_SECRET="$(openssl rand -base64 32)" \
     NEXTAUTH_URL="https://watchstudio.fly.dev" \
     WS_PORT="3001" \
     WS_ORIGIN="https://watchstudio.fly.dev" \
     NEXT_PUBLIC_WS_URL="wss://watchstudio.fly.dev:3001"
   ```
4. Run migrations: `fly ssh console -C "npx prisma migrate deploy"`.
5. `fly scale count web=1 ws=1` â€” run `web` with `npm start` and `ws` with
   `node server/ws.mts` as two process groups or two apps.

---

## Shared gotcha across all platforms

The WebSocket server keeps room/presence/playback state **in memory**. If you
scale past one `ws` instance, clients on different instances won't see each
other's presence or synchronized playback. Keep `ws` at 1 replica until you add
Redis-backed pub/sub (noted in your README as the next milestone).

---

## Local PostgreSQL hardening: trust -> SCRAM-SHA-256 - COMPLETED (24 Oct 2026)

> Status: DONE. All local trust rules were replaced with scram-sha-256 and the
> configuration was reloaded and verified. No other database, role, or setting
> was changed.

What was verified before the change (read-only):

- The database the app connects to (per .env -> localhost:5432) is served by
  PostgreSQL 18.6 (SELECT version()), i.e. the postgresql-x64-18 Windows
  service, data directory C:\Program Files\PostgreSQL\18\data. A second
  service, postgresql-x64-17, is also Running but is not the one listening on
  5432.
- pg_hba.conf contained trust for all normal connections (local all all,
  host all all 127.0.0.1/32, host all all ::1/128); only the replication rules
  used scram-sha-256.
- Databases present: watchstudio (this app), flourish, dreamsave_restore,
  postgres - the unrelated ones were not touched.
- password_encryption was already scram-sha-256, and both the postgres and
  watchstudio roles already had SCRAM verifiers stored.

What was changed:

1. Backup: C:\Program Files\PostgreSQL\18\data\pg_hba.conf.bak-20261024-105217
2. New random password set for the application role (ALTER ROLE watchstudio
   WITH PASSWORD ...) - stored only in .env (DATABASE_URL); never printed or
   committed.
3. The three local trust rules replaced with scram-sha-256. The replication
   rules, other databases, roles, and settings were untouched.
4. Configuration reloaded with SELECT pg_reload_conf(); note that HBA changes
   need a reload, not a restart.
5. The postgres superuser role was deliberately left with its existing
   credential so administrative access is preserved.

Post-change verification (all passed):

- psql -h localhost -U postgres WITHOUT a password now hangs at the password
  prompt (trust gone, even for the superuser).
- psql -h localhost -U watchstudio WITHOUT a password now hangs at the prompt
  (no trust bypass).
- psql -h localhost -U watchstudio WITH the .env password authenticates to the
  watchstudio database.
- npx prisma migrate status -> "Database schema is up to date!" using the
  authenticated connection.
- The running application (Next.js + WebSocket) continues to serve requests.

Rollback (if ever needed): restore the backup file above and run
SELECT pg_reload_conf(); as a superuser (password-authenticated).

Recovery notes: keep the postgres role's password safe - it is the only
superuser path now that trust is gone. If it is lost, access can be restored
temporarily by editing pg_hba.conf back to trust for a single address and
reloading, then re-securing.
