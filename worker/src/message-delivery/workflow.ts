import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers"
import type {
  MessageDeliveryWorkflowParams,
  WorkerEnv,
} from "@infra/alchemy.run"
import { updateWorkflow } from "../db/workflows"
import { deliverMessage } from "./deliver"
import {
  messageDeliveryWorkflowRecord,
  MessageDeliveryWorkflowParamsSchema,
} from "./workflow-start"

const DELIVERY_RETRY_LIMIT = 3

export class MessageDeliveryWorkflow extends WorkflowEntrypoint<
  WorkerEnv,
  MessageDeliveryWorkflowParams
> {
  async run(
    event: Readonly<WorkflowEvent<MessageDeliveryWorkflowParams>>,
    step: WorkflowStep,
  ): Promise<{ messageResponseId: number; providerMessageId: string }> {
    const { messageResponseId } = MessageDeliveryWorkflowParamsSchema.parse(
      event.payload,
    )
    const record = messageDeliveryWorkflowRecord(messageResponseId)

    try {
      return await step.do(
        "deliver-message",
        {
          retries: {
            limit: DELIVERY_RETRY_LIMIT,
            delay: "10 seconds",
            backoff: "exponential",
          },
        },
        () => deliverMessage(this.env, messageResponseId),
      )
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      await updateWorkflow(this.env.DB, record, {
        status: "failed",
        error: errorMessage,
      })
      console.error("Message delivery workflow failed", {
        messageResponseId,
        error: errorMessage,
      })
      throw error
    }
  }
}
