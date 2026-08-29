import { persistResponseDraft } from "../db/response-drafts"
import { getBookingByMessageId } from "../db/bookings"
import {
  buildComposeResponseSystemPrompt,
  runComposeResponse,
} from "../llm-tasks/compose-response"
import type { PipelineContext } from "./context"
import { runPersistedTask } from "./persisted-task"
import type { MessagePipelineState } from "./state"
import { approveResponseDraftAndStartDelivery } from "../message-delivery/approve-response"
import { publicBookingShortUrl } from "../public-booking-links"

async function withPublicBookingLink(
  body: string,
  ctx: PipelineContext,
  state: MessagePipelineState,
): Promise<string> {
  const outcome = state.actionOutcome
  if (outcome.status !== "booked") {
    return body
  }
  const booking = await getBookingByMessageId(ctx.db, ctx.messageId)
  if (booking === null) {
    throw new Error(`Booked message ${ctx.messageId} has no booking`)
  }
  const publicOrigin = process.env.BOOK_PUBLIC_ORIGIN
  if (publicOrigin === undefined) {
    throw new Error("BOOK_PUBLIC_ORIGIN is required")
  }
  const url = publicBookingShortUrl(publicOrigin, booking.publicId)
  return `${body.trimEnd()}\n\nView your booking: ${url}`
}

export async function composeAndPersistResponse(
  ctx: PipelineContext,
  state: MessagePipelineState,
): Promise<void> {
  const systemPrompt = buildComposeResponseSystemPrompt(
    ctx.masterSystemPrompt,
    state,
    ctx.pendingDraft?.body,
  )

  await ctx.setStage("compose_response")
  const draft = await runPersistedTask({
    db: ctx.db,
    messageId: ctx.messageId,
    taskType: "compose_response",
    languageModelId: ctx.languageModelId,
    systemPrompt,
    run: async () =>
      runComposeResponse(ctx.languageModel, ctx.conversation, systemPrompt),
  })

  await ctx.setStage("persist_response")
  const body = await withPublicBookingLink(draft.body, ctx, state)
  await persistResponseDraft(ctx.db, {
    target: ctx.message,
    input: {
      messageId: ctx.messageId,
      body,
      proposedDatetime: state.proposedDatetime,
      pipelineState: JSON.stringify(state),
    },
    expectedRevision: ctx.pendingDraft?.revision ?? null,
    autoApprove: ctx.autoApproveDrafts,
    approve: (draftId, revision) =>
      approveResponseDraftAndStartDelivery(
        {
          DB: ctx.db,
          MESSAGE_DELIVERY_WORKFLOW: ctx.messageDeliveryWorkflow,
        },
        draftId,
        revision,
      ),
  })
}
