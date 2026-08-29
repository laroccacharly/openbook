import { Hono } from "hono"
import { z } from "zod"
import type { WorkerEnv } from "@infra/alchemy.run"
import {
  adminPasswordMatches,
  clearAdminSession,
  createAdminSession,
  hasAdminSession,
} from "../auth/admin-session"
import { adminLoginRateLimit } from "../rate-limit"

const adminLoginSchema = z.object({
  password: z.string().min(1),
})

function invalidOrigin(c: { req: { raw: Request } }) {
  const expectedOrigin = new URL(c.req.raw.url).origin
  const origin = c.req.raw.headers.get("Origin")
  if (origin === expectedOrigin) {
    return null
  }
  return Response.json(
    { error: "forbidden", message: "Invalid request origin" },
    { status: 403 },
  )
}

export const adminRouter = new Hono<{ Bindings: WorkerEnv }>()
  .post("/login", adminLoginRateLimit, async (c) => {
    const originError = invalidOrigin(c)
    if (originError !== null) {
      return originError
    }

    const parsed = adminLoginSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json(
        { error: "bad_request", message: "Password is required" },
        400,
      )
    }

    if (
      !(await adminPasswordMatches(parsed.data.password, c.env.ADMIN_PASSWORD))
    ) {
      return c.json({ error: "unauthorized", message: "Invalid password" }, 401)
    }

    await createAdminSession(c)
    return c.json({ authenticated: true as const })
  })
  .post("/logout", (c) => {
    const originError = invalidOrigin(c)
    if (originError !== null) {
      return originError
    }

    clearAdminSession(c)
    return c.json({ authenticated: false as const })
  })
  .get("/session", async (c) => {
    c.header("Cache-Control", "no-store")
    return c.json({ authenticated: await hasAdminSession(c) })
  })
