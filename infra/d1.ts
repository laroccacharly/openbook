import { resolve } from "node:path"
import { z } from "zod"
import { requireEnv } from "@book/secrets"

const stackName = "Book"
const databaseLogicalId = "Database"

const DatabaseStateSchema = z.object({
  databaseId: z.string().min(1),
  databaseName: z.string().min(1),
  accountId: z.string().min(1),
})

export type DatabaseState = z.infer<typeof DatabaseStateSchema>

export function databaseStatePath(
  infraDirectory: string,
  stage: string,
): string {
  return resolve(
    infraDirectory,
    ".alchemy",
    "state",
    stackName,
    stage,
    `${databaseLogicalId}.json`,
  )
}

export async function loadDatabaseState(
  infraDirectory: string,
  stage: string,
): Promise<DatabaseState> {
  const path = databaseStatePath(infraDirectory, stage)
  const file = Bun.file(path)
  if (!(await file.exists())) {
    throw new Error(
      `No Alchemy D1 state at ${path}. Deploy the stack first (bun infra up).`,
    )
  }
  const payload = (await file.json()) as { attr?: unknown }
  return DatabaseStateSchema.parse(payload.attr)
}

type D1SqlValue = string | number | null | boolean
type D1Row = {
  [column: string]: D1SqlValue
}

type D1QueryBatch = {
  results?: D1Row[]
}

export async function queryD1(
  database: DatabaseState,
  sql: string,
): Promise<D1QueryBatch[]> {
  const token = requireEnv("CLOUDFLARE_API_TOKEN")
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${database.accountId}/d1/database/${database.databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql }),
      signal: AbortSignal.timeout(30_000),
    },
  )
  const payload = (await response.json()) as {
    success?: boolean
    result?: D1QueryBatch[]
  }
  if (!response.ok) {
    throw new Error(
      `D1 query failed (${response.status}): ${JSON.stringify(payload)}`,
    )
  }
  if (!payload.success || !Array.isArray(payload.result)) {
    throw new Error(`Unexpected D1 query response: ${JSON.stringify(payload)}`)
  }
  return payload.result
}

export async function queryD1Rows(
  database: DatabaseState,
  sql: string,
): Promise<D1Row[]> {
  const result = await queryD1(database, sql)
  const rows = result[0]?.results
  if (rows === undefined) return []
  if (!Array.isArray(rows)) {
    throw new Error(
      `Unexpected D1 results payload: ${JSON.stringify(result[0])}`,
    )
  }
  return rows as D1Row[]
}

export async function listTables(database: DatabaseState): Promise<string[]> {
  const rows = await queryD1Rows(
    database,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )
  return rows
    .map((row) => z.object({ name: z.string().min(1) }).parse(row).name)
    .filter((name) => !name.startsWith("_cf_"))
}

export async function wipeDatabase(database: DatabaseState): Promise<string[]> {
  const tables = await listTables(database)
  if (tables.length === 0) return []
  const drops = tables
    .map((name) => `DROP TABLE IF EXISTS "${name.replaceAll('"', '""')}"`)
    .join("; ")
  await queryD1(database, `PRAGMA defer_foreign_keys = on; ${drops};`)
  return tables
}
