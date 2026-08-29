import type { Configuration } from "@worker/src/db/configuration"
import { DEFAULT_MASTER_SYSTEM_PROMPT } from "@worker/src/prompts/master"
import type { CatalogJob } from "@worker/src/types/job-catalog"
import type { Worker } from "@worker/src/types/worker"
import { testApiClient } from "../fixtures/api-client"

export const LANGUAGE_MODEL_ID = "openai/gpt-5.6-luna" // openai/gpt-5.6-luna, @cf/openai/gpt-oss-120b, @cf/zai-org/glm-5.2, deepseek/deepseek-v4-flash-0731

/** Monday 2026-07-13 12:00 America/Toronto (EDT). Tomorrow=Tue, Wed off, Thu on. */
export const FIXED_NOW = new Date("2026-07-13T16:00:00.000Z")

export async function requireCatalogJob(name: string): Promise<CatalogJob> {
  const job = (await testApiClient.listJobCatalog()).find(
    (candidate) => candidate.name === name,
  )
  if (job === undefined) {
    throw new Error(`Job catalog is missing ${JSON.stringify(name)}`)
  }
  return job
}

export async function ensureFullTimeWorker(): Promise<Worker> {
  const workers = await testApiClient.listWorkers()
  const existing = workers.find(
    (worker) => worker.schedule.name === "full-time",
  )
  if (existing !== undefined) {
    return existing
  }
  return testApiClient.createFullTimeWorker({ name: "Full Time Worker" })
}

/** Saves current config, applies LLM test settings, returns the original. */
export async function setupConfiguration(): Promise<Configuration> {
  const original = await testApiClient.getConfiguration()
  await testApiClient.patchConfiguration({
    masterSystemPrompt: DEFAULT_MASTER_SYSTEM_PROMPT,
    allowSameDayBookings: false,
    autoApproveDrafts: true,
  })
  return original
}

export async function restoreConfiguration(
  original: Configuration | undefined,
): Promise<void> {
  if (original === undefined) {
    return
  }
  await testApiClient.patchConfiguration(original)
}
