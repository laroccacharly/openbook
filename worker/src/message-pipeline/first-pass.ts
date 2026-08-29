import {
  buildFirstPassSystemPrompt,
  runFirstPass,
} from "../llm-tasks/first-pass"
import type { FirstPassResult } from "../types/llm-task-results"
import type { PipelineContext } from "./context"
import { runPersistedTask } from "./persisted-task"

export async function runFirstPassStep(
  ctx: PipelineContext,
): Promise<FirstPassResult> {
  return runPersistedTask({
    db: ctx.db,
    messageId: ctx.messageId,
    taskType: "first_pass",
    languageModelId: ctx.languageModelId,
    systemPrompt: buildFirstPassSystemPrompt(ctx.masterSystemPrompt),
    run: async () => {
      const { result } = await runFirstPass(
        ctx.languageModel,
        ctx.conversation,
        ctx.masterSystemPrompt,
      )
      return result
    },
  })
}
