import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import type { LanguageModel } from "ai"
import type { OpenRouterReasoningEffort } from "./openrouter-reasoning-effort"

export function createOpenRouterModel(
  apiKey: string,
  languageModelId: string,
  reasoningEffort: OpenRouterReasoningEffort | null,
  customFetch?: typeof fetch,
): LanguageModel {
  const openrouter = createOpenRouter({
    apiKey,
    compatibility: "strict",
    fetch: customFetch,
  })

  return openrouter(languageModelId, {
    plugins: [{ id: "response-healing" }],
    // Prefer fastest providers over OpenRouter's default price-weighted routing.
    provider: { sort: "throughput" },
    // Provider package types omit "max"; extraBody follows the current OpenRouter API.
    ...(reasoningEffort === null
      ? {}
      : { extraBody: { reasoning: { effort: reasoningEffort } } }),
  })
}
