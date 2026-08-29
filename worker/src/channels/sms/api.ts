import { Hono } from "hono"
import type { WorkerEnv } from "@infra/alchemy.run"
import { resolveTwilioInboundPhoneNumber } from "./twilio/inbound-phone-number"

export const smsChannelRouter = new Hono<{ Bindings: WorkerEnv }>().get(
  "/channels/sms",
  (c) =>
    c.json({
      inboundPhoneNumber: resolveTwilioInboundPhoneNumber(c.env),
    }),
)
