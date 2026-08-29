import { Hono } from "hono"
import { z } from "zod"
import { createAgentUIStreamResponse, generateId } from "ai"
import type { WorkerEnv } from "@infra/alchemy.run"
import { getConfiguration } from "../db/configuration"
import { getAdminChatMessages, saveAdminChatMessages } from "../db/admin-chat"
import { createLanguageModel } from "../llm-provider/create-model"
import { createAdminChatAgent } from "../chat/agent"

const ChatRequestSchema = z.object({
  messages: z.array(z.unknown()),
})

export const chatRouter = new Hono<{ Bindings: WorkerEnv }>()
  .get("/chat", async (c) => {
    c.header("Cache-Control", "no-store")
    return c.json({ messages: await getAdminChatMessages(c.env.DB) })
  })
  .post("/chat", async (c) => {
    const parsed = ChatRequestSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: z.flattenError(parsed.error) }, 400)
    }

    const { chatLanguageModelId, openRouterReasoningEffort, timezone } =
      await getConfiguration(c.env.DB)
    const agent = await createAdminChatAgent({
      model: createLanguageModel(
        c.env,
        chatLanguageModelId,
        openRouterReasoningEffort,
      ),
      db: c.env.DB,
      timezone,
      now: new Date(),
    })

    return createAgentUIStreamResponse({
      agent,
      uiMessages: parsed.data.messages,
      abortSignal: c.req.raw.signal,
      generateMessageId: generateId,
      onError: () => "Something went wrong. Please try again.",
      onEnd: async ({ messages }) => {
        await saveAdminChatMessages(c.env.DB, messages)
      },
    })
  })
  .delete("/chat", async (c) => {
    c.header("Cache-Control", "no-store")
    await saveAdminChatMessages(c.env.DB, [])
    return c.json({ messages: [] })
  })
