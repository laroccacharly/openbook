import { env } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import { createHoliday, isHoliday } from "@worker/src/db/holidays"

describe("holidays", () => {
  test("creates a global holiday and checks dates", async () => {
    await createHoliday(env.DB, { date: "2026-07-14" })

    expect(await isHoliday(env.DB, "2026-07-14")).toBe(true)
    expect(await isHoliday(env.DB, "2026-07-15")).toBe(false)
  })

  test("enforces one global holiday per date", async () => {
    await createHoliday(env.DB, { date: "2026-07-14" })

    await expect(
      createHoliday(env.DB, { date: "2026-07-14" }),
    ).rejects.toThrow()
  })
})
