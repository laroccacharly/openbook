import { Hono } from "hono"
import type { WorkerEnv } from "@infra/alchemy.run"
import {
  ingestCustomerMessage,
  type MessageIngestionEnvironment,
} from "../../../message-ingestion"
import type { FromMessage } from "../../../types/message"
import { inboundSmsMessage } from "./inbound"
import { resolveTwilioInboundPhoneNumber } from "./inbound-phone-number"
import { TWILIO_INBOUND_SMS_PATH } from "./routes"
import { TwilioInboundSmsSchema } from "./schemas"
import { validateTwilioSignature } from "./validate-signature"

const EMPTY_TWIML =
  '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
const subtle = crypto.subtle as SubtleCrypto & {
  timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean
}

type IngestCustomerMessage = (
  env: MessageIngestionEnvironment,
  input: FromMessage,
) => Promise<{ id: number; created: boolean }>

function formParams(form: FormData): Record<string, string> {
  const params: Record<string, string> = {}
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") params[key] = value
  }
  return params
}

function safeTextEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder()
  const leftBytes = encoder.encode(left)
  const rightBytes = encoder.encode(right)
  return (
    leftBytes.byteLength === rightBytes.byteLength &&
    subtle.timingSafeEqual(
      leftBytes.buffer as ArrayBuffer,
      rightBytes.buffer as ArrayBuffer,
    )
  )
}

export function createSmsWebhookRouter(
  ingest: IngestCustomerMessage = ingestCustomerMessage,
): Hono<{ Bindings: WorkerEnv }> {
  return new Hono<{ Bindings: WorkerEnv }>().post(
    TWILIO_INBOUND_SMS_PATH,
    async (c) => {
      const authToken = c.env.TWILIO_AUTH_TOKEN
      const phoneNumber = resolveTwilioInboundPhoneNumber(c.env)
      if (authToken === undefined || phoneNumber === null) {
        return c.text("SMS is not configured", 503)
      }

      const params = formParams(await c.req.formData())
      const signature = c.req.header("X-Twilio-Signature") ?? ""
      if (
        !(await validateTwilioSignature(
          authToken,
          signature,
          c.req.url,
          params,
        ))
      ) {
        return c.text("Forbidden", 403)
      }

      const parsed = TwilioInboundSmsSchema.safeParse(params)
      if (!parsed.success) return c.text("Bad Request", 400)
      if (!safeTextEqual(parsed.data.To, phoneNumber)) {
        return c.text("Forbidden", 403)
      }

      await ingest(c.env, inboundSmsMessage(parsed.data))
      return c.body(EMPTY_TWIML, 200, { "Content-Type": "text/xml" })
    },
  )
}

export const smsWebhookRouter = createSmsWebhookRouter()
