#!/usr/bin/env bun
import { resolve } from "node:path"
import { run, runOrExit } from "./process"
import { requireSecrets, type SecretName } from "@book/secrets"

const repoRoot = resolve(import.meta.dir, "..")

async function setupPlaywright(): Promise<number> {
  return run(["bunx", "playwright", "install", "chromium"], {
    cwd: resolve(repoRoot, "e2e"),
  })
}

const testSuites = ["unit", "coverage", "ui", "llm"] as const
type TestSuite = (typeof testSuites)[number]

function isTestSuite(value: string | undefined): value is TestSuite {
  return (
    value !== undefined && (testSuites as readonly string[]).includes(value)
  )
}

async function test(args: string[]): Promise<never> {
  const suite = args.at(0)
  const filters = args.slice(1)
  const secretsBySuite: Partial<Record<TestSuite, readonly SecretName[]>> = {
    ui: ["BOOK_API_KEY", "ADMIN_PASSWORD", "STRIPE_TEST_SECRET_KEY"],
    llm: ["BOOK_API_KEY"],
  }
  if (args.length === 0 || !isTestSuite(suite)) {
    console.error(
      "Usage: bun run test <unit|coverage|ui|llm> [filters] [-t pattern]",
    )
    process.exit(1)
  }

  const command = ["bun", "run", suite]
  const testNameIndex = filters.findIndex(
    (value) => value === "-t" || value === "--test-name-pattern",
  )
  if (testNameIndex >= 0) {
    const pattern = filters.at(testNameIndex + 1)
    if (pattern === undefined) {
      console.error(`${filters[testNameIndex]} requires a pattern`)
      process.exit(1)
    }
    filters.splice(testNameIndex, 2)
    command.push(
      ...filters,
      suite === "ui" ? "--grep" : "--testNamePattern",
      pattern,
    )
  } else {
    command.push(...filters)
  }

  const requiredSecrets = secretsBySuite[suite]
  if (requiredSecrets !== undefined) requireSecrets(requiredSecrets)
  const directory = suite === "ui" || suite === "llm" ? "e2e" : "worker"
  return runOrExit(command, { cwd: resolve(repoRoot, directory) })
}

const [command, ...args] = process.argv.slice(2)
switch (command) {
  case "setup:playwright":
    process.exit(await setupPlaywright())
    break
  case "test":
    await test(args)
    break
  default:
    console.error("Usage: bun tooling/cli.ts <setup:playwright|test>")
    process.exit(1)
}
