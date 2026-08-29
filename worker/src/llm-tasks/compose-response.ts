import { generateText, Output, type LanguageModel } from "ai"
import {
  type ConversationTurn,
  formatConversationTranscript,
} from "../types/conversation"
import { humanReadableDatetime } from "../time"
import {
  type ComposeResponseResult,
  ComposeResponseResultSchema,
} from "../types/llm-task-results"

type ComposeResponseState = {
  businessTimezone: string
}

export const COMPOSE_RESPONSE_INSTRUCTIONS = `Write a short response to the customer's latest message.

The message pipeline state below is the source of truth. Communicate every applicable fact without inventing or changing operational facts.

Rules:
- Answer every entry in firstPass.customer_questions using the business information above.
- Do not mention the work guarantee or warranty unless the customer explicitly asked about it.
- Do not mention the number of workers unless it is more than one. 
- Describe an action as completed only when actionOutcome.status is booked, rescheduled, or cancelled.
- When actionOutcome.schedulingStatus is requested_time_available, the exact requested time is available but is not reserved.
- When actionOutcome.schedulingStatus is confirmation_required, the proposed time requires customer confirmation.
- Ask for a preferred date or time when actionOutcome.schedulingStatus is needs_preference.
- Explain that the requested time is unavailable when actionOutcome.schedulingStatus is requested_time_unavailable.
- Explain that no existing booking was found when actionOutcome.status is no_booking.
- When actionOutcome.status is unknown_job or actionOutcome.bookingDetails.job is null, the requested service is not in the job catalog: politely say it is not offered, and do not ask for required information, availability, or a preferred time.
- When actionOutcome.status is address_not_found, explain using actionOutcome.message and ask the customer to clarify or correct the complete service address. Do not discuss availability or a preferred time.
- When actionOutcome.status is outside_service_area, explain that the address cannot be serviced using actionOutcome.message, and do not ask for required information, availability, or a preferred time.
- For create actions with status not_booked, ask for every entry in actionOutcome.missingRequiredInformation.
- Offer proposedDatetime whenever it is non-null.
- Use only supplied display values for dates and times.`

/** Format Dates before JSON.stringify — Date.toJSON runs before a replacer. */
function serializeForComposePrompt(value: unknown, timezone: string): unknown {
  if (value instanceof Date) {
    return {
      iso: value.toISOString(),
      display: humanReadableDatetime(value, timezone),
    }
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeForComposePrompt(item, timezone))
  }
  if (value === null || typeof value !== "object") {
    return value
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      serializeForComposePrompt(entry, timezone),
    ]),
  )
}

export function buildComposeResponseSystemPrompt<
  State extends ComposeResponseState,
>(masterSystemPrompt: string, state: State, pendingDraft?: string): string {
  return [
    masterSystemPrompt,
    COMPOSE_RESPONSE_INSTRUCTIONS,
    ...(pendingDraft === undefined
      ? []
      : [
          "The following is the current unsent draft. It was not sent to the customer. Preserve useful human edits while updating it for the latest inbound message.",
          "<current_unsent_draft>",
          pendingDraft,
          "</current_unsent_draft>",
        ]),
    "<message_pipeline_state>",
    JSON.stringify(
      serializeForComposePrompt(state, state.businessTimezone),
      null,
      2,
    ),
    "</message_pipeline_state>",
  ].join("\n\n")
}

export async function runComposeResponse(
  languageModel: LanguageModel,
  conversation: ConversationTurn[],
  systemPrompt: string,
): Promise<ComposeResponseResult> {
  const { output } = await generateText({
    model: languageModel,
    instructions: systemPrompt,
    prompt: formatConversationTranscript(conversation),
    maxOutputTokens: 2048,
    output: Output.object({ schema: ComposeResponseResultSchema }),
  })

  return ComposeResponseResultSchema.parse(output)
}
