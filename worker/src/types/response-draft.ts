import { z } from "zod"

export const ResponseDraftRowSchema = z.object({
  id: z.number().int(),
  message_id: z.number().int(),
  conversation_id: z.number().int(),
  body: z.string(),
  proposed_datetime: z.number().int().nullable(),
  pipeline_state: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
})

export type ResponseDraftRow = z.infer<typeof ResponseDraftRowSchema>

export const ResponseDraftCreateSchema = z.object({
  messageId: z.number().int(),
  body: z.string().min(1),
  proposedDatetime: z.date().nullable().default(null),
  pipelineState: z.string().nullable().default(null),
})

export type ResponseDraftCreateInput = z.input<typeof ResponseDraftCreateSchema>

export const UpdateResponseDraftSchema = z.object({
  body: z.string().min(1),
  revision: z.number().int().nonnegative(),
})

export const ApproveResponseDraftSchema = UpdateResponseDraftSchema.pick({
  revision: true,
})

export const ResponseDraftSchema = ResponseDraftCreateSchema.extend({
  id: z.number().int(),
  conversationId: z.number().int(),
  revision: z.number().int().nonnegative(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})

export type ResponseDraft = z.infer<typeof ResponseDraftSchema>

export function responseDraftFromRow(row: ResponseDraftRow): ResponseDraft {
  return ResponseDraftSchema.parse({
    id: row.id,
    messageId: row.message_id,
    conversationId: row.conversation_id,
    body: row.body,
    proposedDatetime:
      row.proposed_datetime === null
        ? null
        : new Date(row.proposed_datetime * 1000),
    pipelineState: row.pipeline_state,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}
