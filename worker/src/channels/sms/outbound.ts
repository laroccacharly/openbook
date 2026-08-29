import {
  sendTwilioSms,
  type SendSmsOutcome,
  type TwilioSendEnvironment,
} from "./twilio/client"
import { SendSmsInputSchema, type SendSmsInput } from "./types"

/** Validate the channel-level request before handing it to the provider. */
export function sendSms(
  env: TwilioSendEnvironment,
  input: SendSmsInput,
): Promise<SendSmsOutcome> {
  return sendTwilioSms(env, SendSmsInputSchema.parse(input))
}

export type { SendSmsOutcome }
