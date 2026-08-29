import { z } from "zod"

export const MessageDeliveryReceiptRowSchema = z.object({
  id: z.number().int(),
  message_response_id: z.number().int().positive(),
  provider: z.string().min(1),
  provider_message_id: z.string().min(1),
  provider_status: z.string().min(1),
  created_at: z.number().int(),
  updated_at: z.number().int(),
})

export type MessageDeliveryReceiptRow = z.infer<
  typeof MessageDeliveryReceiptRowSchema
>

export const MessageDeliveryReceiptSchema = z.object({
  id: z.number().int(),
  messageResponseId: z.number().int().positive(),
  provider: z.string().min(1),
  providerMessageId: z.string().min(1),
  providerStatus: z.string().min(1),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})

export type MessageDeliveryReceipt = z.infer<
  typeof MessageDeliveryReceiptSchema
>

export function messageDeliveryReceiptFromRow(
  row: MessageDeliveryReceiptRow,
): MessageDeliveryReceipt {
  return MessageDeliveryReceiptSchema.parse({
    id: row.id,
    messageResponseId: row.message_response_id,
    provider: row.provider,
    providerMessageId: row.provider_message_id,
    providerStatus: row.provider_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}
