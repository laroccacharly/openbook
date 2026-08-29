import { describe, expect, test, vi } from "vitest"
import type { WorkerEnv } from "@infra/alchemy.run"
import {
  createInboundEmailHandler,
  emailHtmlToText,
  inboundEmailMessage,
} from "@worker/src/channels/email/inbound"

const EMAIL_ADDRESS = "agent@example.com"
const emailEnvironment = { BOOK_EMAIL_ADDRESS: EMAIL_ADDRESS } as WorkerEnv

function emailMessage(
  raw: string,
  options: { from?: string; to?: string } = {},
) {
  const setReject = vi.fn()
  const message = {
    from: options.from ?? "envelope@example.com",
    to: options.to ?? EMAIL_ADDRESS,
    headers: new Headers(),
    raw: new Response(raw).body!,
    rawSize: new TextEncoder().encode(raw).byteLength,
    canBeForwarded: true,
    setReject,
    forward: vi.fn(),
    reply: vi.fn(),
  } as unknown as ForwardableEmailMessage
  return { message, setReject }
}

describe("inbound email", () => {
  test("parses multipart mail and uses Reply-To as the conversation address", async () => {
    const { message } = emailMessage(`From: Sender <sender@example.com>
Reply-To: Customer <CUSTOMER@example.com>
To: agent@example.com
Subject: Kitchen sink
Message-ID: <message-123@example.com>
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary=book-boundary

--book-boundary
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: quoted-printable

My sink is leaking=2E
--book-boundary
Content-Type: text/html; charset=utf-8

<p>My sink is leaking.</p>
--book-boundary--`)

    await expect(inboundEmailMessage(message)).resolves.toEqual({
      channel: "email",
      address: "customer@example.com",
      message: "Subject: Kitchen sink\n\nMy sink is leaking.",
      externalId: "email:<message-123@example.com>",
    })
  })

  test("converts HTML-only mail to readable text", async () => {
    const { message } = emailMessage(`From: customer@example.com
To: agent@example.com
Content-Type: text/html; charset=utf-8
Message-ID: <html@example.com>

<style>p { color: red }</style><p>Hello&nbsp;<strong>Book</strong></p><div>Next line &amp; more</div>`)

    await expect(inboundEmailMessage(message)).resolves.toMatchObject({
      address: "customer@example.com",
      message: "Hello Book\nNext line & more",
    })
    expect(emailHtmlToText("<script>bad()</script><p>A&#x20;B</p>")).toBe("A B")
  })

  test("uses a deterministic content digest when Message-ID is absent", async () => {
    const raw = `From: customer@example.com
To: agent@example.com
Content-Type: text/plain

Please call me`
    const first = await inboundEmailMessage(emailMessage(raw).message)
    const retry = await inboundEmailMessage(emailMessage(raw).message)

    expect(first.externalId).toMatch(/^email:sha256:[0-9a-f]{64}$/)
    expect(retry.externalId).toBe(first.externalId)
  })

  test("ingests normalized messages and lets transient failures retry", async () => {
    const ingest = vi.fn().mockResolvedValue({ id: 1, created: true })
    const handler = createInboundEmailHandler(ingest)
    const { message, setReject } = emailMessage(`From: customer@example.com
To: agent@example.com
Content-Type: text/plain
Message-ID: <ingest@example.com>

I need an appointment`)
    const env = emailEnvironment

    await handler(message, env)
    expect(ingest).toHaveBeenCalledWith(env, {
      channel: "email",
      address: "customer@example.com",
      message: "I need an appointment",
      externalId: "email:<ingest@example.com>",
    })
    expect(setReject).not.toHaveBeenCalled()

    ingest.mockRejectedValueOnce(new Error("D1 unavailable"))
    await expect(
      handler(
        emailMessage(`From: customer@example.com
Content-Type: text/plain

Retry me`).message,
        env,
      ),
    ).rejects.toThrow("D1 unavailable")
  })

  test("ignores forwarded copies of Book's own outbound email", async () => {
    const ingest = vi.fn()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const handler = createInboundEmailHandler(ingest)
    const { message, setReject } = emailMessage(`From: agent@example.com
To: customer@example.com
Subject: Re: Hello
Message-ID: <outbound@example.com>
Content-Type: text/plain

This is Book's outbound response.`)

    await handler(message, emailEnvironment)

    expect(ingest).not.toHaveBeenCalled()
    expect(setReject).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      "Inbound email from Book's own address ignored",
      {
        from: "envelope@example.com",
        to: EMAIL_ADDRESS,
        externalId: "email:<outbound@example.com>",
      },
    )
  })

  test("rejects mail without a valid sender or readable body", async () => {
    const ingest = vi.fn()
    const handler = createInboundEmailHandler(ingest)
    const { message, setReject } = emailMessage(`From: not-an-email
Content-Type: application/octet-stream

binary`)

    await handler(message, emailEnvironment)

    expect(setReject).toHaveBeenCalledWith(
      "Email must contain a valid sender and readable body",
    )
    expect(ingest).not.toHaveBeenCalled()
  })
})
