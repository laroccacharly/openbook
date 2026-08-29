import type { D1Database } from "@cloudflare/workers-types"
import {
  type ContactMethodChannel,
  type ContactMethodKey,
} from "../types/contact-method"
import type { ConversationTimelineTurn } from "../types/conversation"
import { listMessageResponsesByMessageIds } from "./message-responses"
import { getMessagesByConversationId } from "./messages"
import { getResponseDraftForConversation } from "./response-drafts"

export async function getOrCreateConversation(
  db: D1Database,
  contactMethodId: number,
): Promise<{ id: number }> {
  const conversation = await db
    .prepare(
      `INSERT INTO conversations (contact_method_id)
       VALUES (?)
       ON CONFLICT(contact_method_id) DO UPDATE SET
         updated_at = conversations.updated_at
       RETURNING id`,
    )
    .bind(contactMethodId)
    .first<{ id: number }>()
  if (conversation === null) {
    throw new Error("Failed to resolve conversation")
  }
  return conversation
}

export async function getContactMethodKey(
  db: D1Database,
  conversationId: number,
): Promise<ContactMethodKey> {
  const row = await db
    .prepare(
      `SELECT contact.channel AS channel, contact.address AS address
       FROM conversations conversation
       JOIN customer_contact_methods contact
         ON contact.id = conversation.contact_method_id
       WHERE conversation.id = ?`,
    )
    .bind(conversationId)
    .first<{ channel: ContactMethodChannel; address: string }>()
  if (row === null) {
    throw new Error(`Conversation ${conversationId} not found`)
  }
  switch (row.channel) {
    case "email":
      return { channel: "email", address: row.address }
    case "sms":
      return { channel: "sms", address: row.address }
    default: {
      const exhaustive: never = row.channel
      throw new Error(`Unhandled channel: ${String(exhaustive)}`)
    }
  }
}

export async function loadConversation(
  db: D1Database,
  conversationId: number,
): Promise<ConversationTimelineTurn[] | null> {
  const exists = await db
    .prepare(`SELECT id FROM conversations WHERE id = ?`)
    .bind(conversationId)
    .first<{ id: number }>()
  if (exists === null) {
    return null
  }

  const messages = await getMessagesByConversationId(db, conversationId)
  const latestMessage = messages.at(-1)
  const [responses, draft] = await Promise.all([
    listMessageResponsesByMessageIds(
      db,
      messages.map((message) => message.id),
    ),
    getResponseDraftForConversation(db, conversationId),
  ])
  const responseByMessageId = new Map(
    responses.map((response) => [response.messageId, response]),
  )
  const turns: ConversationTimelineTurn[] = []
  for (const message of messages) {
    turns.push({
      id: `inbound-${message.id}`,
      role: "inbound",
      text: message.message,
      messageId: message.id,
      createdAt: message.createdAt,
    })

    const response = responseByMessageId.get(message.id)
    if (response !== undefined) {
      turns.push({
        id: `outbound-${response.id}`,
        role: "outbound",
        kind: "response",
        text: response.body,
        messageId: response.messageId,
        createdAt: response.createdAt,
      })
    }

    if (
      draft !== null &&
      draft.messageId === message.id &&
      latestMessage?.id === message.id
    ) {
      turns.push({
        id: `draft-${draft.id}`,
        role: "outbound",
        kind: "draft",
        draftId: draft.id,
        text: draft.body,
        messageId: draft.messageId,
        revision: draft.revision,
        createdAt: draft.updatedAt,
      })
    }
  }

  return turns
}
