import type { D1Database } from "@cloudflare/workers-types"
import {
  type MessageResponse,
  MessageResponseRowSchema,
  messageResponseFromRow,
} from "../types/message-response"

function parseMessageResponseRow(row: unknown): MessageResponse {
  return messageResponseFromRow(MessageResponseRowSchema.parse(row))
}

export async function getMessageResponseByMessageId(
  db: D1Database,
  messageId: number,
): Promise<MessageResponse | null> {
  const result = await db
    .prepare(`SELECT * FROM message_responses WHERE message_id = ?`)
    .bind(messageId)
    .first()
  return result === null ? null : parseMessageResponseRow(result)
}

export async function getMessageResponses(
  db: D1Database,
): Promise<MessageResponse[]> {
  const result = await db
    .prepare(
      `SELECT * FROM message_responses
       ORDER BY created_at DESC, id DESC`,
    )
    .all()
  return result.results.map(parseMessageResponseRow)
}

export async function listMessageResponsesByMessageIds(
  db: D1Database,
  messageIds: number[],
): Promise<MessageResponse[]> {
  if (messageIds.length === 0) {
    return []
  }
  const placeholders = messageIds.map(() => "?").join(", ")
  const result = await db
    .prepare(
      `SELECT * FROM message_responses
       WHERE message_id IN (${placeholders})`,
    )
    .bind(...messageIds)
    .all()
  return result.results.map(parseMessageResponseRow)
}
