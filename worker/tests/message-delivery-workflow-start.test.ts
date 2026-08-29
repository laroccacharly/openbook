import { env } from "cloudflare:workers"
import { describe, expect, test, vi } from "vitest"
import type { WorkerEnv } from "@infra/alchemy.run"
import {
  approveResponseDraft,
  upsertResponseDraft,
} from "@worker/src/db/response-drafts"
import { getWorkflow } from "@worker/src/db/workflows"
import { startMessageDeliveryWorkflow } from "@worker/src/message-delivery/workflow-start"
import { createInboundMessage } from "@worker/tests/fixtures/messages"

async function createResponse() {
  const { message } = await createInboundMessage(env.DB, {
    message: "Can you help?",
    channel: "sms",
    address: "+15145550101",
  })
  const draft = await upsertResponseDraft(
    env.DB,
    message,
    { messageId: message.id, body: "Yes." },
    null,
  )
  return (await approveResponseDraft(env.DB, draft!.id, draft!.revision))!
}

function workflowBinding(error?: Error) {
  const createBatch =
    error === undefined
      ? vi
          .fn()
          .mockImplementation(async (batch: { id: string }[]) =>
            batch.map(({ id }) => ({ id })),
          )
      : vi.fn().mockRejectedValue(error)
  return {
    binding: {
      createBatch,
    } as unknown as WorkerEnv["MESSAGE_DELIVERY_WORKFLOW"],
    createBatch,
  }
}

describe("startMessageDeliveryWorkflow", () => {
  test("creates one tracking record and workflow instance per response", async () => {
    const response = await createResponse()
    const first = workflowBinding()

    const started = await startMessageDeliveryWorkflow(env.DB, first.binding, {
      messageResponseId: response.id,
    })

    expect(started.created).toBe(true)
    expect(started.id).toMatch(new RegExp(`^message-delivery-${response.id}-`))
    expect(first.createBatch).toHaveBeenCalledWith([
      {
        id: started.id,
        params: { messageResponseId: response.id },
      },
    ])

    const second = workflowBinding()
    await expect(
      startMessageDeliveryWorkflow(env.DB, second.binding, {
        messageResponseId: response.id,
      }),
    ).resolves.toEqual({ id: started.id, created: false })
    expect(second.createBatch).not.toHaveBeenCalled()
    await expect(
      getWorkflow(env.DB, {
        recordName: "message_response",
        recordId: response.id,
      }),
    ).resolves.toMatchObject({
      status: "queued",
      workflowInstanceId: started.id,
    })
  })

  test("records a workflow startup failure", async () => {
    const response = await createResponse()
    const workflow = workflowBinding(new Error("workflow unavailable"))

    await expect(
      startMessageDeliveryWorkflow(env.DB, workflow.binding, {
        messageResponseId: response.id,
      }),
    ).rejects.toThrow("workflow unavailable")
    await expect(
      getWorkflow(env.DB, {
        recordName: "message_response",
        recordId: response.id,
      }),
    ).resolves.toMatchObject({
      status: "failed",
      stage: "queued",
      attempt: 0,
      error: "workflow unavailable",
    })
  })
})
