import type { D1Database } from "@cloudflare/workers-types"
import { z } from "zod"

export const QUERY_SQL_MAX_ROWS = 25

export const QuerySqlInputSchema = z.object({
  sql: z
    .string()
    .min(1)
    .describe(
      "A single SQLite SELECT (or WITH ... SELECT). Do not send multiple statements.",
    ),
})

export type QuerySqlInput = z.infer<typeof QuerySqlInputSchema>

export type QuerySqlRow = {
  [column: string]: unknown
}

export type QuerySqlResult =
  | {
      error: string
    }
  | {
      rows: QuerySqlRow[]
      rowCount: number
      truncated: boolean
    }

export const TableInfoInputSchema = z.object({
  tableName: z
    .string()
    .min(1)
    .describe("The exact name of one database table to inspect."),
})

export type TableInfoInput = z.infer<typeof TableInfoInputSchema>

const TableInfoColumnRowSchema = z.object({
  cid: z.number().int().nonnegative(),
  name: z.string(),
  type: z.string(),
  notnull: z.union([z.literal(0), z.literal(1)]),
  dflt_value: z.unknown().nullable(),
  pk: z.number().int().nonnegative(),
})

const TableInfoIndexRowSchema = z.object({
  name: z.string(),
  unique: z.union([z.literal(0), z.literal(1)]),
  origin: z.string(),
  partial: z.union([z.literal(0), z.literal(1)]),
})

const TableInfoIndexColumnRowSchema = z.object({
  seqno: z.number().int().nonnegative(),
  name: z.string().nullable(),
})

const TableInfoForeignKeyRowSchema = z.object({
  id: z.number().int().nonnegative(),
  seq: z.number().int().nonnegative(),
  table: z.string(),
  from: z.string(),
  to: z.string().nullable(),
  on_update: z.string(),
  on_delete: z.string(),
  match: z.string(),
})

export type TableInfoResult =
  | { error: string }
  | {
      name: string
      createSql: string
      columns: Array<{
        position: number
        name: string
        type: string
        notNull: boolean
        defaultValue: unknown
        primaryKeyPosition: number
      }>
      indexes: Array<{
        name: string
        unique: boolean
        origin: string
        partial: boolean
        columns: Array<{ position: number; name: string | null }>
      }>
      foreignKeys: Array<{
        id: number
        sequence: number
        table: string
        from: string
        to: string | null
        onUpdate: string
        onDelete: string
        match: string
      }>
    }

export const WriteSqlInputSchema = z.object({
  sql: z
    .string()
    .min(1)
    .describe(
      "A single SQLite INSERT, UPDATE, DELETE, or REPLACE. Do not send multiple statements.",
    ),
})

export type WriteSqlInput = z.infer<typeof WriteSqlInputSchema>

export type WriteSqlResult =
  | {
      error: string
    }
  | {
      changes: number
      lastRowId: number
    }

const TableNameSchema = z.object({
  name: z.string().min(1),
})

const TableColumnSchema = z.object({
  name: z.string().min(1),
  type: z.string().nullable().optional(),
})

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

function isUserTable(name: string): boolean {
  if (name.startsWith("sqlite_")) {
    return false
  }
  if (name.startsWith("_cf_")) {
    return false
  }
  if (name === "d1_migrations") {
    return false
  }
  return true
}

function formatColumn(column: z.infer<typeof TableColumnSchema>): string {
  if (column.type === null || column.type === undefined || column.type === "") {
    return column.name
  }
  return `${column.name} ${column.type}`
}

export async function tableInfo(
  db: D1Database,
  input: TableInfoInput,
): Promise<TableInfoResult> {
  const { tableName } = TableInfoInputSchema.parse(input)
  if (!isUserTable(tableName)) {
    return { error: `Table not found: ${tableName}` }
  }

  const table = await db
    .prepare(
      `SELECT sql
       FROM sqlite_master
       WHERE type = 'table' AND name = ?`,
    )
    .bind(tableName)
    .first<{ sql: string | null }>()
  if (table?.sql === null || table?.sql === undefined) {
    return { error: `Table not found: ${tableName}` }
  }

  const quotedTableName = quoteIdent(tableName)
  const [columnResult, indexResult, foreignKeyResult] = await Promise.all([
    db.prepare(`PRAGMA table_info(${quotedTableName})`).all(),
    db.prepare(`PRAGMA index_list(${quotedTableName})`).all(),
    db.prepare(`PRAGMA foreign_key_list(${quotedTableName})`).all(),
  ])
  const indexRows = indexResult.results.map((row) =>
    TableInfoIndexRowSchema.parse(row),
  )
  const indexColumnResults =
    indexRows.length === 0
      ? []
      : await db.batch(
          indexRows.map((row) =>
            db.prepare(`PRAGMA index_info(${quoteIdent(row.name)})`),
          ),
        )

  return {
    name: tableName,
    createSql: table.sql,
    columns: columnResult.results.map((resultRow) => {
      const row = TableInfoColumnRowSchema.parse(resultRow)
      return {
        position: row.cid,
        name: row.name,
        type: row.type,
        notNull: row.notnull === 1,
        defaultValue: row.dflt_value,
        primaryKeyPosition: row.pk,
      }
    }),
    indexes: indexRows.map((row, index) => ({
      name: row.name,
      unique: row.unique === 1,
      origin: row.origin,
      partial: row.partial === 1,
      columns: (indexColumnResults[index]?.results ?? []).map((resultRow) => {
        const column = TableInfoIndexColumnRowSchema.parse(resultRow)
        return { position: column.seqno, name: column.name }
      }),
    })),
    foreignKeys: foreignKeyResult.results.map((resultRow) => {
      const row = TableInfoForeignKeyRowSchema.parse(resultRow)
      return {
        id: row.id,
        sequence: row.seq,
        table: row.table,
        from: row.from,
        to: row.to,
        onUpdate: row.on_update,
        onDelete: row.on_delete,
        match: row.match,
      }
    }),
  }
}

export async function dumpD1Schema(db: D1Database): Promise<string> {
  const tables = await db
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all<{ name: string }>()
  const names = tables.results
    .map((row) => TableNameSchema.parse(row).name)
    .filter(isUserTable)

  if (names.length === 0) {
    return "(no tables)"
  }

  const results = await db.batch(
    names.map((name) => db.prepare(`PRAGMA table_info(${quoteIdent(name)})`)),
  )

  return names
    .map((name, index) => {
      const result = results[index]
      if (result === undefined) {
        throw new Error(`Missing PRAGMA table_info result for ${name}`)
      }
      const columns = result.results.map((row) =>
        formatColumn(TableColumnSchema.parse(row)),
      )
      return `${name}(${columns.join(", ")})`
    })
    .join("\n")
}

function singleStatement(sql: string): string | { error: string } {
  const withoutComments = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
  const trimmed = withoutComments.trim().replace(/;+\s*$/, "")
  if (trimmed === "") {
    return { error: "SQL is empty." }
  }
  if (trimmed.includes(";")) {
    return { error: "Only a single statement is allowed." }
  }
  return trimmed
}

function readOnlySelectSql(sql: string): string | { error: string } {
  const trimmed = singleStatement(sql)
  if (typeof trimmed !== "string") {
    return trimmed
  }
  if (!/^(WITH|SELECT)\b/i.test(trimmed)) {
    return { error: "Query must be a SELECT (or WITH ... SELECT)." }
  }
  return trimmed
}

function writeStatementSql(sql: string): string | { error: string } {
  const trimmed = singleStatement(sql)
  if (typeof trimmed !== "string") {
    return trimmed
  }
  if (/^(SELECT)\b/i.test(trimmed)) {
    return { error: "Use querySql for SELECT." }
  }
  if (/^(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(trimmed)) {
    return trimmed
  }
  if (/^WITH\b/i.test(trimmed)) {
    if (!/\b(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(trimmed)) {
      return {
        error:
          "WITH queries must include INSERT, UPDATE, DELETE, or REPLACE. Use querySql for SELECT.",
      }
    }
    return trimmed
  }
  return {
    error: "Statement must be INSERT, UPDATE, DELETE, or REPLACE.",
  }
}

export async function querySql(
  db: D1Database,
  input: QuerySqlInput,
): Promise<QuerySqlResult> {
  const sql = readOnlySelectSql(input.sql)
  if (typeof sql !== "string") {
    return sql
  }

  const limit = QUERY_SQL_MAX_ROWS + 1
  let rows: QuerySqlRow[]
  try {
    const result = await db
      .prepare(
        `SELECT * FROM (
           ${sql}
         ) AS query_sql
         LIMIT ?`,
      )
      .bind(limit)
      .all<QuerySqlRow>()
    rows = result.results
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { error: message }
  }
  const truncated = rows.length > QUERY_SQL_MAX_ROWS
  const limited = truncated ? rows.slice(0, QUERY_SQL_MAX_ROWS) : rows
  return {
    rows: limited,
    rowCount: limited.length,
    truncated,
  }
}

export async function writeSql(
  db: D1Database,
  input: WriteSqlInput,
): Promise<WriteSqlResult> {
  const sql = writeStatementSql(input.sql)
  if (typeof sql !== "string") {
    return sql
  }

  try {
    const result = await db.prepare(sql).run()
    return {
      changes: result.meta.changes,
      lastRowId: result.meta.last_row_id,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { error: message }
  }
}
