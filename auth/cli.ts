#!/usr/bin/env bun
import { resolve } from "node:path"
import { Command } from "commander"
import { generateSecret } from "@book/secrets"
import { run } from "../tooling/process"

const repoRoot = resolve(import.meta.dir, "..")
const betterAuthSchemaPath = resolve(import.meta.dir, "better-auth.schema.ts")
const referenceMigrationPath = resolve(import.meta.dir, "migration.sql")

async function genSecret(): Promise<number> {
  process.stdout.write(generateSecret())
  return 0
}

async function genMigration(): Promise<number> {
  const code = await run(
    [
      "bunx",
      "--bun",
      "auth@latest",
      "generate",
      "--yes",
      "--config",
      betterAuthSchemaPath,
      "--output",
      referenceMigrationPath,
    ],
    { cwd: repoRoot },
  )
  if (code === 0) {
    console.log(
      "Updated auth/migration.sql (reference only; apply changes manually in worker/migrations).",
    )
  }
  return code
}

const program = new Command()
  .name("bun auth")
  .description("Better Auth helpers")
  .action(() => program.outputHelp())

program.helpCommand("help [command]", "display help for command")

program
  .command("gen-secret")
  .description("Generate a BETTER_AUTH_SECRET and print it")
  .action(async () => {
    process.exitCode = await genSecret()
  })

program
  .command("gen-migration")
  .description(
    "Refresh auth/migration.sql from better-auth.schema.ts (reference only; worker migrations are manual)",
  )
  .action(async () => {
    process.exitCode = await genMigration()
  })

try {
  await program.parseAsync(process.argv)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
