import { env } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import { createInboundMessage } from "@worker/tests/fixtures/messages"
import {
  approveResponseDraft,
  upsertResponseDraft,
} from "@worker/src/db/response-drafts"
import { loadConversation } from "@worker/src/message-pipeline/conversation"

describe("loadConversation", () => {
  const db = env.DB

  test("includes only approved prior replies and keeps the target last", async () => {
    const address = "conversation@example.com"
    const { message: first } = await createInboundMessage(db, {
      message: "First inbound",
      channel: "email",
      address,
    })
    const response = await upsertResponseDraft(
      db,
      first,
      { messageId: first.id, body: "First reply" },
      null,
    )
    await approveResponseDraft(db, response!.id, response!.revision)
    const { message: pending } = await createInboundMessage(db, {
      message: "Inbound with draft",
      channel: "email",
      address,
    })
    await upsertResponseDraft(
      db,
      pending,
      { messageId: pending.id, body: "Human-edited pending reply" },
      null,
    )
    const { message: target } = await createInboundMessage(db, {
      message: "Target inbound",
      channel: "email",
      address,
    })
    await createInboundMessage(db, {
      message: "Future inbound",
      channel: "email",
      address,
    })

    await expect(loadConversation(db, target)).resolves.toEqual([
      {
        role: "customer",
        body: "First inbound",
        createdAt: first.createdAt,
      },
      {
        role: "business",
        body: "First reply",
        createdAt: expect.any(Number),
      },
      {
        role: "customer",
        body: "Inbound with draft",
        createdAt: pending.createdAt,
      },
      {
        role: "customer",
        body: "Target inbound",
        createdAt: target.createdAt,
      },
    ])
  })

  test("loads a single-turn SMS conversation by conversation id", async () => {
    const { message: target } = await createInboundMessage(db, {
      message: "SMS booking request",
      channel: "sms",
      address: "+15551234567",
    })

    await expect(loadConversation(db, target)).resolves.toEqual([
      {
        role: "customer",
        body: target.message,
        createdAt: target.createdAt,
      },
    ])
  })
})
