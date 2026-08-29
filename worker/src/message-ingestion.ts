import type { WorkerEnv } from "@infra/alchemy.run"
import { getConfiguration } from "./db/configuration"
import { createMessage } from "./db/messages"
import { resolveInboundConversation } from "./message-pipeline/resolve-inbound-conversation"
import { startMessageWorkflow } from "./inbound-message-workflow/workflow-start"
import type { FromMessage } from "./types/message"

export type MessageIngestionEnvironment = Pick<
  WorkerEnv,
  "DB" | "MESSAGE_WORKFLOW"
>

export type IngestCustomerMessageResult = {
  id: number
  created: boolean
}

/**
 * Persist a channel-neutral inbound customer message and start its workflow.
 * The external id makes repeated provider deliveries safe to ingest.
 */
export async function ingestCustomerMessage(
  env: MessageIngestionEnvironment,
  input: FromMessage,
): Promise<IngestCustomerMessageResult> {
  const conversationId = await resolveInboundConversation(env.DB, {
    channel: input.channel,
    address: input.address,
  })
  const { message, created } = await createMessage(env.DB, {
    message: input.message,
    externalId: input.externalId ?? null,
    conversationId,
  })

  if (created) {
    const { languageModelId } = await getConfiguration(env.DB)
    await startMessageWorkflow(env.DB, env.MESSAGE_WORKFLOW, {
      messageId: message.id,
      languageModelId: input.languageModelId ?? languageModelId,
      now: input.now?.toISOString(),
    })
  }

  return { id: message.id, created }
}
