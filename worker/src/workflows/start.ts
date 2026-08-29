import type { D1Database } from "@cloudflare/workers-types"
import { createWorkflow, updateWorkflow } from "../db/workflows"
import type { WorkflowRecord } from "../types/workflow"

type WorkflowBinding<Params> = {
  createBatch(
    instances: { id: string; params: Params }[],
  ): Promise<{ id: string }[]>
}

export async function startWorkflow<Params>(
  db: D1Database,
  binding: WorkflowBinding<Params>,
  input: {
    record: WorkflowRecord
    instanceId: string
    params: Params
  },
): Promise<{ id: string; created: boolean }> {
  const workflow = await createWorkflow(db, {
    ...input.record,
    workflowInstanceId: input.instanceId,
  })

  if (workflow.workflowInstanceId !== input.instanceId) {
    return { id: workflow.workflowInstanceId, created: false }
  }

  try {
    const created = await binding.createBatch([
      {
        id: input.instanceId,
        params: input.params,
      },
    ])
    const instance = created[0]
    if (instance === undefined) {
      throw new Error(
        `Workflow instance ${input.instanceId} was not created (unexpected ID collision)`,
      )
    }
    return { id: instance.id, created: true }
  } catch (error) {
    await updateWorkflow(db, input.record, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
