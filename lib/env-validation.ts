/**
 * Production environment validation.
 *
 * Call validateEnv() at startup (e.g. in middleware or a top-level layout)
 * to fail fast if required environment variables are missing or invalid,
 * rather than producing confusing runtime errors later.
 */

const REQUIRED_VARS = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "WS_PORT",
  "WS_ORIGIN",
  "NEXT_PUBLIC_WS_URL",
] as const

const OPTIONAL_VARS = ["YOUTUBE_API_KEY"] as const

export interface EnvValidationResult {
  valid: boolean
  missing: string[]
  warnings: string[]
}

/**
 * Validate that all required environment variables are present and look sane.
 * Returns a result object; does not throw (caller decides how to handle).
 */
export function validateEnv(env: Record<string, string | undefined>): EnvValidationResult {
  const missing: string[] = []
  const warnings: string[] = []

  for (const key of REQUIRED_VARS) {
    if (!env[key]) {
      missing.push(key)
    }
  }

  // Basic sanity checks
  if (env.NEXTAUTH_SECRET && env.NEXTAUTH_SECRET.length < 32) {
    warnings.push(
      "NEXTAUTH_SECRET is shorter than 32 characters; generate one with `openssl rand -base64 32`"
    )
  }

  if (env.NEXTAUTH_URL && !env.NEXTAUTH_URL.startsWith("http")) {
    warnings.push("NEXTAUTH_URL should start with http:// or https://")
  }

  if (env.NEXT_PUBLIC_WS_URL && !env.NEXT_PUBLIC_WS_URL.startsWith("ws")) {
    warnings.push("NEXT_PUBLIC_WS_URL should start with ws:// or wss://")
  }

  if (env.YOUTUBE_API_KEY === undefined) {
    warnings.push(
      "YOUTUBE_API_KEY not set; YouTube embeddability checks will fall back to client-side detection"
    )
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  }
}

/**
 * Log validation results. Intended to be called once at startup.
 */
export function logEnvValidation(result: EnvValidationResult): void {
  if (result.valid) {
    console.info("[WatchStudio] Environment validation passed.")
  } else {
    console.error(
      `[WatchStudio] Environment validation FAILED. Missing required variables: ${result.missing.join(
        ", "
      )}`
    )
  }
  for (const warning of result.warnings) {
    console.warn(`[WatchStudio] ${warning}`)
  }
}
