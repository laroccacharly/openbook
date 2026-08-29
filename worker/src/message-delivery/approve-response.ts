import type { WorkerEnv } from "@infra/alchemy.run"
import { getConfiguration } from "../db/configuration"
import { approveResponseDraft } from "../db/response-drafts"
import type { MessageResponse } from "../types"
import { startMessageDeliveryWorkflow } from "./workflow-start"

export type ResponseApprovalEnvironment = Pick<
  WorkerEnv,
  "DB" | "MESSAGE_DELIVERY_WORKFLOW"
>

export async function approveResponseDraftAndStartDelivery(
  env: ResponseApprovalEnvironment,
  draftId: number,
  expectedRevision: number,
): Promise<MessageResponse | null> {
  const response = await approveResponseDraft(env.DB, draftId, expectedRevision)
  if (response === null) {
    return null
  }

  const configuration = await getConfiguration(env.DB)
  if (!configuration.enableMessageDelivery) {
    return response
  }

  await startMessageDeliveryWorkflow(env.DB, env.MESSAGE_DELIVERY_WORKFLOW, {
    messageResponseId: response.id,
  })
  return response
}
