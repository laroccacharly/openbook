import { Hono } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import { z } from "zod"
import type { WorkerEnv } from "@infra/alchemy.run"
import { sendEmail } from "./outbound"
import { SendEmailInputSchema } from "./types"

export const emailChannelRouter = new Hono<{ Bindings: WorkerEnv }>().post(
  "/email/send",
  async (c) => {
    const parsed = SendEmailInputSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: z.flattenError(parsed.error) }, 400)
    }

    const result = await sendEmail(c.env, parsed.data)
    if (!result.ok) {
      const status =
        result.status >= 400 && result.status < 600
          ? (result.status as ContentfulStatusCode)
          : 502
      return c.json({ error: result.error }, status)
    }

    return c.json(
      {
        messageId: result.messageId,
        to: result.to,
        from: result.from,
        subject: result.subject,
      },
      201,
    )
  },
)
