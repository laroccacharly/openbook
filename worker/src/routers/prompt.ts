import { Hono } from "hono"
import { z } from "zod"
import type { WorkerEnv } from "@infra/alchemy.run"
import { getConfiguration } from "../db/configuration"
import { getJobCatalog } from "../db/job-catalog"
import { createLanguageModel } from "../llm-provider/create-model"
import { createMessage } from "../llm-tasks/create-message"
import { generateCustomerEmail } from "../llm-tasks/customer-email"
import { buildBookingDescriptionPrompt } from "../prompts/booking-description"
import { businessLocalContext } from "../time"
import { MessageInputSchema } from "../types"

export const promptRouter = new Hono<{ Bindings: WorkerEnv }>()
  .post("/prompt/booking-description", async (c) => {
    const [configuration, jobCatalog] = await Promise.all([
      getConfiguration(c.env.DB),
      getJobCatalog(c.env.DB),
    ])
    const { timezone, languageModelId, openRouterReasoningEffort } =
      configuration
    const description = await createMessage(
      createLanguageModel(c.env, languageModelId, openRouterReasoningEffort),
      buildBookingDescriptionPrompt(
        businessLocalContext(new Date(), timezone),
        jobCatalog,
      ),
    )
    return c.json({ description })
  })
  .post("/prompt/customer-email", async (c) => {
    return c.json({ email: await generateCustomerEmail(c.env) })
  })
  .post("/prompt", async (c) => {
    const parsed = MessageInputSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: z.flattenError(parsed.error) }, 400)
    }

    const { languageModelId, openRouterReasoningEffort } =
      await getConfiguration(c.env.DB)
    const reply = await createMessage(
      createLanguageModel(
        c.env,
        parsed.data.languageModelId ?? languageModelId,
        openRouterReasoningEffort,
      ),
      parsed.data.message,
    )
    return c.json({ reply })
  })
