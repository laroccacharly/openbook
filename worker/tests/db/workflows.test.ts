import { env } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import {
  createWorkflow,
  getWorkflow,
  getWorkflows,
  updateWorkflow,
} from "@worker/src/db/workflows"
import { createInboundMessage } from "@worker/tests/fixtures/messages"
import { testApiClient } from "../fixtures/api-client"

describe("workflows", () => {
  const db = env.DB

  async function createWorkflowFixture(workflowInstanceId = "message-fixture") {
    const { message } = await createInboundMessage(db, {
      message: "Please schedule a visit",
      channel: "email",
      address: "workflow@example.com",
    })
    const record = { recordName: "message", recordId: message.id }
    const workflow = await createWorkflow(db, {
      ...record,
      workflowInstanceId,
    })
    return { record, workflow }
  }

  test("tracks stages, immediate failures, retries, and completion", async () => {
    const { record, workflow } = await createWorkflowFixture()
    expect(workflow).toMatchObject({
      recordName: "message",
      recordId: record.recordId,
      workflowInstanceId: "message-fixture",
      status: "queued",
      stage: "queued",
      attempt: 0,
      error: null,
    })
    expect(workflow.startedAt).toBeNull()

    const running = await updateWorkflow(db, record, { status: "running" })
    expect(running.status).toBe("running")
    expect(running.attempt).toBe(1)
    expect(running.startedAt).toBeTypeOf("number")

    const staged = await updateWorkflow(db, record, {
      stage: "find_next_available",
    })
    expect(staged.stage).toBe("find_next_available")

    const failed = await updateWorkflow(db, record, {
      status: "failed",
      error: "No worker found",
    })
    expect(failed.status).toBe("failed")
    expect(failed.error).toBe("No worker found")
    expect(failed.failedAt).toBeTypeOf("number")

    const retrying = await updateWorkflow(db, record, {
      status: "running",
      stage: "retrying",
    })
    expect(retrying.status).toBe("running")
    expect(retrying.stage).toBe("retrying")
    expect(retrying.attempt).toBe(2)
    expect(retrying.error).toBe("No worker found")
    expect(retrying.failedAt).toBe(failed.failedAt)

    const completed = await updateWorkflow(db, record, {
      status: "completed",
    })
    expect(completed.status).toBe("completed")
    expect(completed.stage).toBe("completed")
    expect(completed.error).toBeNull()
    expect(completed.failedAt).toBeNull()
    expect(completed.completedAt).toBeTypeOf("number")
    expect(await getWorkflow(db, record)).toEqual(completed)
  })

  test("is idempotent across record types, lists, and serves the API", async () => {
    const first = await createWorkflowFixture("message-first")
    const duplicate = await createWorkflow(db, {
      ...first.record,
      workflowInstanceId: "ignored-on-duplicate",
    })
    expect(duplicate).toEqual(first.workflow)

    const delivery = await createWorkflow(db, {
      recordName: "message_response",
      recordId: first.record.recordId,
      workflowInstanceId: "delivery-first",
    })
    expect(delivery.recordId).toBe(first.record.recordId)
    expect(delivery.recordName).toBe("message_response")

    expect(await getWorkflows(db, "message")).toEqual([first.workflow])
    expect(await getWorkflows(db)).toEqual([delivery, first.workflow])
    expect(await testApiClient.listWorkflows()).toEqual([
      delivery,
      first.workflow,
    ])
    expect(
      await testApiClient.getWorkflow("message", first.record.recordId),
    ).toEqual(first.workflow)
    expect(
      await getWorkflow(db, {
        recordName: "message",
        recordId: 999_999,
      }),
    ).toBeNull()
  })

  test("rejects updates for a missing workflow", async () => {
    await expect(
      updateWorkflow(
        db,
        {
          recordName: "message",
          recordId: 999_999,
        },
        {
          stage: "missing",
        },
      ),
    ).rejects.toThrow("Workflow for message record 999999 not found")
  })
})
