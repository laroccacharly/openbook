import { describe, expect, test } from "vitest"
import { buildComposeResponseSystemPrompt } from "@worker/src/llm-tasks/compose-response"
import { humanReadableDatetime } from "@worker/src/time"

describe("buildComposeResponseSystemPrompt", () => {
  test("serializes Date fields with iso and human-readable display", () => {
    const proposedDatetime = new Date("2026-08-10T13:00:00.000Z")
    const timezone = "America/Toronto"
    const prompt = buildComposeResponseSystemPrompt("MASTER", {
      businessTimezone: timezone,
      proposedDatetime,
      actionOutcome: {
        status: "confirmation_required",
        proposedDatetime,
      },
    })

    const display = humanReadableDatetime(proposedDatetime, timezone)
    expect(prompt).toContain(`"iso": "2026-08-10T13:00:00.000Z"`)
    expect(prompt).toContain(`"display": "${display}"`)
    expect(prompt).not.toMatch(
      /"proposedDatetime": "2026-08-10T13:00:00\.000Z"/,
    )
  })
})
