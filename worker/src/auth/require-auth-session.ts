import { createMiddleware } from "hono/factory"
import type { WorkerEnv } from "@infra/alchemy.run"
import { createAuth } from "./better-auth"

export type WorkerSessionIdentity = {
  userId: string
  sessionId: string
  workerId: number
  email: string
  createdAt: Date
  mustChangePassword: boolean
}

export type WorkerAuthVariables = {
  workerIdentity: WorkerSessionIdentity
}

export const requireAuthSession = createMiddleware<{
  Bindings: WorkerEnv
  Variables: WorkerAuthVariables
}>(async (c, next) => {
  const auth = createAuth(c.env, (promise) => c.executionCtx.waitUntil(promise))
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (session === null) {
    return c.json({ error: "unauthorized", message: "Sign in required" }, 401)
  }

  const linked = await c.env.DB.prepare(
    `SELECT id, must_change_password
     FROM workers
     WHERE better_auth_user_id = ?
     LIMIT 1`,
  )
    .bind(session.user.id)
    .first<{ id: number; must_change_password: number }>()
  if (linked === null) {
    return c.json(
      { error: "forbidden", message: "No worker is linked to this account" },
      403,
    )
  }

  c.set("workerIdentity", {
    userId: session.user.id,
    sessionId: session.session.id,
    workerId: linked.id,
    email: session.user.email,
    createdAt: session.user.createdAt,
    mustChangePassword: linked.must_change_password === 1,
  })
  await next()
})
