import { dispatchAction } from "./action-dispatcher"
import { composeAndPersistResponse } from "./compose-response"
import type { PipelineContext } from "./context"
import { runFirstPassStep } from "./first-pass"
import { buildMessagePipelineState } from "./state"

export type {
  CreatePipelineContextInput,
  PipelineContext,
  SetMessageWorkflowStage,
} from "./context"
export { createPipelineContext } from "./context"

export async function processInboundMessage(
  ctx: PipelineContext,
): Promise<void> {
  await ctx.setStage("first_pass")
  const firstPass = await runFirstPassStep(ctx)
  const actionOutcome = await dispatchAction(ctx, firstPass.booking_action)
  const state = buildMessagePipelineState(ctx, firstPass, actionOutcome)
  await composeAndPersistResponse(ctx, state)
}
