import { env } from "cloudflare:workers"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { WorkerEnv } from "@infra/alchemy.run"
import { getMessageDeliveryReceipt } from "@worker/src/db/message-delivery-receipts"
import { getWorkflow, createWorkflow } from "@worker/src/db/workflows"
import {
  approveResponseDraft,
  upsertResponseDraft,
} from "@worker/src/db/response-drafts"
import { deliverMessage } from "@worker/src/message-delivery/deliver"
import { createInboundMessage } from "@worker/tests/fixtures/messages"

afterEach(() => vi.unstubAllGlobals())

describe("message delivery", () => {
  test("sends approved email drafts through the Cloudflare binding", async () => {
    const { message } = await createInboundMessage(env.DB, {
      message: "Subject: Kitchen sink\n\nMy sink is leaking.",
      channel: "email",
      address: "customer@example.com",
    })
    const draft = await upsertResponseDraft(
      env.DB,
      message,
      { messageId: message.id, body: "We can come tomorrow." },
      null,
    )
    const response = (await approveResponseDraft(
      env.DB,
      draft!.id,
      draft!.revision,
    ))!
    const record = {
      recordName: "message_response",
      recordId: response.id,
    }
    await createWorkflow(env.DB, {
      ...record,
      workflowInstanceId: "delivery-email-test",
    })
    const send = vi.fn().mockResolvedValue({ messageId: "email-123" })
    const deliveryEnv = {
      ...env,
      EMAIL: { send } as unknown as WorkerEnv["EMAIL"],
    }

    await expect(deliverMessage(deliveryEnv, response.id)).resolves.toEqual({
      messageResponseId: response.id,
      providerMessageId: "email-123",
    })
    expect(send).toHaveBeenCalledWith({
      to: "customer@example.com",
      from: env.BOOK_EMAIL_ADDRESS,
      subject: "Re: Kitchen sink",
      text: "We can come tomorrow.",
    })
    await expect(getWorkflow(env.DB, record)).resolves.toMatchObject({
      status: "completed",
      stage: "completed",
      attempt: 1,
    })
    await expect(
      getMessageDeliveryReceipt(env.DB, response.id),
    ).resolves.toMatchObject({
      messageResponseId: response.id,
      provider: "cloudflare",
      providerMessageId: "email-123",
      providerStatus: "sent",
    })
  })

  test("stores the provider receipt separately from workflow tracking", async () => {
    const { message } = await createInboundMessage(env.DB, {
      message: "Can you help?",
      channel: "sms",
      address: "+15145550101",
    })
    const draft = await upsertResponseDraft(
      env.DB,
      message,
      { messageId: message.id, body: "Yes." },
      null,
    )
    const response = (await approveResponseDraft(
      env.DB,
      draft!.id,
      draft!.revision,
    ))!
    const record = {
      recordName: "message_response",
      recordId: response.id,
    }
    await createWorkflow(env.DB, {
      ...record,
      workflowInstanceId: "delivery-test",
    })
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            sid: "SM123",
            status: "queued",
            to: "+15145550101",
            from: env.TWILIO_PHONE_NUMBER,
          },
          { status: 201 },
        ),
      ),
    )

    await expect(deliverMessage(env, response.id)).resolves.toEqual({
      messageResponseId: response.id,
      providerMessageId: "SM123",
    })
    await expect(getWorkflow(env.DB, record)).resolves.toMatchObject({
      status: "completed",
      stage: "completed",
      attempt: 1,
    })
    await expect(
      getMessageDeliveryReceipt(env.DB, response.id),
    ).resolves.toMatchObject({
      messageResponseId: response.id,
      provider: "twilio",
      providerMessageId: "SM123",
      providerStatus: "queued",
    })
  })
})
