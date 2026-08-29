import type { D1Database } from "@cloudflare/workers-types"
import {
  tool,
  type InferUITools,
  type Tool,
  type UIDataTypes,
  type UIMessage,
} from "ai"
import {
  type QuerySqlInput,
  QuerySqlInputSchema,
  type QuerySqlResult,
  querySql,
  type TableInfoInput,
  TableInfoInputSchema,
  type TableInfoResult,
  tableInfo,
  type WriteSqlInput,
  WriteSqlInputSchema,
  type WriteSqlResult,
  writeSql,
} from "./sql"

export type ChatTools = {
  querySql: Tool<QuerySqlInput, QuerySqlResult>
  tableInfo: Tool<TableInfoInput, TableInfoResult>
  writeSql: Tool<WriteSqlInput, WriteSqlResult>
}

export function createChatTools(db: D1Database): ChatTools {
  return {
    querySql: tool({
      description:
        "Run a read-only SQLite SELECT and return raw rows. Use for counts, joins, lookups, and filters. Rows are capped; if truncated, add LIMIT or aggregate.",
      inputSchema: QuerySqlInputSchema,
      execute: async (input) => querySql(db, input),
    }),
    tableInfo: tool({
      description:
        "Inspect one database table. Returns its CREATE SQL, columns including null/default/primary-key details, indexes, unique constraints, and foreign keys. Use when you need more detail than the schema summary provides.",
      inputSchema: TableInfoInputSchema,
      execute: async (input) => tableInfo(db, input),
    }),
    writeSql: tool({
      description:
        "Run a single SQLite INSERT, UPDATE, DELETE, or REPLACE. Call only after the user has confirmed the exact change in this conversation.",
      inputSchema: WriteSqlInputSchema,
      execute: async (input) => writeSql(db, input),
    }),
  }
}

export type ChatUIMessage = UIMessage<
  unknown,
  UIDataTypes,
  InferUITools<ChatTools>
>

export type ChatMessagePart = ChatUIMessage["parts"][number]
