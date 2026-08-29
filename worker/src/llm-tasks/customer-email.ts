import type { WorkerEnv } from "@infra/alchemy.run"
import { getConfiguration } from "../db/configuration"
import { createLanguageModel } from "../llm-provider/create-model"
import { createMessage } from "./create-message"
import { buildCustomerEmailPrompt } from "../prompts/customer-email"

const CUSTOMER_EMAIL_TEMPERATURE = 1.5

type CustomerEmailEnvironment = Pick<
  WorkerEnv,
  "AI" | "DB" | "OPENROUTER_API_KEY"
>

export async function generateCustomerEmail(
  env: CustomerEmailEnvironment,
): Promise<string> {
  const { languageModelId, openRouterReasoningEffort } = await getConfiguration(
    env.DB,
  )
  const email = await createMessage(
    createLanguageModel(env, languageModelId, openRouterReasoningEffort),
    buildCustomerEmailPrompt(),
    { temperature: CUSTOMER_EMAIL_TEMPERATURE },
  )
  return email.trim()
}
