import { env } from "cloudflare:workers"
import { describe, expect, test, vi } from "vitest"
import type { WorkerEnv } from "@infra/alchemy.run"
import { getMessages } from "@worker/src/db/messages"
import { ingestCustomerMessage } from "@worker/src/message-ingestion"

function workflowBinding() {
  const createBatch = vi
    .fn()
    .mockImplementation(async (batch: { id: string }[]) =>
      batch.map(({ id }) => ({ id })),
    )
  return {
    binding: { createBatch } as unknown as WorkerEnv["MESSAGE_WORKFLOW"],
    createBatch,
  }
}

describe("ingestCustomerMessage", () => {
  test("persists a message and starts its workflow", async () => {
    const workflow = workflowBinding()
    const result = await ingestCustomerMessage(
      { DB: env.DB, MESSAGE_WORKFLOW: workflow.binding },
      {
        channel: "sms",
        address: "+15145550101",
        message: "I need an appointment",
        externalId: "sms:SM123",
      },
    )

    expect(result).toMatchObject({ created: true })
    expect(workflow.createBatch).toHaveBeenCalledOnce()
    expect(await getMessages(env.DB)).toHaveLength(1)
  })

  test("deduplicates provider retries without starting a second workflow", async () => {
    const workflow = workflowBinding()
    const ingestionEnv = { DB: env.DB, MESSAGE_WORKFLOW: workflow.binding }
    const input = {
      channel: "sms" as const,
      address: "+15145550101",
      message: "I need an appointment",
      externalId: "sms:SM-retried",
    }

    const first = await ingestCustomerMessage(ingestionEnv, input)
    const retried = await ingestCustomerMessage(ingestionEnv, input)

    expect(retried).toEqual({ id: first.id, created: false })
    expect(workflow.createBatch).toHaveBeenCalledOnce()
    expect(await getMessages(env.DB)).toHaveLength(1)
  })
})
