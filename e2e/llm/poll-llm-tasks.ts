import { MESSAGE_WORKFLOW_MAX_ATTEMPTS } from "@worker/src/inbound-message-workflow/retries"
import type { LlmTask } from "@worker/src/types/llm-task"
import { testApiClient } from "../fixtures/api-client"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

class FatalPollError extends Error {}

async function handlePollError(
  error: unknown,
  intervalMs: number,
): Promise<void> {
  if (error instanceof FatalPollError) throw error
  await sleep(intervalMs)
}

export async function pollUntil<T>(
  probe: () => Promise<T>,
  options?: {
    timeoutMs?: number
    intervalMs?: number
    timeoutMessage?: string
  },
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 60_000
  const intervalMs = options?.intervalMs ?? 1_000
  const deadline = Date.now() + timeoutMs
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      return await probe()
    } catch (error) {
      lastError = error
      await handlePollError(error, intervalMs)
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }
  throw new Error(options?.timeoutMessage ?? "Timed out waiting for assertion")
}

export async function pollLlmTasks(
  messageId: number,
  assert: (tasks: LlmTask[]) => void,
  options?: {
    timeoutMs?: number
    intervalMs?: number
  },
): Promise<LlmTask[]> {
  return pollUntil(
    async () => {
      const tasks = await testApiClient.listLlmTasks(messageId)
      const workflow = await testApiClient.getWorkflow("message", messageId)
      if (
        workflow.status === "failed" &&
        workflow.attempt >= MESSAGE_WORKFLOW_MAX_ATTEMPTS
      ) {
        throw new FatalPollError(
          `message workflow failed after ${workflow.attempt} attempts: ${workflow.error ?? "unknown error"}`,
        )
      }
      assert(tasks)
      return tasks
    },
    {
      ...options,
      timeoutMs: options?.timeoutMs ?? 180_000,
      timeoutMessage: `Timed out waiting for llm tasks on message ${messageId}`,
    },
  )
}

export function requireTask(tasks: LlmTask[], taskType: string): LlmTask {
  const task = tasks.find((entry) => entry.taskType === taskType)
  if (task === undefined) {
    throw new Error(`Missing llm task: ${taskType}`)
  }
  if (task.completedAt === null) {
    throw new Error(`llm task ${taskType} is not completed yet`)
  }
  return task
}
