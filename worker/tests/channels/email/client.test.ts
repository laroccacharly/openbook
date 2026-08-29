import { describe, expect, test, vi } from "vitest"
import type { WorkerEnv } from "@infra/alchemy.run"
import { sendEmail } from "@worker/src/channels/email/outbound"

const EMAIL_ADDRESS = "agent@example.com"
const emailEnvironment = (send: ReturnType<typeof vi.fn>) => ({
  BOOK_EMAIL_ADDRESS: EMAIL_ADDRESS,
  EMAIL: { send } as unknown as WorkerEnv["EMAIL"],
})

const input = {
  to: "customer@example.com",
  subject: "Your booking",
  text: "Your booking is confirmed.",
  html: "<p>Your booking is confirmed.</p>",
}

describe("email channel", () => {
  test("sends through the configured Cloudflare binding", async () => {
    const send = vi.fn().mockResolvedValue({ messageId: "message-123" })

    await expect(sendEmail(emailEnvironment(send), input)).resolves.toEqual({
      ok: true,
      messageId: "message-123",
      to: input.to,
      from: EMAIL_ADDRESS,
      subject: input.subject,
    })
    expect(send).toHaveBeenCalledWith({
      to: input.to,
      from: EMAIL_ADDRESS,
      subject: input.subject,
      text: input.text,
      html: input.html,
    })
  })

  test("normalizes provider failures", async () => {
    const send = vi.fn().mockRejectedValue(new Error("provider unavailable"))

    await expect(sendEmail(emailEnvironment(send), input)).resolves.toEqual({
      ok: false,
      status: 502,
      error: "provider unavailable",
    })
  })

  test("validates input before calling the provider", async () => {
    const send = vi.fn()

    expect(() =>
      sendEmail(emailEnvironment(send), { ...input, to: "not-an-email" }),
    ).toThrow()
    expect(send).not.toHaveBeenCalled()
  })
})
