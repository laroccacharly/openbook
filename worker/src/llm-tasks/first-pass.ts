import { generateText, Output, type LanguageModel } from "ai"
import {
  type ConversationTurn,
  formatConversationTranscript,
} from "../types/conversation"
import {
  type FirstPassResult,
  FirstPassResultSchema,
} from "../types/llm-task-results"

export function buildFirstPassSystemPrompt(masterSystemPrompt: string): string {
  return (
    `${masterSystemPrompt}\n\n` +
    "Classify the inbound customer message.\n" +
    "The user prompt is a conversation transcript between the customer and the business, oldest message first. Act on the last customer message; earlier messages are context.\n" +
    "Set booking_action to create, reschedule, cancel, or null if the message is not about booking.\n" +
    "List every question the customer asks in customer_questions.\n" +
    "Set priority from 1 (low) to 5 (high) based on how important or actionable the message is."
  )
}

export async function runFirstPass(
  languageModel: LanguageModel,
  conversation: ConversationTurn[],
  masterSystemPrompt: string,
): Promise<{ result: FirstPassResult; systemPrompt: string }> {
  const systemPrompt = buildFirstPassSystemPrompt(masterSystemPrompt)
  const { output } = await generateText({
    model: languageModel,
    instructions: systemPrompt,
    prompt: formatConversationTranscript(conversation),
    maxOutputTokens: 2048,
    output: Output.object({ schema: FirstPassResultSchema }),
  })

  return {
    result: FirstPassResultSchema.parse(output),
    systemPrompt,
  }
}
