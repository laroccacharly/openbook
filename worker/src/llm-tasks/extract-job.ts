import { generateText, Output, type LanguageModel } from "ai"
import { formatJobCatalogForPrompt } from "../prompts/job-catalog"
import type { CatalogJob } from "../types/job-catalog"
import {
  type ConversationTurn,
  formatConversationTranscript,
} from "../types/conversation"
import {
  type ExtractJobResult,
  ExtractJobResultSchema,
} from "../types/llm-task-results"

export function buildExtractJobSystemPrompt(
  masterSystemPrompt: string,
  jobCatalog: readonly CatalogJob[],
): string {
  return (
    `${masterSystemPrompt}\n\n` +
    `${formatJobCatalogForPrompt(jobCatalog)}\n\n` +
    "Match the customer's request to one catalog job above, copying its duration, price in cents, and worker count.\n" +
    "Write a short description of the requested work.\n" +
    "Use your judgment to determine the best description, even if it doesn't exactly match the catalog.\n" +
    "If none match, set job to null."
  )
}

export async function runExtractJob(
  languageModel: LanguageModel,
  conversation: ConversationTurn[],
  masterSystemPrompt: string,
  jobCatalog: readonly CatalogJob[],
): Promise<{ result: ExtractJobResult; systemPrompt: string }> {
  const systemPrompt = buildExtractJobSystemPrompt(
    masterSystemPrompt,
    jobCatalog,
  )
  const { output } = await generateText({
    model: languageModel,
    instructions: systemPrompt,
    prompt: formatConversationTranscript(conversation),
    maxOutputTokens: 2048,
    output: Output.object({ schema: ExtractJobResultSchema }),
  })

  return {
    result: ExtractJobResultSchema.parse(output),
    systemPrompt,
  }
}
