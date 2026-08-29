import { z } from "zod"
import type { D1Database } from "@cloudflare/workers-types"
import type { MessageWorkflowParams, WorkerEnv } from "@infra/alchemy.run"
import type { WorkflowRecord } from "../types/workflow"
import { startWorkflow } from "../workflows/start"

export const MessageWorkflowParamsSchema = z
  .object({
    messageId: z.number().int().positive(),
    languageModelId: z.string().min(1),
    now: z.string().optional(),
  })
  .strict() satisfies z.ZodType<MessageWorkflowParams>

export function inboundMessageWorkflowRecord(
  messageId: number,
): WorkflowRecord {
  return { recordName: "message", recordId: messageId }
}

/** Unique per start so D1 resets do not collide with retained Cloudflare instances. */
export function messageWorkflowInstanceId(messageId: number): string {
  return `message-${messageId}-${crypto.randomUUID()}`
}

export async function startMessageWorkflow(
  db: D1Database,
  workflow: WorkerEnv["MESSAGE_WORKFLOW"],
  params: MessageWorkflowParams,
): Promise<{ id: string; created: boolean }> {
  return startWorkflow(db, workflow, {
    record: inboundMessageWorkflowRecord(params.messageId),
    instanceId: messageWorkflowInstanceId(params.messageId),
    params,
  })
}
