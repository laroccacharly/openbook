import type { WorkerEnv } from "@infra/alchemy.run"
import type { SendEmailInput, SendEmailResult } from "../types"

export type CloudflareEmailEnvironment = Pick<
  WorkerEnv,
  "BOOK_EMAIL_ADDRESS" | "EMAIL"
>

export type SendEmailOutcome =
  | ({ ok: true } & SendEmailResult)
  | { ok: false; status: number; error: string }

function errorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message !== "") return cause.message
  return "Email send failed"
}

export async function sendCloudflareEmail(
  env: CloudflareEmailEnvironment,
  input: SendEmailInput,
): Promise<SendEmailOutcome> {
  try {
    const result = await env.EMAIL.send({
      to: input.to,
      from: env.BOOK_EMAIL_ADDRESS,
      subject: input.subject,
      text: input.text,
      ...(input.html === undefined ? {} : { html: input.html }),
    })

    return {
      ok: true,
      messageId: result.messageId,
      to: input.to,
      from: env.BOOK_EMAIL_ADDRESS,
      subject: input.subject,
    }
  } catch (cause) {
    return { ok: false, status: 502, error: errorMessage(cause) }
  }
}
