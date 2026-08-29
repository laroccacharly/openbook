import { createWorkersAI } from "workers-ai-provider"
import { openai } from "workers-ai-provider/openai"
import type { LanguageModel } from "ai"
import type { WorkerEnv } from "@infra/alchemy.run"

export function createCloudflareModel(
  ai: WorkerEnv["AI"],
  languageModelId: string,
): LanguageModel {
  const workersai = createWorkersAI({
    binding: ai,
    // Routes openai/… and xai/… via AI Gateway; @cf/… stays on the binding.
    providers: [openai],
  })
  return workersai(languageModelId)
}
