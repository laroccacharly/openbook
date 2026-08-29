import PostalMime, { type Address, type Email } from "postal-mime"
import type { WorkerEnv } from "@infra/alchemy.run"
import {
  ingestCustomerMessage,
  type MessageIngestionEnvironment,
} from "../../message-ingestion"
import { FromMessageInputSchema, type FromMessage } from "../../types/message"

type IngestCustomerMessage = (
  env: MessageIngestionEnvironment,
  input: FromMessage,
) => Promise<{ id: number; created: boolean }>

export type InboundEmailEventMessage = {
  from: string
  to: string
  headers: Headers
  raw: ReadableStream<Uint8Array>
  setReject(reason: string): void
}

const HTML_BLOCK_TAGS =
  /<\/?(?:address|article|aside|blockquote|br|div|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|td|th|tr|ul)\b[^>]*>/gi

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  }
  return value.replace(
    /&(#(?:x[0-9a-f]+|[0-9]+)|[a-z]+);/gi,
    (entity, encoded: string) => {
      if (encoded.startsWith("#x") || encoded.startsWith("#X")) {
        return String.fromCodePoint(Number.parseInt(encoded.slice(2), 16))
      }
      if (encoded.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(encoded.slice(1), 10))
      }
      return named[encoded.toLowerCase()] ?? entity
    },
  )
}

/** Convert an HTML-only email into readable channel-neutral message text. */
export function emailHtmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, "")
      .replace(HTML_BLOCK_TAGS, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
}

function firstMailbox(address: Address | undefined): string | undefined {
  if (address === undefined) return undefined
  if (address.address !== undefined) return address.address
  return address.group[0]?.address
}

function senderAddress(email: Email, envelopeFrom: string): string {
  for (const address of email.replyTo ?? []) {
    const mailbox = firstMailbox(address)
    if (mailbox !== undefined) return mailbox
  }
  return firstMailbox(email.from) ?? envelopeFrom
}

const STORED_SUBJECT_PREFIX = /^Subject: ([^\n]+)\n\n/

function normalizedBody(email: Email): string {
  const body =
    email.text?.trim() ||
    (email.html === undefined ? "" : emailHtmlToText(email.html))
  if (body === "") throw new Error("Email has no readable body")

  const subject = email.subject?.trim()
  return subject === undefined || subject === ""
    ? body
    : `Subject: ${subject}\n\n${body}`
}

/** Build a reply subject from inbound text stored by {@link normalizedBody}. */
export function replyEmailSubject(storedInboundMessage: string): string {
  const match = storedInboundMessage.match(STORED_SUBJECT_PREFIX)
  if (match === null) {
    return "Re: Your message"
  }

  const capturedSubject = match[1]
  if (capturedSubject === undefined) {
    return "Re: Your message"
  }
  const subject = capturedSubject.trim()
  if (subject === "") {
    return "Re: Your message"
  }
  if (/^re:\s/i.test(subject)) {
    return subject
  }
  return `Re: ${subject}`
}

async function digestExternalId(raw: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", raw))
  const hex = Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
  return `email:sha256:${hex}`
}

/** Parse a Cloudflare email event into Book's channel-neutral input. */
export async function inboundEmailMessage(
  message: InboundEmailEventMessage,
): Promise<FromMessage> {
  const raw = await new Response(message.raw).arrayBuffer()
  const email = await PostalMime.parse(raw)
  const messageId =
    email.messageId?.trim() || message.headers.get("message-id")?.trim()

  return FromMessageInputSchema.parse({
    channel: "email",
    address: senderAddress(email, message.from),
    message: normalizedBody(email),
    externalId:
      messageId === undefined || messageId === ""
        ? await digestExternalId(raw)
        : `email:${messageId}`,
  })
}

export function createInboundEmailHandler(
  ingest: IngestCustomerMessage = ingestCustomerMessage,
) {
  return async (
    message: InboundEmailEventMessage,
    env: WorkerEnv,
  ): Promise<void> => {
    let input: FromMessage
    try {
      input = await inboundEmailMessage(message)
    } catch (cause) {
      console.warn("Inbound email rejected", {
        from: message.from,
        to: message.to,
        error: cause instanceof Error ? cause.message : String(cause),
      })
      message.setReject("Email must contain a valid sender and readable body")
      return
    }

    if (input.address === env.BOOK_EMAIL_ADDRESS) {
      console.warn("Inbound email from Book's own address ignored", {
        from: message.from,
        to: message.to,
        externalId: input.externalId,
      })
      return
    }

    await ingest(env, input)
  }
}

export const handleInboundEmail = createInboundEmailHandler()
