import type { D1Database } from "@cloudflare/workers-types"
import {
  type Holiday,
  type HolidayCreate,
  HolidayCreateSchema,
  HolidaySchema,
} from "../types/holiday"

function parseHolidayRow(row: unknown): Holiday {
  return HolidaySchema.parse(row)
}

export async function createHoliday(
  db: D1Database,
  input: HolidayCreate,
): Promise<Holiday> {
  const holiday = HolidayCreateSchema.parse(input)
  const result = await db
    .prepare(
      `INSERT INTO holidays (date)
       VALUES (?)
       RETURNING id, date`,
    )
    .bind(holiday.date)
    .first()

  if (result === null) {
    throw new Error("Failed to create holiday")
  }
  return parseHolidayRow(result)
}

export async function isHoliday(
  db: D1Database,
  date: string,
): Promise<boolean> {
  const holidayDate = HolidayCreateSchema.shape.date.parse(date)
  const result = await db
    .prepare(
      `SELECT 1
       FROM holidays
       WHERE date = ?`,
    )
    .bind(holidayDate)
    .first()
  return result !== null
}
