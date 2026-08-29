import { describe, expect, test, vi } from "vitest"
import type { WorkerEnv } from "@infra/alchemy.run"
import { emailChannelRouter } from "@worker/src/channels/email/api"

const EMAIL_ADDRESS = "agent@example.com"

const request = (body: unknown, send = vi.fn()) =>
  emailChannelRouter.request(
    "/email/send",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    {
      BOOK_EMAIL_ADDRESS: EMAIL_ADDRESS,
      EMAIL: { send } as unknown as WorkerEnv["EMAIL"],
    } as WorkerEnv,
  )

describe("email API", () => {
  test("returns the existing send contract", async () => {
    const send = vi.fn().mockResolvedValue({ messageId: "message-123" })
    const response = await request(
      {
        to: "customer@example.com",
        subject: "Hello",
        text: "Welcome",
      },
      send,
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      messageId: "message-123",
      to: "customer@example.com",
      from: EMAIL_ADDRESS,
      subject: "Hello",
    })
  })

  test("rejects invalid requests without sending", async () => {
    const send = vi.fn()
    const response = await request({ to: "invalid" }, send)

    expect(response.status).toBe(400)
    expect(send).not.toHaveBeenCalled()
  })

  test("returns provider failures", async () => {
    const send = vi.fn().mockRejectedValue(new Error("provider unavailable"))
    const response = await request(
      {
        to: "customer@example.com",
        subject: "Hello",
        text: "Welcome",
      },
      send,
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: "provider unavailable" })
  })
})
