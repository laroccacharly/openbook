import { APIError } from "better-auth/api"
import { Hono } from "hono"
import { z } from "zod"
import type { WorkerEnv } from "@infra/alchemy.run"
import { createAuth } from "../auth/better-auth"
import {
  requireAuthSession,
  type WorkerAuthVariables,
} from "../auth/require-auth-session"
import { getBookingsByWorkerId } from "../db/bookings"

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
})

export const workerRouter = new Hono<{
  Bindings: WorkerEnv
  Variables: WorkerAuthVariables
}>()
  .use("*", requireAuthSession)
  .post("/change-password", async (c) => {
    const parsed = ChangePasswordSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json(
        {
          error: "bad_request",
          message: "A valid current and new password are required",
        },
        400,
      )
    }
    try {
      await createAuth(c.env, (promise) =>
        c.executionCtx.waitUntil(promise),
      ).api.changePassword({
        headers: c.req.raw.headers,
        body: { ...parsed.data, revokeOtherSessions: false },
      })
      const identity = c.get("workerIdentity")
      await c.env.DB.prepare(
        'DELETE FROM "session" WHERE "userId" = ? AND id <> ?',
      )
        .bind(identity.userId, identity.sessionId)
        .run()
      await c.env.DB.prepare(
        "UPDATE workers SET must_change_password = 0 WHERE id = ?",
      )
        .bind(identity.workerId)
        .run()
      return c.json({ changed: true as const })
    } catch (error) {
      if (error instanceof APIError) {
        return c.json(
          { error: "invalid_password", message: error.message },
          400,
        )
      }
      throw error
    }
  })
  .get("/session", (c) => {
    const identity = c.get("workerIdentity")
    return c.json({
      authenticated: true as const,
      mustChangePassword: identity.mustChangePassword,
    })
  })
  .use("*", async (c, next) => {
    if (c.get("workerIdentity").mustChangePassword) {
      return c.json(
        {
          error: "password_change_required",
          message: "Change your temporary password to continue",
        },
        403,
      )
    }
    await next()
  })
  .get("/me", (c) => {
    const identity = c.get("workerIdentity")
    return c.json({
      email: identity.email,
      createdAt: identity.createdAt,
    })
  })
  .get("/bookings", async (c) =>
    c.json(
      await getBookingsByWorkerId(c.env.DB, c.get("workerIdentity").workerId),
    ),
  )
