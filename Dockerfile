# WatchStudio — production Dockerfile
#
# Build:
#   docker build -t watchstudio .
#
# Run (with docker-compose.prod.yml):
#   docker compose -f docker-compose.prod.yml up -d
#
# Multi-stage:
#   1. deps     — install node_modules
#   2. build    — prisma generate + next build
#   3. runner   — production image; runs migrations + Next.js + WS server

# ---------------------------------------------------------------------------
# 1. deps
# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps

WORKDIR /app

# Prisma engines need openssl for some platforms; keep image small.
RUN apk add --no-cache openssl

# Install all dependencies (dev deps are needed for `prisma generate` and
# `next build`). package-lock.json is present, so install is reproducible.
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# 2. build
# ---------------------------------------------------------------------------
FROM node:24-alpine AS build

WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate the Prisma Client from prisma/schema.prisma.
RUN npx prisma generate

# Production Next.js build (outputs to .next).
RUN npm run build

# ---------------------------------------------------------------------------
# 3. runner
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Non-root user for running the app.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

RUN apk add --no-cache openssl

# Copy production-ready artifacts from the build stage.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./ .next
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY --from=build /app/lib ./lib
COPY --from=build /app/app ./app
COPY --from=build /app/components ./components
COPY --from=build /app/hooks ./hooks
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/middleware.ts ./middleware.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/next-env.d.ts ./next-env.d.ts

# Prisma client + migration files live in node_modules/@prisma/client after
# `prisma generate`. Ensure they are present.
ENV PRISMA_CLIENT_ENGINE_ENVIRONMENT=production

USER nextjs

# Expose both ports: Next.js (3000) and the WebSocket server (3001).
EXPOSE 3000 3001

# Entrypoint is overridden per service in docker-compose.prod.yml:
#   web  -> sh -c "npx prisma migrate deploy && npm start"
#   ws   -> node server/ws.mts
#   migrate -> npx prisma migrate deploy (one-off)
CMD ["npm", "start"]
