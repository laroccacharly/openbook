import { Hono } from "hono"
import { z } from "zod"
import type { WorkerEnv } from "@infra/alchemy.run"
import {
  getContactMethodSummary,
  getOrCreateContactMethod,
  listContactMethods,
} from "../db/contact-methods"
import { ContactMethodKeySchema } from "../types/contact-method"

export const contactMethodsRouter = new Hono<{ Bindings: WorkerEnv }>()
  .get("/contact-methods", async (c) =>
    c.json(await listContactMethods(c.env.DB)),
  )
  .post("/contact-methods", async (c) => {
    const parsed = ContactMethodKeySchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: z.flattenError(parsed.error) }, 400)
    }
    const contact = await getOrCreateContactMethod(
      c.env.DB,
      parsed.data.channel,
      parsed.data.address,
    )
    const summary = await getContactMethodSummary(c.env.DB, contact.id)
    if (summary === null) {
      throw new Error("Contact method disappeared after creation")
    }
    return c.json(summary, 201)
  })
