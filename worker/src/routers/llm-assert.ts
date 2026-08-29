import { Hono } from "hono"
import { z } from "zod"
import type { WorkerEnv } from "@infra/alchemy.run"
import { getConfiguration } from "../db/configuration"
import { createLanguageModel } from "../llm-provider/create-model"
import { runLlmAssert } from "../llm-tasks/llm-assert"
import { LlmAssertInputSchema } from "../types"

export const llmAssertRouter = new Hono<{ Bindings: WorkerEnv }>().post(
  "/llm-assert",
  async (c) => {
    const parsed = LlmAssertInputSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: z.flattenError(parsed.error) }, 400)
    }

    const { languageModelId, openRouterReasoningEffort } =
      await getConfiguration(c.env.DB)
    return c.json(
      await runLlmAssert(
        createLanguageModel(
          c.env,
          parsed.data.languageModelId ?? languageModelId,
          openRouterReasoningEffort,
        ),
        {
          prompt: parsed.data.prompt,
          text: parsed.data.text,
        },
      ),
    )
  },
)
