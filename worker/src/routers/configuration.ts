import { Hono } from "hono"
import { z } from "zod"
import type { WorkerEnv } from "@infra/alchemy.run"
import {
  ConfigurationPatchSchema,
  getConfiguration,
  patchConfiguration,
} from "../db/configuration"

export const configurationRouter = new Hono<{ Bindings: WorkerEnv }>()
  .get("/config", async (c) => {
    return c.json(await getConfiguration(c.env.DB))
  })
  .patch("/config", async (c) => {
    const parsed = ConfigurationPatchSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: z.flattenError(parsed.error) }, 400)
    }

    return c.json(await patchConfiguration(c.env.DB, parsed.data))
  })
