import { z } from "zod"

export const MessageResponseRowSchema = z.object({
  id: z.number().int(),
  source_draft_id: z.number().int(),
  message_id: z.number().int(),
  body: z.string(),
  proposed_datetime: z.number().int().nullable(),
  pipeline_state: z.string().nullable(),
  created_at: z.number().int(),
})

export type MessageResponseRow = z.infer<typeof MessageResponseRowSchema>

export const MessageResponseCreateSchema = z.object({
  messageId: z.number().int(),
  body: z.string().min(1),
  proposedDatetime: z.date().nullable().default(null),
  pipelineState: z.string().nullable().default(null),
})

export type MessageResponseCreateInput = z.input<
  typeof MessageResponseCreateSchema
>
export type MessageResponseCreate = z.infer<typeof MessageResponseCreateSchema>

export const MessageResponseSchema = MessageResponseCreateSchema.extend({
  id: z.number().int(),
  createdAt: z.number().int(),
})

export type MessageResponse = z.infer<typeof MessageResponseSchema>

export function messageResponseFromRow(
  row: MessageResponseRow,
): MessageResponse {
  return MessageResponseSchema.parse({
    id: row.id,
    messageId: row.message_id,
    body: row.body,
    proposedDatetime:
      row.proposed_datetime === null
        ? null
        : new Date(row.proposed_datetime * 1000),
    pipelineState: row.pipeline_state,
    createdAt: row.created_at,
  })
}
