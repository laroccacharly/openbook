import { Hono } from "hono"
import { validator } from "hono/validator"
import { z } from "zod"
import type { WorkerEnv } from "@infra/alchemy.run"
import { hasAdminSession } from "../auth/admin-session"
import {
  provisionWorkerAccount,
  WorkerAccountProvisionError,
} from "../auth/provision-worker-account"
import { createWorkerTimeOffIfAvailable } from "../db/timeoff"
import {
  deleteWorker,
  getOrCreateFullTimeWorker,
  getWorkerById,
  getWorkers,
  WorkerDeleteError,
} from "../db/workers"
import { CreateWorkerTimeOffBodySchema } from "../types/timeoff"

const CreateFullTimeWorkerSchema = z.object({
  name: z.string().min(1),
})

const CreateWorkerAccountSchema = z.object({
  email: z.email().trim(),
})

function parseWorkerId(raw: string): number | null {
  if (raw === "") {
    return null
  }
  const id = Number(raw)
  if (!Number.isInteger(id)) {
    return null
  }
  return id
}

export const workersRouter = new Hono<{ Bindings: WorkerEnv }>()
  .get("/workers", async (c) => {
    return c.json(await getWorkers(c.env.DB))
  })
  .delete("/workers/:id", async (c) => {
    const id = parseWorkerId(c.req.param("id"))
    if (id === null) {
      return c.json({ error: "bad_request", message: "Invalid worker id" }, 400)
    }

    try {
      const worker = await deleteWorker(c.env.DB, id)
      if (worker === null) {
        return c.json({ error: "not_found", message: "Worker not found" }, 404)
      }
      return c.json(worker)
    } catch (error) {
      if (error instanceof WorkerDeleteError) {
        return c.json({ error: error.code, message: error.message }, 409)
      }
      throw error
    }
  })
  .post("/workers/full-time", async (c) => {
    const parsed = CreateFullTimeWorkerSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: z.flattenError(parsed.error) }, 400)
    }

    const worker = await getOrCreateFullTimeWorker(c.env.DB, parsed.data.name)
    return c.json(worker, 201)
  })
  .post(
    "/workers/:id/account",
    validator("json", (value, c) => {
      const parsed = CreateWorkerAccountSchema.safeParse(value)
      if (!parsed.success) {
        return c.json(
          {
            error: "bad_request",
            message: "A valid email address is required",
          },
          400,
        )
      }
      return parsed.data
    }),
    async (c) => {
      if (!(await hasAdminSession(c))) {
        return c.json(
          { error: "unauthorized", message: "Admin session required" },
          401,
        )
      }
      const id = parseWorkerId(c.req.param("id"))
      if (id === null) {
        return c.json(
          { error: "bad_request", message: "Invalid worker id" },
          400,
        )
      }
      try {
        return c.json(
          await provisionWorkerAccount(
            c.env,
            id,
            c.req.valid("json").email,
            (promise) => c.executionCtx.waitUntil(promise),
          ),
          201,
        )
      } catch (error) {
        if (error instanceof WorkerAccountProvisionError) {
          return c.json(
            { error: error.code, message: error.message },
            error.code === "worker_not_found" ? 404 : 409,
          )
        }
        throw error
      }
    },
  )
  .post(
    "/workers/:id/timeoff",
    validator("json", (value, c) => {
      const parsed = CreateWorkerTimeOffBodySchema.safeParse(value)
      if (!parsed.success) {
        return c.json({ error: z.flattenError(parsed.error) }, 400)
      }
      return parsed.data
    }),
    async (c) => {
      const id = parseWorkerId(c.req.param("id"))
      if (id === null) {
        return c.json({ error: "Invalid worker id" }, 400)
      }

      const worker = await getWorkerById(c.env.DB, id)
      if (worker === null) {
        return c.json({ error: "Worker not found" }, 404)
      }

      const { timeOff, created } = await createWorkerTimeOffIfAvailable(
        c.env.DB,
        id,
        c.req.valid("json"),
      )
      return c.json(timeOff, created ? 201 : 200)
    },
  )
