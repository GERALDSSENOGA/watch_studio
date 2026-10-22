/**
 * In-memory fixed-window rate limiter for ephemeral connection/request
 * protection (login attempts, invitation creation/acceptance, chat).
 *
 * In production behind a replica set this should be backed by Redis; for
 * single-process local development the in-memory limiter is sufficient.
 */

type WindowRecord = { count: number; resetAt: number }

export class RateLimiter {
  private windows = new Map<string, WindowRecord>()

  constructor(private readonly limit: number, private readonly windowMs: number) {}

  /** Returns { allowed, remaining, resetAt }. */
  check(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now()
    const record = this.windows.get(key)
    if (!record || now >= record.resetAt) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs })
      return { allowed: true, remaining: this.limit - 1, resetAt: now + this.windowMs }
    }
    if (record.count >= this.limit) {
      return { allowed: false, remaining: 0, resetAt: record.resetAt }
    }
    record.count += 1
    return { allowed: true, remaining: this.limit - record.count, resetAt: record.resetAt }
  }

  reset(key: string) {
    this.windows.delete(key)
  }
}
