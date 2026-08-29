import type { D1Database } from "@cloudflare/workers-types"
import {
  type Message,
  type MessageInsertInput,
  MessageInsertSchema,
  MessageRowSchema,
  messageFromRow,
} from "../types/message"

function parseMessageRow(row: unknown): Message {
  return messageFromRow(MessageRowSchema.parse(row))
}

async function getMessageByExternalId(
  db: D1Database,
  externalId: string,
): Promise<Message | null> {
  const result = await db
    .prepare(`SELECT * FROM messages WHERE external_id = ?`)
    .bind(externalId)
    .first()
  if (result === null) {
    return null
  }
  return parseMessageRow(result)
}

/**
 * Inserts an inbound message row.
 * When `externalId` is set, returns the existing row for that id
 * instead of inserting a duplicate.
 */
export async function createMessage(
  db: D1Database,
  input: MessageInsertInput,
): Promise<{ message: Message; created: boolean }> {
  const parsed = MessageInsertSchema.parse(input)
  const inserted = await db
    .prepare(
      `INSERT INTO messages (
         message, external_id, conversation_id
       ) VALUES (?, ?, ?)
       ON CONFLICT(external_id) DO NOTHING
       RETURNING *`,
    )
    .bind(parsed.message, parsed.externalId, parsed.conversationId)
    .first()

  if (inserted !== null) {
    const message = parseMessageRow(inserted)
    return { message, created: true }
  }

  if (parsed.externalId === null) {
    throw new Error("Failed to create message")
  }

  const existing = await getMessageByExternalId(db, parsed.externalId)
  if (existing === null) {
    throw new Error("Failed to create message")
  }
  return { message: existing, created: false }
}

export async function getMessageById(
  db: D1Database,
  messageId: number,
): Promise<Message | null> {
  const result = await db
    .prepare(`SELECT * FROM messages WHERE id = ?`)
    .bind(messageId)
    .first()
  if (result === null) {
    return null
  }
  return parseMessageRow(result)
}

export async function getMessages(db: D1Database): Promise<Message[]> {
  const result = await db
    .prepare(
      `SELECT * FROM messages
       ORDER BY created_at DESC, id DESC`,
    )
    .all()
  return result.results.map(parseMessageRow)
}

export async function getMessagesByConversationId(
  db: D1Database,
  conversationId: number,
): Promise<Message[]> {
  const result = await db
    .prepare(
      `SELECT * FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC, id ASC`,
    )
    .bind(conversationId)
    .all()
  return result.results.map(parseMessageRow)
}

export async function getConversationMessagesFromMessage(
  db: D1Database,
  target: Pick<Message, "id" | "conversationId" | "createdAt">,
): Promise<Message[]> {
  const result = await db
    .prepare(
      `SELECT * FROM messages
       WHERE conversation_id = ?
         AND (
           created_at < ?
           OR (created_at = ? AND id <= ?)
         )
       ORDER BY created_at ASC, id ASC`,
    )
    .bind(target.conversationId, target.createdAt, target.createdAt, target.id)
    .all()
  return result.results.map(parseMessageRow)
}
