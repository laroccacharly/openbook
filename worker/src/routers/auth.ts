import { Hono } from "hono"
import type { WorkerEnv } from "@infra/alchemy.run"
import { createAuth } from "../auth/better-auth"

export const authRouter = new Hono<{ Bindings: WorkerEnv }>().on(
  ["GET", "POST"],
  "*",
  (c) =>
    createAuth(c.env, (promise) => c.executionCtx.waitUntil(promise)).handler(
      c.req.raw,
    ),
)
