import type { D1Database } from "@cloudflare/workers-types"
import {
  CatalogJobRowSchema,
  type CatalogJob,
  CatalogJobInputSchema,
  CatalogJobPatchSchema,
  type CatalogJobInput,
  type CatalogJobPatch,
} from "../types/job-catalog"

const JOB_COLUMNS =
  "id, name, estimated_price_cents, duration_minutes, worker_count"

function jobFromRow(input: unknown): CatalogJob {
  const row = CatalogJobRowSchema.parse(input)
  return {
    id: row.id,
    name: row.name,
    estimatedPriceCents: row.estimated_price_cents,
    durationMinutes: row.duration_minutes,
    workerCount: row.worker_count,
  }
}

export async function getJobCatalog(db: D1Database): Promise<CatalogJob[]> {
  const result = await db
    .prepare(
      `SELECT ${JOB_COLUMNS}
       FROM job_catalog
       ORDER BY id ASC`,
    )
    .all()

  return result.results.map(jobFromRow)
}

export async function getCatalogJobById(
  db: D1Database,
  id: number,
): Promise<CatalogJob | null> {
  const row = await db
    .prepare(`SELECT ${JOB_COLUMNS} FROM job_catalog WHERE id = ?`)
    .bind(id)
    .first()
  return row === null ? null : jobFromRow(row)
}

export async function createCatalogJob(
  db: D1Database,
  input: CatalogJobInput,
): Promise<CatalogJob> {
  const job = CatalogJobInputSchema.parse(input)
  const row = await db
    .prepare(
      `INSERT INTO job_catalog (
         name, estimated_price_cents, duration_minutes, worker_count
       ) VALUES (?, ?, ?, ?)
       RETURNING ${JOB_COLUMNS}`,
    )
    .bind(
      job.name,
      job.estimatedPriceCents,
      job.durationMinutes,
      job.workerCount,
    )
    .first()
  if (row === null) {
    throw new Error("Failed to create catalog job")
  }
  return jobFromRow(row)
}

export async function updateCatalogJob(
  db: D1Database,
  id: number,
  input: CatalogJobPatch,
): Promise<CatalogJob | null> {
  const patch = CatalogJobPatchSchema.parse(input)
  const fields: string[] = []
  const values: (string | number)[] = []
  const add = (column: string, value: string | number | undefined) => {
    if (value !== undefined) {
      fields.push(`${column} = ?`)
      values.push(value)
    }
  }
  add("name", patch.name)
  add("estimated_price_cents", patch.estimatedPriceCents)
  add("duration_minutes", patch.durationMinutes)
  add("worker_count", patch.workerCount)

  if (fields.length === 0) {
    return getCatalogJobById(db, id)
  }

  const row = await db
    .prepare(
      `UPDATE job_catalog SET ${fields.join(", ")} WHERE id = ?
       RETURNING ${JOB_COLUMNS}`,
    )
    .bind(...values, id)
    .first()
  return row === null ? null : jobFromRow(row)
}

export async function deleteCatalogJob(
  db: D1Database,
  id: number,
): Promise<CatalogJob | null> {
  const row = await db
    .prepare(`DELETE FROM job_catalog WHERE id = ? RETURNING ${JOB_COLUMNS}`)
    .bind(id)
    .first()
  return row === null ? null : jobFromRow(row)
}
