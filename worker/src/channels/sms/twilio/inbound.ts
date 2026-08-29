import type { FromMessage } from "../../../types/message"
import type { z } from "zod"
import type { TwilioInboundSmsSchema } from "./schemas"

export function inboundSmsMessage(
  inbound: z.infer<typeof TwilioInboundSmsSchema>,
): FromMessage {
  return {
    channel: "sms",
    address: inbound.From,
    message: inbound.Body,
    externalId: `sms:${inbound.MessageSid}`,
  }
}
