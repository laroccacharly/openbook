import type { D1Database } from "@cloudflare/workers-types"
import type { Message } from "../types/message"
import type { MessageResponse } from "../types/message-response"
import {
  type ResponseDraft,
  type ResponseDraftCreateInput,
  ResponseDraftCreateSchema,
  ResponseDraftRowSchema,
  responseDraftFromRow,
} from "../types/response-draft"
import {
  MessageResponseRowSchema,
  messageResponseFromRow,
} from "../types/message-response"

function parseResponseDraftRow(row: unknown): ResponseDraft {
  return responseDraftFromRow(ResponseDraftRowSchema.parse(row))
}

function parseMessageResponseRow(row: unknown): MessageResponse {
  return messageResponseFromRow(MessageResponseRowSchema.parse(row))
}

function proposedDatetimeSeconds(value: Date | null): number | null {
  return value === null ? null : Math.floor(value.getTime() / 1000)
}

export async function getResponseDraftById(
  db: D1Database,
  draftId: number,
): Promise<ResponseDraft | null> {
  const result = await db
    .prepare(`SELECT * FROM response_drafts WHERE id = ?`)
    .bind(draftId)
    .first()
  return result === null ? null : parseResponseDraftRow(result)
}

export async function getResponseDraftByMessageId(
  db: D1Database,
  messageId: number,
): Promise<ResponseDraft | null> {
  const result = await db
    .prepare(`SELECT * FROM response_drafts WHERE message_id = ?`)
    .bind(messageId)
    .first()
  return result === null ? null : parseResponseDraftRow(result)
}

export async function getResponseDraftForConversation(
  db: D1Database,
  conversationId: number,
): Promise<ResponseDraft | null> {
  const result = await db
    .prepare(`SELECT * FROM response_drafts WHERE conversation_id = ?`)
    .bind(conversationId)
    .first()
  return result === null ? null : parseResponseDraftRow(result)
}

export async function upsertResponseDraft(
  db: D1Database,
  target: Message,
  input: ResponseDraftCreateInput,
  expectedRevision: number | null,
): Promise<ResponseDraft | null> {
  const draft = ResponseDraftCreateSchema.parse(input)
  if (draft.messageId !== target.id) {
    throw new Error("Draft message id does not match target message")
  }

  const result = await db
    .prepare(
      `INSERT INTO response_drafts (
         message_id, conversation_id, body, proposed_datetime, pipeline_state
       )
       SELECT target.id, target.conversation_id, ?, ?, ?
       FROM messages target
       JOIN conversations conversation
         ON conversation.id = target.conversation_id
       WHERE target.id = ?
         AND conversation.latest_message_id = target.id
       ON CONFLICT(conversation_id)
       DO UPDATE SET
         message_id = excluded.message_id,
         body = excluded.body,
         proposed_datetime = excluded.proposed_datetime,
         pipeline_state = excluded.pipeline_state,
         revision = response_drafts.revision + 1,
         updated_at = unixepoch()
       WHERE response_drafts.revision = ?
       RETURNING *`,
    )
    .bind(
      draft.body,
      proposedDatetimeSeconds(draft.proposedDatetime),
      draft.pipelineState,
      target.id,
      expectedRevision ?? -1,
    )
    .first()
  return result === null ? null : parseResponseDraftRow(result)
}

export async function persistResponseDraft(
  db: D1Database,
  params: {
    target: Message
    input: ResponseDraftCreateInput
    expectedRevision: number | null
    autoApprove: boolean
    approve?: (
      draftId: number,
      expectedRevision: number,
    ) => Promise<MessageResponse | null>
  },
): Promise<void> {
  const approve =
    params.approve ??
    ((draftId, revision) => approveResponseDraft(db, draftId, revision))
  const draft = await upsertResponseDraft(
    db,
    params.target,
    params.input,
    params.expectedRevision,
  )
  if (params.autoApprove && draft !== null) {
    await approve(draft.id, draft.revision)
  }
}

export async function updateResponseDraftBody(
  db: D1Database,
  draftId: number,
  body: string,
  expectedRevision: number,
): Promise<ResponseDraft | null> {
  const result = await db
    .prepare(
      `UPDATE response_drafts
       SET body = ?, revision = revision + 1, updated_at = unixepoch()
       WHERE id = ?
         AND revision = ?
         AND message_id = (
           SELECT latest_message_id
           FROM conversations
           WHERE id = conversation_id
         )
       RETURNING *`,
    )
    .bind(body, draftId, expectedRevision)
    .first()
  return result === null ? null : parseResponseDraftRow(result)
}

export async function approveResponseDraft(
  db: D1Database,
  draftId: number,
  expectedRevision: number,
): Promise<MessageResponse | null> {
  // The insert trigger deletes the selected draft in the same transaction.
  const result = await db
    .prepare(
      `INSERT INTO message_responses (
         source_draft_id, message_id, body, proposed_datetime, pipeline_state
       )
       SELECT draft.id, draft.message_id, draft.body,
              draft.proposed_datetime, draft.pipeline_state
       FROM response_drafts draft
       JOIN conversations conversation
         ON conversation.id = draft.conversation_id
       WHERE draft.id = ?
         AND draft.revision = ?
         AND conversation.latest_message_id = draft.message_id
       RETURNING *`,
    )
    .bind(draftId, expectedRevision)
    .first()
  return result === null ? null : parseMessageResponseRow(result)
}
