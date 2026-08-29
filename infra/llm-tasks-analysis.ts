import { z } from "zod"
import { queryD1Rows, type DatabaseState } from "./d1"

const DurationSchema = z.object({
  task_type: z.string().min(1),
  duration_ms: z.number().int().nonnegative(),
})

export interface RuntimeStats {
  taskType: string
  count: number
  meanMs: number
  medianMs: number
  maxMs: number
}

function medianOfSorted(sorted: number[]): number {
  if (sorted.length === 0) {
    throw new Error("Median requires at least one value")
  }
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    const lower = sorted[middle - 1]
    const upper = sorted[middle]
    if (lower === undefined || upper === undefined) {
      throw new Error("Median indices were outside the sorted values")
    }
    return (lower + upper) / 2
  }
  const median = sorted[middle]
  if (median === undefined)
    throw new Error("Median index was outside the sorted values")
  return median
}

function stats(taskType: string, durations: number[]): RuntimeStats {
  const sorted = durations.toSorted((left, right) => left - right)
  const median = medianOfSorted(sorted)
  return {
    taskType,
    count: durations.length,
    meanMs: durations.reduce((sum, value) => sum + value, 0) / durations.length,
    medianMs: median,
    maxMs: Math.max(...durations),
  }
}

export async function analyzeLlmTaskRuntimes(
  database: DatabaseState,
): Promise<RuntimeStats[]> {
  const rows = (
    await queryD1Rows(
      database,
      "SELECT task_type, duration_ms FROM llm_tasks WHERE duration_ms IS NOT NULL ORDER BY task_type, id",
    )
  ).map((row) => DurationSchema.parse(row))
  if (rows.length === 0) return []

  const grouped = new Map<string, number[]>()
  for (const row of rows) {
    const values = grouped.get(row.task_type) ?? []
    values.push(row.duration_ms)
    grouped.set(row.task_type, values)
  }
  const result = [...grouped.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([taskType, durations]) => stats(taskType, durations))
  result.push(
    stats(
      "all",
      rows.map((row) => row.duration_ms),
    ),
  )
  return result
}
