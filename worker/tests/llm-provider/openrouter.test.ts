import { generateText } from "ai"
import { describe, expect, test } from "vitest"
import { createOpenRouterModel } from "@worker/src/llm-provider/openrouter"

describe("OpenRouter model configuration", () => {
  test("omits provider-default reasoning and sends an explicit effort", async () => {
    type OpenRouterRequestBody = {
      provider?: { sort?: string }
      reasoning?: { effort?: string }
    }
    const bodies: OpenRouterRequestBody[] = []
    const fetchMock: typeof fetch = async (_input, init) => {
      bodies.push(JSON.parse(init?.body as string))
      return new Response(
        JSON.stringify({
          id: "test-response",
          created: 0,
          model: "openai/gpt-5.6-luna",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "ok" },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      )
    }

    await generateText({
      model: createOpenRouterModel(
        "test-key",
        "openai/gpt-5.6-luna",
        null,
        fetchMock,
      ),
      prompt: "Hello",
    })
    await generateText({
      model: createOpenRouterModel(
        "test-key",
        "openai/gpt-5.6-luna",
        "minimal",
        fetchMock,
      ),
      prompt: "Hello",
    })

    expect(bodies[0]).toMatchObject({
      provider: { sort: "throughput" },
    })
    expect(bodies[0]).not.toHaveProperty("reasoning")
    expect(bodies[1]).toMatchObject({
      provider: { sort: "throughput" },
      reasoning: { effort: "minimal" },
    })
  })
})
