import { env } from "cloudflare:workers"
import { describe, expect, test, vi } from "vitest"
import type { WorkerEnv } from "@infra/alchemy.run"
import { getWorkflow } from "@worker/src/db/workflows"
import { createInboundMessage } from "@worker/tests/fixtures/messages"
import { startMessageWorkflow } from "@worker/src/inbound-message-workflow/workflow-start"

describe("startMessageWorkflow", () => {
  async function createInboundMessageFixture() {
    const { message } = await createInboundMessage(env.DB, {
      message: "Please schedule a visit",
      channel: "email",
      address: "workflow-start@example.com",
    })
    return message
  }

  function workflowBinding(options: {
    created?: { id: string }[]
    error?: Error
  }) {
    const createBatch =
      options.error === undefined
        ? vi.fn().mockImplementation(async (batch: { id: string }[]) => {
            if (options.created !== undefined) {
              return options.created
            }
            return batch.map((entry) => ({ id: entry.id }))
          })
        : vi.fn().mockRejectedValue(options.error)
    const get = vi.fn().mockResolvedValue({})
    return {
      binding: { createBatch, get } as unknown as WorkerEnv["MESSAGE_WORKFLOW"],
      createBatch,
      get,
    }
  }

  test("creates the record and starts a new workflow instance", async () => {
    const message = await createInboundMessageFixture()
    const workflow = workflowBinding({})

    const result = await startMessageWorkflow(env.DB, workflow.binding, {
      messageId: message.id,
      languageModelId: "test-model",
    })

    expect(result.created).toBe(true)
    expect(result.id).toMatch(new RegExp(`^message-${message.id}-`))
    expect(workflow.createBatch).toHaveBeenCalledWith([
      {
        id: result.id,
        params: {
          messageId: message.id,
          languageModelId: "test-model",
        },
      },
    ])
    expect(
      await getWorkflow(env.DB, {
        recordName: "message",
        recordId: message.id,
      }),
    ).toMatchObject({
      workflowInstanceId: result.id,
      status: "queued",
    })
  })

  test("reuses the existing D1 record without creating another instance", async () => {
    const message = await createInboundMessageFixture()
    const first = workflowBinding({})
    const started = await startMessageWorkflow(env.DB, first.binding, {
      messageId: message.id,
      languageModelId: "test-model",
    })

    const second = workflowBinding({})
    await expect(
      startMessageWorkflow(env.DB, second.binding, {
        messageId: message.id,
        languageModelId: "test-model",
      }),
    ).resolves.toEqual({ id: started.id, created: false })
    expect(second.createBatch).not.toHaveBeenCalled()
  })

  test("records a startup failure before rethrowing", async () => {
    const message = await createInboundMessageFixture()
    const workflow = workflowBinding({
      error: new Error("workflow unavailable"),
    })

    await expect(
      startMessageWorkflow(env.DB, workflow.binding, {
        messageId: message.id,
        languageModelId: "test-model",
      }),
    ).rejects.toThrow("workflow unavailable")
    expect(
      await getWorkflow(env.DB, {
        recordName: "message",
        recordId: message.id,
      }),
    ).toMatchObject({
      status: "failed",
      stage: "queued",
      attempt: 0,
      error: "workflow unavailable",
    })
  })

  test("starts workflows independently for messages in the same conversation", async () => {
    const address = "independent@example.com"
    const { message: first } = await createInboundMessage(env.DB, {
      message: "First request",
      channel: "email",
      address,
    })
    const { message: second } = await createInboundMessage(env.DB, {
      message: "Second request",
      channel: "email",
      address,
    })
    const firstWorkflow = workflowBinding({})
    const secondWorkflow = workflowBinding({})

    const [firstStarted, secondStarted] = await Promise.all([
      startMessageWorkflow(env.DB, firstWorkflow.binding, {
        messageId: first.id,
        languageModelId: "first-model",
      }),
      startMessageWorkflow(env.DB, secondWorkflow.binding, {
        messageId: second.id,
        languageModelId: "second-model",
        now: "2026-08-06T13:00:00.000Z",
      }),
    ])

    expect(firstStarted.created).toBe(true)
    expect(secondStarted.created).toBe(true)
    expect(firstWorkflow.createBatch).toHaveBeenCalledOnce()
    expect(secondWorkflow.createBatch).toHaveBeenCalledOnce()
    expect(
      await getWorkflow(env.DB, {
        recordName: "message",
        recordId: first.id,
      }),
    ).toMatchObject({ status: "queued", stage: "queued" })
    expect(
      await getWorkflow(env.DB, {
        recordName: "message",
        recordId: second.id,
      }),
    ).toMatchObject({ status: "queued", stage: "queued" })
  })
})
