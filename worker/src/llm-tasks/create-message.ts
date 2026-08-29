import { generateText, type LanguageModel } from "ai"

export type CreateMessageOptions = {
  temperature?: number
}

export async function createMessage(
  languageModel: LanguageModel,
  message: string,
  options: CreateMessageOptions = {},
): Promise<string> {
  const result = await generateText({
    model: languageModel,
    instructions: "Answer briefly and directly.",
    prompt: message,
    maxOutputTokens: 256,
    temperature: options.temperature,
  })

  if (!result.text) {
    throw new Error("Unexpected AI response: empty output text")
  }

  return result.text
}
