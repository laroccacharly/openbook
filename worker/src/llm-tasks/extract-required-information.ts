import { generateText, Output, type LanguageModel } from "ai"
import {
  type ConversationTurn,
  formatConversationTranscript,
} from "../types/conversation"
import {
  type ExtractedCustomerInformation,
  ExtractedCustomerInformationSchema,
} from "../types/llm-task-results"

export function buildExtractRequiredInformationSystemPrompt(
  masterSystemPrompt: string,
): string {
  return (
    `${masterSystemPrompt}\n\n` +
    "Extract required booking information from the conversation.\n" +
    "The user prompt is a conversation transcript between the customer and the business, oldest message first. Details may appear in any message, not just the last one.\n" +
    "Set address only if the conversation includes a complete service address with a street name and street number; otherwise null.\n" +
    "A city, neighborhood, or region alone is not an address — leave address null.\n" +
    "Set customer_name to the customer's name if present, otherwise null."
  )
}

export async function runExtractRequiredInformation(
  languageModel: LanguageModel,
  conversation: ConversationTurn[],
  masterSystemPrompt: string,
): Promise<{
  result: ExtractedCustomerInformation
  systemPrompt: string
}> {
  const systemPrompt =
    buildExtractRequiredInformationSystemPrompt(masterSystemPrompt)
  const { output } = await generateText({
    model: languageModel,
    instructions: systemPrompt,
    prompt: formatConversationTranscript(conversation),
    maxOutputTokens: 2048,
    output: Output.object({ schema: ExtractedCustomerInformationSchema }),
  })

  return {
    result: ExtractedCustomerInformationSchema.parse(output),
    systemPrompt,
  }
}
