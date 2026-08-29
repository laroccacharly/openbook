import { betterAuth } from "better-auth"
import { admin } from "better-auth/plugins"
import type { WorkerEnv } from "@infra/alchemy.run"

function configuredAuth(env: WorkerEnv) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: false,
    },
    rateLimit: { enabled: false },
    session: { deferSessionRefresh: true },
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
      },
    },
    plugins: [admin()],
  })
}

export function createAuth(
  env: WorkerEnv,
  _waitUntil?: (promise: Promise<unknown>) => void,
): ReturnType<typeof configuredAuth> {
  return configuredAuth(env)
}

export type WorkerAuth = ReturnType<typeof createAuth>
