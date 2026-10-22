import { PrismaClient } from "@prisma/client"

/**
 * Singleton Prisma client for long-running server processes (Next.js dev
 * hot-reloading can otherwise instantiate many clients).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG ? ["query", "error", "warn"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

export default prisma
