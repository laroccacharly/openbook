import { z } from "zod"
import type { D1Database } from "@cloudflare/workers-types"
import type {
  MessageDeliveryWorkflowParams,
  WorkerEnv,
} from "@infra/alchemy.run"
import type { WorkflowRecord } from "../types/workflow"
import { startWorkflow } from "../workflows/start"

export const MessageDeliveryWorkflowParamsSchema = z
  .object({ messageResponseId: z.number().int().positive() })
  .strict() satisfies z.ZodType<MessageDeliveryWorkflowParams>

export function messageDeliveryWorkflowInstanceId(
  messageResponseId: number,
): string {
  return `message-delivery-${messageResponseId}-${crypto.randomUUID()}`
}

export function messageDeliveryWorkflowRecord(
  messageResponseId: number,
): WorkflowRecord {
  return { recordName: "message_response", recordId: messageResponseId }
}

export async function startMessageDeliveryWorkflow(
  db: D1Database,
  workflow: WorkerEnv["MESSAGE_DELIVERY_WORKFLOW"],
  params: MessageDeliveryWorkflowParams,
): Promise<{ id: string; created: boolean }> {
  return startWorkflow(db, workflow, {
    record: messageDeliveryWorkflowRecord(params.messageResponseId),
    instanceId: messageDeliveryWorkflowInstanceId(params.messageResponseId),
    params,
  })
}
