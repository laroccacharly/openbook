import { generateText, Output, type LanguageModel } from "ai"
import {
  type CreateBooking,
  CreateBookingExtractionSchema,
  CreateBookingInputSchema,
} from "../types"

export async function extractCreateBooking(
  languageModel: LanguageModel,
  message: string,
): Promise<CreateBooking> {
  const { output } = await generateText({
    model: languageModel,
    instructions:
      "Extract a booking create payload. Use null for details that are not present. " +
      "Datetimes must be ISO 8601 UTC exactly as stated — do not convert timezones.",
    prompt: message,
    // Reasoning models (GLM, Grok) spend tokens before the final JSON.
    maxOutputTokens: 2048,
    output: Output.object({ schema: CreateBookingExtractionSchema }),
  })

  return CreateBookingInputSchema.parse(output)
}
