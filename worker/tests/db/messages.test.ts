import { env } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import {
  getMessageById,
  getMessages,
  getConversationMessagesFromMessage,
} from "@worker/src/db/messages"
import { createInboundMessage } from "../fixtures/messages"
import { testApiClient } from "../fixtures/api-client"

describe("messages CRUD", () => {
  const db = env.DB

  test("creates a message and reads it back by id", async () => {
    const { message: created, created: wasCreated } =
      await createInboundMessage(db, {
        message: "Need a plumber tomorrow morning",
        channel: "email",
        address: "customer@example.com",
      })

    expect(wasCreated).toBe(true)
    expect(created.id).toBeDefined()
    expect(created.createdAt).toBeDefined()
    expect(created.message).toBe("Need a plumber tomorrow morning")
    expect(created.conversationId).toBeDefined()
    expect(created.externalId).toBeNull()

    const fetched = await getMessageById(db, created.id)
    expect(fetched).toEqual(created)
  })

  test("requires an SMS address and returns null for missing ids", async () => {
    const { message: created } = await createInboundMessage(db, {
      message: "SMS booking request",
      channel: "sms",
      address: "+15551234567",
    })

    expect(created.conversationId).toBeDefined()
    expect(await getMessageById(db, created.id)).toEqual(created)
    expect(await getMessageById(db, 999_999)).toBeNull()
  })

  test("returns the existing row for the same externalId", async () => {
    const first = await createInboundMessage(db, {
      message: "Original body",
      channel: "email",
      address: "customer@example.com",
      externalId: "provider-msg-1",
    })
    const second = await createInboundMessage(db, {
      message: "Retry body ignored",
      channel: "sms",
      address: "+15557654321",
      externalId: "provider-msg-1",
    })

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.message).toEqual(first.message)
  })

  test("lists a conversation through a target message by conversation id", async () => {
    const { message: first } = await createInboundMessage(db, {
      message: "First",
      channel: "email",
      address: "thread@example.com",
    })
    const { message: target } = await createInboundMessage(db, {
      message: "Second",
      channel: "email",
      address: "thread@example.com",
    })
    await createInboundMessage(db, {
      message: "Future email",
      channel: "email",
      address: "thread@example.com",
    })
    await createInboundMessage(db, {
      message: "Same sender, different channel",
      channel: "sms",
      address: "+15551112222",
    })

    const listed = await getConversationMessagesFromMessage(db, target)
    expect(listed.map((message) => message.message)).toEqual([
      "First",
      "Second",
    ])
    expect(listed[0]).toEqual(first)
    expect(target.conversationId).toBe(first.conversationId)
  })

  test("uses id to bound same-second conversation messages", async () => {
    const { message: first } = await createInboundMessage(db, {
      message: "First",
      channel: "email",
      address: "same-second@example.com",
    })
    const { message: target } = await createInboundMessage(db, {
      message: "Target",
      channel: "email",
      address: "same-second@example.com",
    })
    const { message: later } = await createInboundMessage(db, {
      message: "Later",
      channel: "email",
      address: "same-second@example.com",
    })

    const createdAt = 1_800_000_000
    await db
      .prepare(`UPDATE messages SET created_at = ? WHERE id IN (?, ?, ?)`)
      .bind(createdAt, first.id, target.id, later.id)
      .run()

    expect(
      (
        await getConversationMessagesFromMessage(db, { ...target, createdAt })
      ).map((message) => message.message),
    ).toEqual(["First", "Target"])
  })

  test("lists all messages newest first", async () => {
    await createInboundMessage(db, {
      message: "Older",
      channel: "email",
      address: "older@example.com",
    })
    await createInboundMessage(db, {
      message: "Newer",
      channel: "sms",
      address: "+15559876543",
    })

    const messages = await getMessages(db)
    expect(messages.map((message) => message.message)).toEqual([
      "Newer",
      "Older",
    ])
  })

  test("lists messages through the API", async () => {
    const { message } = await createInboundMessage(db, {
      message: "Visible in the admin UI",
      channel: "email",
      address: "customer@example.com",
    })

    await expect(testApiClient.listMessages()).resolves.toContainEqual(message)
  })
})
