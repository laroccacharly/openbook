import type { D1Database } from "@cloudflare/workers-types"
import {
  type MessageDeliveryReceipt,
  MessageDeliveryReceiptRowSchema,
  messageDeliveryReceiptFromRow,
} from "../types/message-delivery-receipt"

function parseReceipt(row: unknown): MessageDeliveryReceipt {
  return messageDeliveryReceiptFromRow(
    MessageDeliveryReceiptRowSchema.parse(row),
  )
}

export async function recordMessageDeliveryReceipt(
  db: D1Database,
  input: {
    messageResponseId: number
    provider: string
    providerMessageId: string
    providerStatus: string
  },
): Promise<MessageDeliveryReceipt> {
  const row = await db
    .prepare(
      `INSERT INTO message_delivery_receipts (
         message_response_id, provider, provider_message_id, provider_status
       ) VALUES (?, ?, ?, ?)
       ON CONFLICT(message_response_id) DO UPDATE SET
         provider = excluded.provider,
         provider_message_id = excluded.provider_message_id,
         provider_status = excluded.provider_status,
         updated_at = unixepoch()
       RETURNING *`,
    )
    .bind(
      input.messageResponseId,
      input.provider,
      input.providerMessageId,
      input.providerStatus,
    )
    .first()
  if (row === null) {
    throw new Error("Failed to record message delivery receipt")
  }
  return parseReceipt(row)
}

export async function getMessageDeliveryReceipt(
  db: D1Database,
  messageResponseId: number,
): Promise<MessageDeliveryReceipt | null> {
  const row = await db
    .prepare(
      `SELECT * FROM message_delivery_receipts WHERE message_response_id = ?`,
    )
    .bind(messageResponseId)
    .first()
  return row === null ? null : parseReceipt(row)
}
