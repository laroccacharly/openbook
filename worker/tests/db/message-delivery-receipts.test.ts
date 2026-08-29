import { env } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import {
  getMessageDeliveryReceipt,
  recordMessageDeliveryReceipt,
} from "@worker/src/db/message-delivery-receipts"
import { getMessageDelivery } from "@worker/src/db/message-deliveries"
import {
  approveResponseDraft,
  upsertResponseDraft,
} from "@worker/src/db/response-drafts"
import { createInboundMessage } from "@worker/tests/fixtures/messages"

async function createResponse(channel: "sms" | "email" = "sms") {
  const { message } = await createInboundMessage(env.DB, {
    message: "Inbound",
    channel,
    address: channel === "sms" ? "+15145550102" : "delivery@example.com",
  })
  const draft = await upsertResponseDraft(
    env.DB,
    message,
    { messageId: message.id, body: "Outbound response" },
    null,
  )
  return (await approveResponseDraft(env.DB, draft!.id, draft!.revision))!
}

describe("message delivery receipts", () => {
  test("records and updates a provider receipt", async () => {
    const response = await createResponse()
    const receipt = await recordMessageDeliveryReceipt(env.DB, {
      messageResponseId: response.id,
      provider: "twilio",
      providerMessageId: "SM123",
      providerStatus: "queued",
    })
    expect(receipt).toMatchObject({
      messageResponseId: response.id,
      provider: "twilio",
      providerMessageId: "SM123",
      providerStatus: "queued",
    })

    const updated = await recordMessageDeliveryReceipt(env.DB, {
      messageResponseId: response.id,
      provider: "twilio",
      providerMessageId: "SM123",
      providerStatus: "sent",
    })
    expect(updated).toMatchObject({ providerStatus: "sent" })
    await expect(
      getMessageDeliveryReceipt(env.DB, response.id),
    ).resolves.toEqual(updated)
    await expect(getMessageDeliveryReceipt(env.DB, 999_999)).resolves.toBeNull()
  })

  test("loads the approved body and contact method", async () => {
    const sms = await createResponse()
    await expect(getMessageDelivery(env.DB, sms.id)).resolves.toEqual({
      body: "Outbound response",
      inboundMessage: "Inbound",
      contactMethod: { channel: "sms", address: "+15145550102" },
    })

    const email = await createResponse("email")
    await expect(getMessageDelivery(env.DB, email.id)).resolves.toEqual({
      body: "Outbound response",
      inboundMessage: "Inbound",
      contactMethod: { channel: "email", address: "delivery@example.com" },
    })
    await expect(getMessageDelivery(env.DB, 999_999)).resolves.toBeNull()
  })
})
