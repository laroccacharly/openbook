import { Hono } from "hono"
import { z } from "zod"
import type { WorkerEnv } from "@infra/alchemy.run"
import { getMessages } from "../db/messages"
import { ingestCustomerMessage } from "../message-ingestion"
import { FromMessageInputSchema } from "../types/message"

export const messagesRouter = new Hono<{ Bindings: WorkerEnv }>()
  .get("/messages", async (c) => c.json(await getMessages(c.env.DB)))
  .post("/messages/inbound", async (c) => {
    const parsed = FromMessageInputSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: z.flattenError(parsed.error) }, 400)
    }

    const result = await ingestCustomerMessage(c.env, parsed.data)
    return c.json({ id: result.id }, result.created ? 201 : 200)
  })
