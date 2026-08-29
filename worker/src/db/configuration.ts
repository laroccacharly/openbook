import type { D1Database } from "@cloudflare/workers-types"
import { z } from "zod"
import { OpenRouterReasoningEffortSchema } from "../llm-provider/openrouter-reasoning-effort"

const ConfigurationRowSchema = z.object({
  id: z.literal(1),
  enable_google_calendar: z.union([z.literal(0), z.literal(1)]),
  enable_message_delivery: z.union([z.literal(0), z.literal(1)]),
  auto_approve_drafts: z.union([z.literal(0), z.literal(1)]),
  master_system_prompt: z.string(),
  timezone: z.string(),
  allow_same_day_bookings: z.union([z.literal(0), z.literal(1)]),
  booking_buffer_minutes: z.number().int().nonnegative(),
  horizon_days: z.number().int().positive(),
  deposit_amount: z.number().int().positive(),
  language_model: z.string().min(1),
  chat_language_model: z.string().min(1),
  openrouter_reasoning_effort: OpenRouterReasoningEffortSchema.nullable(),
})

export const ConfigurationSchema = z.object({
  enableGoogleCalendar: z.boolean(),
  enableMessageDelivery: z.boolean(),
  autoApproveDrafts: z.boolean(),
  masterSystemPrompt: z.string().min(1),
  timezone: z.string().min(1),
  allowSameDayBookings: z.boolean(),
  bookingBufferMinutes: z.number().int().nonnegative(),
  horizonDays: z.number().int().positive(),
  depositAmount: z.number().int().positive(),
  languageModelId: z.string().min(1),
  chatLanguageModelId: z.string().min(1),
  openRouterReasoningEffort: OpenRouterReasoningEffortSchema.nullable(),
})

export type Configuration = z.infer<typeof ConfigurationSchema>

export const ConfigurationPatchSchema = ConfigurationSchema.partial().strict()

export type ConfigurationPatch = z.input<typeof ConfigurationPatchSchema>

export async function getConfiguration(db: D1Database): Promise<Configuration> {
  const result = await db
    .prepare(
      `SELECT id, enable_google_calendar, enable_message_delivery,
              master_system_prompt, timezone,
              allow_same_day_bookings, booking_buffer_minutes, horizon_days,
              deposit_amount, language_model, chat_language_model,
              openrouter_reasoning_effort,
              auto_approve_drafts
       FROM configuration
       WHERE id = 1`,
    )
    .first()

  if (result === null) {
    throw new Error("Configuration row is missing")
  }

  const row = ConfigurationRowSchema.parse(result)
  return ConfigurationSchema.parse({
    enableGoogleCalendar: row.enable_google_calendar === 1,
    enableMessageDelivery: row.enable_message_delivery === 1,
    autoApproveDrafts: row.auto_approve_drafts === 1,
    masterSystemPrompt: row.master_system_prompt,
    timezone: row.timezone,
    allowSameDayBookings: row.allow_same_day_bookings === 1,
    bookingBufferMinutes: row.booking_buffer_minutes,
    horizonDays: row.horizon_days,
    depositAmount: row.deposit_amount,
    languageModelId: row.language_model,
    chatLanguageModelId: row.chat_language_model,
    openRouterReasoningEffort: row.openrouter_reasoning_effort,
  })
}

function pushConfigurationPatch(
  updates: string[],
  values: (string | number | null)[],
  column: string,
  value: string | number | null | undefined,
): void {
  if (value === undefined) {
    return
  }
  updates.push(`${column} = ?`)
  values.push(value)
}

function configurationPatchSql(patch: ConfigurationPatch): {
  updates: string[]
  values: (string | number | null)[]
} {
  const updates: string[] = []
  const values: (string | number | null)[] = []

  pushConfigurationPatch(
    updates,
    values,
    "enable_google_calendar",
    patch.enableGoogleCalendar === undefined
      ? undefined
      : Number(patch.enableGoogleCalendar),
  )
  pushConfigurationPatch(
    updates,
    values,
    "enable_message_delivery",
    patch.enableMessageDelivery === undefined
      ? undefined
      : Number(patch.enableMessageDelivery),
  )
  pushConfigurationPatch(
    updates,
    values,
    "auto_approve_drafts",
    patch.autoApproveDrafts === undefined
      ? undefined
      : Number(patch.autoApproveDrafts),
  )
  pushConfigurationPatch(
    updates,
    values,
    "master_system_prompt",
    patch.masterSystemPrompt,
  )
  pushConfigurationPatch(updates, values, "timezone", patch.timezone)
  pushConfigurationPatch(
    updates,
    values,
    "allow_same_day_bookings",
    patch.allowSameDayBookings === undefined
      ? undefined
      : Number(patch.allowSameDayBookings),
  )
  pushConfigurationPatch(
    updates,
    values,
    "booking_buffer_minutes",
    patch.bookingBufferMinutes,
  )
  pushConfigurationPatch(updates, values, "horizon_days", patch.horizonDays)
  pushConfigurationPatch(updates, values, "deposit_amount", patch.depositAmount)
  pushConfigurationPatch(
    updates,
    values,
    "language_model",
    patch.languageModelId,
  )
  pushConfigurationPatch(
    updates,
    values,
    "chat_language_model",
    patch.chatLanguageModelId,
  )
  pushConfigurationPatch(
    updates,
    values,
    "openrouter_reasoning_effort",
    patch.openRouterReasoningEffort,
  )

  return { updates, values }
}

export async function patchConfiguration(
  db: D1Database,
  input: ConfigurationPatch,
): Promise<Configuration> {
  const patch = ConfigurationPatchSchema.parse(input)
  const { updates, values } = configurationPatchSql(patch)

  if (updates.length === 0) {
    return getConfiguration(db)
  }

  await db
    .prepare(`UPDATE configuration SET ${updates.join(", ")} WHERE id = 1`)
    .bind(...values)
    .run()

  return getConfiguration(db)
}
