import { env } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import {
  getGoogleCalendarConnection,
  upsertGoogleCalendarConnection,
} from "@worker/src/db/google-connections"

describe("Google Calendar connection storage", () => {
  test("upserts and reads the singleton connection", async () => {
    await upsertGoogleCalendarConnection(env.DB, {
      refreshToken: "stored-refresh-token",
      email: "owner@example.com",
    })

    await expect(getGoogleCalendarConnection(env.DB)).resolves.toEqual({
      refreshToken: "stored-refresh-token",
      email: "owner@example.com",
      connectedAt: expect.any(Number),
    })
  })
})
