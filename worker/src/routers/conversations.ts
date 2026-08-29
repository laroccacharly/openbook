import { Hono } from "hono"
import type { WorkerEnv } from "@infra/alchemy.run"
import { loadConversation } from "../db/conversations"

function parseConversationId(raw: string): number | null {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export const conversationsRouter = new Hono<{ Bindings: WorkerEnv }>().get(
  "/conversations/:conversationId",
  async (c) => {
    const conversationId = parseConversationId(c.req.param("conversationId"))
    if (conversationId === null) {
      return c.json({ error: "Invalid conversation id" }, 400)
    }
    const conversation = await loadConversation(c.env.DB, conversationId)
    if (conversation === null) {
      return c.json({ error: "Conversation not found" }, 404)
    }
    return c.json(conversation)
  },
)
