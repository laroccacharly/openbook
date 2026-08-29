import type { LanguageModel } from "ai"
import type { WorkerEnv } from "@infra/alchemy.run"
import { createCloudflareModel } from "./cloudflare"
import { createOpenRouterModel } from "./openrouter"
import type { OpenRouterReasoningEffort } from "./openrouter-reasoning-effort"

export function isCloudflareLanguageModelId(languageModelId: string): boolean {
  return languageModelId.startsWith("@cf/")
}

export function createLanguageModel(
  env: Pick<WorkerEnv, "AI" | "OPENROUTER_API_KEY">,
  languageModelId: string,
  openRouterReasoningEffort: OpenRouterReasoningEffort | null,
): LanguageModel {
  if (isCloudflareLanguageModelId(languageModelId)) {
    return createCloudflareModel(env.AI, languageModelId)
  }
  return createOpenRouterModel(
    env.OPENROUTER_API_KEY,
    languageModelId,
    openRouterReasoningEffort,
  )
}
