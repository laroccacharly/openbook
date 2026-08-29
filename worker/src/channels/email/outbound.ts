import {
  sendCloudflareEmail,
  type CloudflareEmailEnvironment,
  type SendEmailOutcome,
} from "./cloudflare/client"
import { SendEmailInputSchema, type SendEmailInput } from "./types"

/** Validate the channel-level request before handing it to the provider. */
export function sendEmail(
  env: CloudflareEmailEnvironment,
  input: SendEmailInput,
): Promise<SendEmailOutcome> {
  return sendCloudflareEmail(env, SendEmailInputSchema.parse(input))
}

export type { SendEmailOutcome }
