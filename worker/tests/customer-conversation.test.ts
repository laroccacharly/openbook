import { env } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import { createCustomer } from "@worker/tests/fixtures/customers"
import { createInboundMessage } from "@worker/tests/fixtures/messages"
import {
  approveResponseDraft,
  upsertResponseDraft,
} from "@worker/src/db/response-drafts"
import { testApiClient } from "./fixtures/api-client"

describe("customer conversation", () => {
  test("returns the authoritative ordered conversation including drafts", async () => {
    const customer = await createCustomer(env.DB, {
      email: "authoritative-conversation@example.com",
      name: "Authoritative Conversation",
    })
    if (customer.email === null) {
      throw new Error("Expected customer email")
    }
    const { message: first } = await createInboundMessage(env.DB, {
      message: "First inbound",
      channel: "email",
      address: customer.email,
    })
    const firstDraft = await upsertResponseDraft(
      env.DB,
      first,
      { messageId: first.id, body: "Approved response" },
      null,
    )
    const approved = await approveResponseDraft(
      env.DB,
      firstDraft!.id,
      firstDraft!.revision,
    )
    if (approved === null) {
      throw new Error("Expected draft approval to succeed")
    }

    const { message: second } = await createInboundMessage(env.DB, {
      message: "Second inbound",
      channel: "email",
      address: customer.email,
    })
    const draft = await upsertResponseDraft(
      env.DB,
      second,
      { messageId: second.id, body: "Pending response" },
      null,
    )
    if (draft === null) {
      throw new Error("Expected response draft to be created")
    }

    await expect(
      testApiClient.getConversation(first.conversationId),
    ).resolves.toEqual([
      {
        id: `inbound-${first.id}`,
        role: "inbound",
        text: first.message,
        messageId: first.id,
        createdAt: first.createdAt,
      },
      {
        id: `outbound-${approved.id}`,
        role: "outbound",
        kind: "response",
        text: approved.body,
        messageId: first.id,
        createdAt: approved.createdAt,
      },
      {
        id: `inbound-${second.id}`,
        role: "inbound",
        text: second.message,
        messageId: second.id,
        createdAt: second.createdAt,
      },
      {
        id: `draft-${draft.id}`,
        role: "outbound",
        kind: "draft",
        draftId: draft.id,
        text: draft.body,
        messageId: second.id,
        revision: draft.revision,
        createdAt: draft.updatedAt,
      },
    ])
  })

  test("keeps contact methods in separate conversations", async () => {
    const { message: email } = await createInboundMessage(env.DB, {
      message: "Email thread",
      channel: "email",
      address: "separate-thread@example.com",
    })
    const { message: sms } = await createInboundMessage(env.DB, {
      message: "SMS thread",
      channel: "sms",
      address: "+15550003333",
    })

    const contactMethods = await testApiClient.listContactMethods()
    expect(contactMethods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conversationId: email.conversationId,
          channel: "email",
          address: "separate-thread@example.com",
        }),
        expect.objectContaining({
          conversationId: sms.conversationId,
          channel: "sms",
          address: "+15550003333",
        }),
      ]),
    )
    await expect(
      testApiClient.getConversation(email.conversationId),
    ).resolves.toEqual([expect.objectContaining({ text: "Email thread" })])
    await expect(
      testApiClient.getConversation(sms.conversationId),
    ).resolves.toEqual([expect.objectContaining({ text: "SMS thread" })])
  })

  test("creates only a contact method until the first inbound message", async () => {
    const created = await testApiClient.createContactMethod({
      channel: "email",
      address: "lazy-contact@example.com",
    })
    expect(created).toEqual(
      expect.objectContaining({
        customerId: null,
        conversationId: null,
        channel: "email",
        address: "lazy-contact@example.com",
      }),
    )

    const { message } = await createInboundMessage(env.DB, {
      message: "First inbound creates the lifecycle",
      channel: "email",
      address: "lazy-contact@example.com",
    })
    const hydrated = (await testApiClient.listContactMethods()).find(
      (contactMethod) => contactMethod.id === created.id,
    )
    expect(hydrated).toEqual(
      expect.objectContaining({
        customerId: expect.any(Number),
        conversationId: message.conversationId,
      }),
    )
  })
})
