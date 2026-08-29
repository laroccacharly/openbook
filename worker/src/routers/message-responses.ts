import { Hono } from "hono"
import type { WorkerEnv } from "@infra/alchemy.run"
import {
  getMessageResponseByMessageId,
  getMessageResponses,
} from "../db/message-responses"

function parseMessageId(raw: string): number | null {
  if (raw === "") {
    return null
  }
  const id = Number(raw)
  if (!Number.isInteger(id)) {
    return null
  }
  return id
}

export const messageResponsesRouter = new Hono<{ Bindings: WorkerEnv }>().get(
  "/message_responses",
  async (c) => {
    const rawMessageId = c.req.query("message_id")
    if (rawMessageId === undefined) {
      return c.json(await getMessageResponses(c.env.DB))
    }
    const messageId = parseMessageId(rawMessageId)
    if (messageId === null) {
      return c.json({ error: "Invalid message_id" }, 400)
    }

    const response = await getMessageResponseByMessageId(c.env.DB, messageId)
    if (response === null) {
      return c.json({ error: "Message response not found" }, 404)
    }
    return c.json(response)
  },
)
