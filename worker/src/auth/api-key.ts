import { bearerAuth } from "hono/bearer-auth"
import { some } from "hono/combine"
import { createMiddleware } from "hono/factory"
import type { WorkerEnv } from "@infra/alchemy.run"
import { hasAdminSession } from "./admin-session"

export const requireApiKey = createMiddleware<{ Bindings: WorkerEnv }>(
  (c, next) =>
    bearerAuth<{ Bindings: WorkerEnv }>({ token: c.env.BOOK_API_KEY })(c, next),
)

const requireAdminSession = createMiddleware<{
  Bindings: WorkerEnv
}>(async (c, next) => {
  if (!(await hasAdminSession(c))) {
    throw new Error("No admin session")
  }
  await next()
})

export const requireApiKeyOrAdminSession = some(
  requireAdminSession,
  requireApiKey,
)
