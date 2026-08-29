import { env } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import {
  completeLlmTask,
  createLlmTask,
  failLlmTask,
  getLlmTaskById,
  getLlmTasks,
  getLlmTasksByMessageId,
  resetLlmTask,
} from "@worker/src/db/llm-tasks"
import { createInboundMessage } from "@worker/tests/fixtures/messages"

describe("llm tasks CRUD", () => {
  const db = env.DB

  async function createInboundMessageFixture() {
    const { message } = await createInboundMessage(db, {
      message: "Can someone come by Friday?",
      channel: "email",
      address: "customer@example.com",
    })
    return message
  }

  test("creates a task and lists it by message id", async () => {
    const message = await createInboundMessageFixture()

    const created = await createLlmTask(db, {
      messageId: message.id,
      taskType: "first_pass",
      languageModelId: "test-model",
      systemPrompt: "Classify the message",
    })

    expect(created.id).toBeDefined()
    expect(created.createdAt).toBeDefined()
    expect(created.messageId).toBe(message.id)
    expect(created.taskType).toBe("first_pass")
    expect(created.languageModelId).toBe("test-model")
    expect(created.systemPrompt).toBe("Classify the message")
    expect(created.result).toBeNull()
    expect(created.completedAt).toBeNull()
    expect(created.failedAt).toBeNull()
    expect(created.error).toBeNull()
    expect(created.durationMs).toBeNull()
    expect(created.attempt).toBe(0)

    expect(await getLlmTaskById(db, created.id)).toEqual(created)
    expect(await getLlmTasksByMessageId(db, message.id)).toEqual([created])
  })

  test("returns the existing row for the same message and task type", async () => {
    const message = await createInboundMessageFixture()
    const first = await createLlmTask(db, {
      messageId: message.id,
      taskType: "first_pass",
      languageModelId: "test-model",
      systemPrompt: "Classify the message",
    })
    const second = await createLlmTask(db, {
      messageId: message.id,
      taskType: "first_pass",
      languageModelId: "other-model",
      systemPrompt: "Different prompt ignored",
    })

    expect(second).toEqual(first)
    expect(await getLlmTasksByMessageId(db, message.id)).toEqual([first])
  })

  test("lists all tasks newest first", async () => {
    const firstMessage = await createInboundMessageFixture()
    const first = await createLlmTask(db, {
      messageId: firstMessage.id,
      taskType: "first_pass",
      languageModelId: "test-model",
      systemPrompt: "First prompt",
    })
    const secondMessage = await createInboundMessageFixture()
    const second = await createLlmTask(db, {
      messageId: secondMessage.id,
      taskType: "compose_response",
      languageModelId: "test-model",
      systemPrompt: "Second prompt",
    })

    expect(await getLlmTasks(db)).toEqual([second, first])
  })

  test("resetLlmTask clears failure and updates attempt metadata", async () => {
    const message = await createInboundMessageFixture()
    const created = await createLlmTask(db, {
      messageId: message.id,
      taskType: "compose_response",
      languageModelId: "old-model",
      systemPrompt: "Old prompt",
    })
    await failLlmTask(db, created.id, "boom", 10)

    const reset = await resetLlmTask(db, created.id, {
      languageModelId: "new-model",
      systemPrompt: "New prompt",
    })

    expect(reset).not.toBeNull()
    expect(reset?.languageModelId).toBe("new-model")
    expect(reset?.systemPrompt).toBe("New prompt")
    expect(reset?.failedAt).toBeNull()
    expect(reset?.error).toBeNull()
    expect(reset?.durationMs).toBeNull()
    expect(reset?.attempt).toBe(1)
    expect(
      await resetLlmTask(db, 999_999, {
        languageModelId: "x",
        systemPrompt: "y",
      }),
    ).toBeNull()
  })

  test("completes and fails tasks, and returns null for missing ids", async () => {
    const message = await createInboundMessageFixture()
    const created = await createLlmTask(db, {
      messageId: message.id,
      taskType: "extract_datetimes",
      languageModelId: "test-model",
      systemPrompt: "Extract datetimes",
    })

    const completed = await completeLlmTask(
      db,
      created.id,
      { datetimes: ["2026-07-31T15:00:00.000Z"] },
      1234,
    )
    expect(completed).not.toBeNull()
    expect(completed?.result).toEqual({
      datetimes: ["2026-07-31T15:00:00.000Z"],
    })
    expect(completed?.completedAt).toBeTypeOf("number")
    expect(completed?.failedAt).toBeNull()
    expect(completed?.error).toBeNull()
    expect(completed?.durationMs).toBe(1234)

    const failed = await failLlmTask(db, created.id, "model timed out", 56)
    expect(failed).not.toBeNull()
    expect(failed?.failedAt).toBeTypeOf("number")
    expect(failed?.error).toBe("model timed out")
    expect(failed?.durationMs).toBe(56)

    expect(await getLlmTaskById(db, 999_999)).toBeNull()
    expect(await completeLlmTask(db, 999_999, { ok: true }, 0)).toBeNull()
    expect(await failLlmTask(db, 999_999, "missing", 0)).toBeNull()
    expect(await getLlmTasksByMessageId(db, 999_999)).toEqual([])
  })
})
