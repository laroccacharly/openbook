import { resolve } from "node:path"
import { z } from "zod"

const WorkerStateSchema = z.object({
  workerName: z.string().min(1),
})

export type WorkerState = z.infer<typeof WorkerStateSchema>

export function workerStatePath(infraDirectory: string, stage: string): string {
  return resolve(
    infraDirectory,
    ".alchemy",
    "state",
    "Book",
    stage,
    "Worker.json",
  )
}

export async function loadWorkerState(
  infraDirectory: string,
  stage: string,
): Promise<WorkerState> {
  const path = workerStatePath(infraDirectory, stage)
  const file = Bun.file(path)
  if (!(await file.exists())) {
    throw new Error(
      `No Alchemy Worker state at ${path}. Deploy the stack first (bun infra up).`,
    )
  }
  const payload = (await file.json()) as { attr?: unknown }
  return WorkerStateSchema.parse(payload.attr)
}
