import { env } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import { tableInfo } from "@worker/src/chat/sql"

describe("tableInfo", () => {
  test("returns columns and constraints for a user table", async () => {
    const result = await tableInfo(env.DB, { tableName: "job_catalog" })
    if ("error" in result) {
      throw new Error(result.error)
    }

    expect(result.name).toBe("job_catalog")
    expect(result.createSql).toContain("name TEXT NOT NULL UNIQUE")
    expect(result.createSql).toContain("CHECK (duration_minutes > 0)")
    expect(result.columns).toEqual([
      {
        position: 0,
        name: "id",
        type: "INTEGER",
        notNull: false,
        defaultValue: null,
        primaryKeyPosition: 1,
      },
      {
        position: 1,
        name: "name",
        type: "TEXT",
        notNull: true,
        defaultValue: null,
        primaryKeyPosition: 0,
      },
      {
        position: 2,
        name: "estimated_price_cents",
        type: "INTEGER",
        notNull: true,
        defaultValue: null,
        primaryKeyPosition: 0,
      },
      {
        position: 3,
        name: "duration_minutes",
        type: "INTEGER",
        notNull: true,
        defaultValue: null,
        primaryKeyPosition: 0,
      },
      {
        position: 4,
        name: "worker_count",
        type: "INTEGER",
        notNull: true,
        defaultValue: null,
        primaryKeyPosition: 0,
      },
    ])
    expect(result.indexes).toEqual([
      expect.objectContaining({
        unique: true,
        columns: [{ position: 0, name: "name" }],
      }),
    ])
    expect(result.foreignKeys).toEqual([])
  })

  test("supports tables without indexes", async () => {
    const result = await tableInfo(env.DB, { tableName: "configuration" })
    expect(result).toMatchObject({ name: "configuration", indexes: [] })
  })

  test.each(["missing_table", "sqlite_sequence", "d1_migrations"])(
    "rejects unavailable table %s",
    async (tableName) => {
      await expect(tableInfo(env.DB, { tableName })).resolves.toEqual({
        error: `Table not found: ${tableName}`,
      })
    },
  )
})
