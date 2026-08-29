import { createMiddleware } from "hono/factory"
import type { WorkerEnv } from "@infra/alchemy.run"
import { ADMIN_LOGIN_RATE_LIMIT, GLOBAL_RATE_LIMIT } from "@infra/rate-limit"

const FALLBACK_CLIENT_KEY = "unknown-client"

function clientKey(header: (name: string) => string | undefined) {
  return header("CF-Connecting-IP") ?? FALLBACK_CLIENT_KEY
}

function rateLimitMiddleware(
  limiter: (env: WorkerEnv) => WorkerEnv["GLOBAL_RATE_LIMITER"],
  period: number,
  label: string,
) {
  return createMiddleware<{ Bindings: WorkerEnv }>(async (c, next) => {
    const key = clientKey((name) => c.req.header(name))

    try {
      const { success } = await limiter(c.env).limit({ key })
      if (!success) {
        return c.json(
          {
            error: "rate_limited",
            message: "Too many requests. Try again later.",
          },
          429,
          {
            "Cache-Control": "no-store",
            "Retry-After": String(period),
          },
        )
      }
    } catch (error) {
      console.error(`${label} rate limit binding failed`, error)
      return c.json(
        {
          error: "service_unavailable",
          message: "Rate limiting is temporarily unavailable.",
        },
        503,
        { "Cache-Control": "no-store" },
      )
    }

    await next()
  })
}

export const globalRateLimit = rateLimitMiddleware(
  (env) => env.GLOBAL_RATE_LIMITER,
  GLOBAL_RATE_LIMIT.period,
  "Global",
)

export const adminLoginRateLimit = rateLimitMiddleware(
  (env) => env.ADMIN_LOGIN_RATE_LIMITER,
  ADMIN_LOGIN_RATE_LIMIT.period,
  "Admin login",
)
