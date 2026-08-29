import type { FirstPassResult } from "../types/llm-task-results"
import type { ActionOutcome } from "./action-dispatcher"
import type { PipelineContext } from "./context"

export type MessagePipelineState = {
  businessTimezone: string
  conversationId: number
  firstPass: FirstPassResult
  actionOutcome: ActionOutcome
  proposedDatetime: Date | null
}

export function buildMessagePipelineState(
  ctx: PipelineContext,
  firstPass: FirstPassResult,
  actionOutcome: ActionOutcome,
): MessagePipelineState {
  return {
    businessTimezone: ctx.timezone,
    conversationId: ctx.conversationId,
    firstPass,
    actionOutcome,
    proposedDatetime: actionOutcome.proposedDatetime,
  }
}
