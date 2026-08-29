import { env, exports } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import {
  getConfiguration,
  patchConfiguration,
} from "@worker/src/db/configuration"
import { API_PREFIX } from "@infra/routes"
import { TEST_BOOK_API_KEY } from "../fixtures/api-key"
import { testApiClient } from "../fixtures/api-client"

describe("configuration persistence", () => {
  test("seeds the singleton with Google Calendar disabled", async () => {
    const configuration = await getConfiguration(env.DB)
    expect(configuration.enableGoogleCalendar).toBe(false)
    expect(configuration.enableMessageDelivery).toBe(false)
    expect(configuration.autoApproveDrafts).toBe(false)
    expect(configuration.bookingBufferMinutes).toBe(0)
    expect(configuration.horizonDays).toBe(365)
    expect(configuration.depositAmount).toBe(5_000)
    expect(configuration.languageModelId).toBe("openai/gpt-5.6-luna")
    expect(configuration.chatLanguageModelId).toBe("openai/gpt-5.6-sol")
    expect(configuration.openRouterReasoningEffort).toBeNull()
  })

  test("patches supplied fields and leaves others unchanged", async () => {
    const enabled = await patchConfiguration(env.DB, {
      enableGoogleCalendar: true,
      enableMessageDelivery: true,
      autoApproveDrafts: true,
    })
    expect(enabled.enableGoogleCalendar).toBe(true)
    expect(enabled.enableMessageDelivery).toBe(true)
    expect(enabled.autoApproveDrafts).toBe(true)

    const updated = await patchConfiguration(env.DB, {
      masterSystemPrompt: "You are a booking assistant",
      timezone: "America/Vancouver",
      bookingBufferMinutes: 30,
      horizonDays: 90,
      depositAmount: 7_500,
      languageModelId: "@cf/openai/gpt-oss-120b",
      chatLanguageModelId: "@cf/zai-org/glm-5.2",
      openRouterReasoningEffort: "minimal",
    })
    expect(updated.enableGoogleCalendar).toBe(true)
    expect(updated.masterSystemPrompt).toBe("You are a booking assistant")
    expect(updated.timezone).toBe("America/Vancouver")
    expect(updated.bookingBufferMinutes).toBe(30)
    expect(updated.horizonDays).toBe(90)
    expect(updated.depositAmount).toBe(7_500)
    expect(updated.languageModelId).toBe("@cf/openai/gpt-oss-120b")
    expect(updated.chatLanguageModelId).toBe("@cf/zai-org/glm-5.2")
    expect(updated.openRouterReasoningEffort).toBe("minimal")

    await expect(patchConfiguration(env.DB, {})).resolves.toEqual(updated)
    await expect(
      patchConfiguration(env.DB, { openRouterReasoningEffort: null }),
    ).resolves.toMatchObject({ openRouterReasoningEffort: null })
  })

  test("enforces a single row at the database boundary", async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO configuration (id, enable_google_calendar)
         VALUES (2, 0)`,
      ).run(),
    ).rejects.toThrow()
  })
})

describe("configuration API", () => {
  test("gets and patches configuration through the typed client", async () => {
    const initial = await testApiClient.getConfiguration()
    expect(initial.enableGoogleCalendar).toBe(false)
    expect(initial.enableMessageDelivery).toBe(false)
    expect(initial.autoApproveDrafts).toBe(false)
    expect(initial.bookingBufferMinutes).toBe(0)
    expect(initial.horizonDays).toBe(365)
    expect(initial.depositAmount).toBe(5_000)
    expect(initial.languageModelId).toBe("openai/gpt-5.6-luna")
    expect(initial.chatLanguageModelId).toBe("openai/gpt-5.6-sol")
    expect(initial.openRouterReasoningEffort).toBeNull()

    const patched = await testApiClient.patchConfiguration({
      enableGoogleCalendar: true,
      enableMessageDelivery: true,
      autoApproveDrafts: true,
      bookingBufferMinutes: 45,
      horizonDays: 180,
      depositAmount: 2_500,
      languageModelId: "anthropic/claude-sonnet-4.5",
      chatLanguageModelId: "openai/gpt-5.6-luna",
      openRouterReasoningEffort: "high",
    })
    expect(patched.enableGoogleCalendar).toBe(true)
    expect(patched.enableMessageDelivery).toBe(true)
    expect(patched.autoApproveDrafts).toBe(true)
    expect(patched.bookingBufferMinutes).toBe(45)
    expect(patched.horizonDays).toBe(180)
    expect(patched.depositAmount).toBe(2_500)
    expect(patched.languageModelId).toBe("anthropic/claude-sonnet-4.5")
    expect(patched.chatLanguageModelId).toBe("openai/gpt-5.6-luna")
    expect(patched.openRouterReasoningEffort).toBe("high")

    await expect(testApiClient.patchConfiguration({})).resolves.toEqual(patched)
  })

  test("rejects unknown patch fields", async () => {
    const response = await exports.default.fetch(
      new Request(`http://localhost${API_PREFIX}/config`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${TEST_BOOK_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enableGoogleCalendar: true,
          unknown: "value",
        }),
      }),
    )

    expect(response.status).toBe(400)
  })
})
