import { generateText, Output, type LanguageModel } from "ai"
import {
  type LlmAssertResult,
  LlmAssertResultSchema,
} from "../types/llm-assert"

export async function runLlmAssert(
  languageModel: LanguageModel,
  input: { prompt: string; text: string },
): Promise<LlmAssertResult> {
  const { output } = await generateText({
    model: languageModel,
    instructions:
      "Evaluate whether the claim is true for the given text. " +
      "Set result to true only when the claim holds; otherwise false.",
    prompt: `Claim: ${input.prompt}\n\nText:\n${input.text}`,
    maxOutputTokens: 1024,
    output: Output.object({ schema: LlmAssertResultSchema }),
  })

  return LlmAssertResultSchema.parse(output)
}
