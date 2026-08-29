import type { SendSmsInput, SendSmsResult } from "../types"
import {
  type TwilioSendEnvironment,
  TwilioErrorResponseSchema,
  TwilioMessageResponseSchema,
} from "./schemas"

export type { TwilioSendEnvironment }

export type SendSmsOutcome =
  | ({ ok: true } & SendSmsResult)
  | { ok: false; status: number; error: string; code?: number }

export async function sendTwilioSms(
  env: TwilioSendEnvironment,
  input: SendSmsInput,
): Promise<SendSmsOutcome> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`
  const credentials = btoa(`${env.TWILIO_API_KEY}:${env.TWILIO_API_SECRET}`)
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: input.to,
      From: env.TWILIO_PHONE_NUMBER,
      Body: input.body,
    }),
  })
  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const error = TwilioErrorResponseSchema.safeParse(payload)
    return {
      ok: false,
      status: response.status,
      error: error.success
        ? (error.data.message ?? "Twilio request failed")
        : "Twilio request failed",
      ...(error.success && error.data.code !== undefined
        ? { code: error.data.code }
        : {}),
    }
  }

  const parsed = TwilioMessageResponseSchema.safeParse(payload)
  if (!parsed.success) {
    return { ok: false, status: 502, error: "Unexpected Twilio response" }
  }
  return { ok: true, ...parsed.data }
}
