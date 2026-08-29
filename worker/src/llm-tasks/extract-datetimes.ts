import { generateText, Output, type LanguageModel } from "ai"
import {
  type ConversationTurn,
  formatConversationTranscript,
} from "../types/conversation"
import {
  type BusinessLocalContext,
  type PreferredDatetimes,
  PreferredDatetimesSchema,
} from "../types/llm-task-results"

export function buildExtractDatetimesSystemPrompt(
  masterSystemPrompt: string,
  context: BusinessLocalContext,
): string {
  return (
    `${masterSystemPrompt}\n\n` +
    "Extract preferred service datetimes for the booking being discussed.\n" +
    "The user prompt is a conversation transcript between the customer and the business, oldest message first. Use the conversation context to determine which preferences are still current.\n" +
    "Combine details across messages only when a later message completes the current preference (for example, a time that completes a previously stated day). Do not combine superseded preferences into the current request.\n" +
    'When the customer asks to reschedule, change the appointment, or proposes a replacement (for example, "what about Thursday?"), treat the original booked or previously accepted datetime as no longer preferred. Extract only the replacement preferences that remain current. Do not emit earlier rejected, unavailable, or superseded datetimes unless the customer explicitly asks for them again.\n' +
    "Only extract datetimes the customer is asking for — do not treat times the Business merely offered as customer preferences.\n" +
    'Exception: when the customer accepts or confirms a specific datetime the Business already proposed (e.g. "okay", "that works", "yes", "book it"), extract that Business-proposed datetime as preferred.\n' +
    'When the last customer message states a clock time without a date (e.g. "9am works"), attach it to the date currently being discussed in the conversation, never to today\'s date.\n' +
    "Emit civil wall-clock values in the business timezone only — no UTC, no offset, no Z.\n" +
    "date must be YYYY-MM-DD. time must be HH:mm when a clock time is stated, otherwise null.\n" +
    "Resolve relative phrases using this business-local context:\n" +
    `timezone: ${context.timezone}\n` +
    `now_local: ${context.nowLocal}\n` +
    `weekday: ${context.weekday}`
  )
}

export async function runExtractDatetimes(
  languageModel: LanguageModel,
  conversation: ConversationTurn[],
  masterSystemPrompt: string,
  context: BusinessLocalContext,
): Promise<{ result: PreferredDatetimes; systemPrompt: string }> {
  const systemPrompt = buildExtractDatetimesSystemPrompt(
    masterSystemPrompt,
    context,
  )
  const { output } = await generateText({
    model: languageModel,
    instructions: systemPrompt,
    prompt: formatConversationTranscript(conversation),
    maxOutputTokens: 2048,
    output: Output.object({ schema: PreferredDatetimesSchema }),
  })

  return {
    result: PreferredDatetimesSchema.parse(output),
    systemPrompt,
  }
}
