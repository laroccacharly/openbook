import { env } from "cloudflare:workers"
import { describe, expect, test, vi } from "vitest"
import type { WorkerEnv } from "@infra/alchemy.run"
import { createWorkflow, updateWorkflow } from "@worker/src/db/workflows"
import { retryWorkflow } from "@worker/src/workflows/retry"
import { createInboundMessage } from "@worker/tests/fixtures/messages"

describe("retryWorkflow", () => {
  async function createWorkflowFixture(attempted: boolean) {
    const { message } = await createInboundMessage(env.DB, {
      message: "Please retry this workflow",
      channel: "email",
      address: "workflow-retry@example.com",
    })
    const record = { recordName: "message", recordId: message.id }
    await createWorkflow(env.DB, {
      ...record,
      workflowInstanceId: `message-retry-${message.id}`,
    })
    if (attempted) {
      await updateWorkflow(env.DB, record, { status: "running" })
    }
    await updateWorkflow(env.DB, record, {
      status: "failed",
      error: "workflow failed",
    })
    return record
  }

  function retryEnvironment(status: string) {
    const restart = vi.fn().mockResolvedValue(undefined)
    const get = vi.fn().mockResolvedValue({
      status: vi.fn().mockResolvedValue({ status }),
      restart,
    })
    return {
      env: {
        MESSAGE_WORKFLOW: { get },
      } as unknown as WorkerEnv,
      get,
      restart,
    }
  }

  test("explains startup failures without looking up a missing instance", async () => {
    const record = await createWorkflowFixture(false)
    const workflow = retryEnvironment("errored")

    await expect(retryWorkflow(env.DB, workflow.env, record)).rejects.toThrow(
      "failed before its first attempt and cannot be retried automatically yet",
    )
    expect(workflow.get).not.toHaveBeenCalled()
  })

  test("restarts an errored instance after at least one attempt", async () => {
    const record = await createWorkflowFixture(true)
    const workflow = retryEnvironment("errored")

    await expect(retryWorkflow(env.DB, workflow.env, record)).resolves.toBe(
      "restarted",
    )
    expect(workflow.restart).toHaveBeenCalledOnce()
  })
})
