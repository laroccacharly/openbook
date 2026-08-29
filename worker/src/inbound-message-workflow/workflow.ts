import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers"
import { NonRetryableError } from "cloudflare:workflows"
import type { MessageWorkflowParams, WorkerEnv } from "@infra/alchemy.run"
import { getConfiguration } from "../db/configuration"
import { updateWorkflow } from "../db/workflows"
import { getMessageById } from "../db/messages"
import { createLanguageModel } from "../llm-provider/create-model"
import { GoogleGeocoder } from "../maps/google-geocoder"
import { MONTREAL_SERVICE_AREA } from "../maps/service-area"
import {
  createPipelineContext,
  processInboundMessage,
} from "../message-pipeline"
import { fixedClock } from "../time"
import { MESSAGE_WORKFLOW_RETRY_LIMIT } from "./retries"
import {
  inboundMessageWorkflowRecord,
  MessageWorkflowParamsSchema,
} from "./workflow-start"

export class MessageWorkflow extends WorkflowEntrypoint<
  WorkerEnv,
  MessageWorkflowParams
> {
  async run(
    event: Readonly<WorkflowEvent<MessageWorkflowParams>>,
    step: WorkflowStep,
  ): Promise<{ messageId: number }> {
    const params = MessageWorkflowParamsSchema.parse(event.payload)
    const record = inboundMessageWorkflowRecord(params.messageId)

    try {
      return await step.do(
        "process-message",
        {
          retries: {
            limit: MESSAGE_WORKFLOW_RETRY_LIMIT,
            delay: "10 seconds",
            backoff: "exponential",
          },
        },
        async () => {
          const workflow = await updateWorkflow(this.env.DB, record, {
            status: "running",
          })
          try {
            const message = await getMessageById(this.env.DB, params.messageId)
            if (message === null) {
              throw new NonRetryableError(
                `Message ${params.messageId} not found`,
              )
            }

            const {
              masterSystemPrompt,
              timezone,
              openRouterReasoningEffort,
              autoApproveDrafts,
            } = await getConfiguration(this.env.DB)
            const ctx = await createPipelineContext(this.env.DB, {
              message,
              languageModelId: params.languageModelId,
              languageModel: createLanguageModel(
                this.env,
                params.languageModelId,
                openRouterReasoningEffort,
              ),
              masterSystemPrompt,
              timezone,
              addressGeocoder: new GoogleGeocoder(this.env.GOOGLE_MAPS_API_KEY),
              serviceArea: MONTREAL_SERVICE_AREA,
              autoApproveDrafts,
              messageDeliveryWorkflow: this.env.MESSAGE_DELIVERY_WORKFLOW,
              clock:
                params.now !== undefined
                  ? fixedClock(new Date(params.now))
                  : undefined,
              setStage: async (stage) => {
                await updateWorkflow(this.env.DB, record, { stage })
              },
            })
            await processInboundMessage(ctx)
            await updateWorkflow(this.env.DB, record, { status: "completed" })
            return { messageId: message.id }
          } catch (error) {
            console.error("Message workflow attempt failed", {
              messageId: params.messageId,
              attempt: workflow.attempt,
              error: error instanceof Error ? error.message : String(error),
            })
            throw error
          }
        },
      )
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      const workflow = await updateWorkflow(this.env.DB, record, {
        status: "failed",
        error: errorMessage,
      })
      console.error("Message workflow failed after exhausting retries", {
        messageId: params.messageId,
        attempt: workflow.attempt,
        stage: workflow.stage,
        error: errorMessage,
      })
      throw error
    }
  }
}
