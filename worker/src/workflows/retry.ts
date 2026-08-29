import type { D1Database } from "@cloudflare/workers-types"
import type { WorkerEnv } from "@infra/alchemy.run"
import { getWorkflow } from "../db/workflows"
import type { WorkflowRecord } from "../types/workflow"

export type WorkflowRetryFailure =
  | "not_found"
  | "unsupported_record"
  | "ineligible_state"

export class WorkflowRetryError extends Error {
  readonly reason: WorkflowRetryFailure

  constructor(reason: WorkflowRetryFailure, message: string) {
    super(message)
    this.name = "WorkflowRetryError"
    this.reason = reason
  }
}

export type WorkflowRetryOutcome = "restarted" | "already_active"

type WorkflowBinding = {
  get(instanceId: string): Promise<{
    status(): Promise<{ status: string }>
    restart(): Promise<void>
  }>
}

type WorkflowInstanceStatus =
  | "queued"
  | "running"
  | "paused"
  | "errored"
  | "terminated"
  | "complete"
  | "waiting"
  | "waitingForPause"
  | "unknown"

function isWorkflowInstanceStatus(
  status: string,
): status is WorkflowInstanceStatus {
  return (
    status === "queued" ||
    status === "running" ||
    status === "paused" ||
    status === "errored" ||
    status === "terminated" ||
    status === "complete" ||
    status === "waiting" ||
    status === "waitingForPause" ||
    status === "unknown"
  )
}

function getWorkflowBinding(
  env: WorkerEnv,
  recordName: string,
): WorkflowBinding {
  if (recordName === "message") {
    return env.MESSAGE_WORKFLOW
  }
  if (recordName === "message_response") {
    return env.MESSAGE_DELIVERY_WORKFLOW
  }
  throw new WorkflowRetryError(
    "unsupported_record",
    `Unsupported workflow record "${recordName}"`,
  )
}

export async function retryWorkflow(
  db: D1Database,
  env: WorkerEnv,
  record: WorkflowRecord,
): Promise<WorkflowRetryOutcome> {
  const workflow = await getWorkflow(db, record)
  if (workflow === null) {
    throw new WorkflowRetryError("not_found", "Workflow not found")
  }

  if (workflow.attempt === 0) {
    throw new WorkflowRetryError(
      "ineligible_state",
      "This workflow failed before its first attempt and cannot be retried automatically yet",
    )
  }

  const workflowBinding = getWorkflowBinding(env, record.recordName)
  const instance = await workflowBinding.get(workflow.workflowInstanceId)
  const instanceStatus = await instance.status()
  const status = instanceStatus.status

  if (!isWorkflowInstanceStatus(status)) {
    throw new WorkflowRetryError(
      "ineligible_state",
      `Cannot retry workflow instance in "${String(status)}" state`,
    )
  }

  switch (status) {
    case "errored":
      await instance.restart()
      return "restarted"
    case "queued":
    case "running":
      return "already_active"
    case "complete":
    case "terminated":
    case "paused":
    case "waiting":
    case "waitingForPause":
    case "unknown":
      throw new WorkflowRetryError(
        "ineligible_state",
        `Cannot retry workflow instance in "${status}" state`,
      )
    default: {
      const exhaustive: never = status
      throw new WorkflowRetryError(
        "ineligible_state",
        `Cannot retry workflow instance in "${String(exhaustive)}" state`,
      )
    }
  }
}
