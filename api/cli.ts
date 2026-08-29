#!/usr/bin/env bun
import { Command } from "commander"
import { callApiMethod, parseCallArgs } from "./call"
import { createLiveApiClient } from "./client"
import { readExecCode, runExecCode } from "./exec"
import { listApiClientMethodNames } from "./methods"

interface ExecOptions {
  file?: string
  origin?: string
}

interface CallOptions {
  args?: string
  origin?: string
}

interface MethodsOptions {
  json: boolean
}

async function printApiResult(origin: string, result: unknown): Promise<void> {
  console.error(`origin: ${origin}`)
  if (result !== undefined) {
    console.log(JSON.stringify(result, null, 2))
  }
}

async function exec(
  code: string | undefined,
  options: ExecOptions,
): Promise<number> {
  const userCode = await readExecCode(code, options.file)
  const { client, origin } = await createLiveApiClient({
    origin: options.origin,
  })

  const result = await runExecCode(userCode, client)
  await printApiResult(origin, result)

  return 0
}

async function call(method: string, options: CallOptions): Promise<number> {
  const args = parseCallArgs(options.args ?? "[]")
  const { client, origin } = await createLiveApiClient({
    origin: options.origin,
  })

  const result = await callApiMethod(method, args, client)
  await printApiResult(origin, result)

  return 0
}

async function methods(options: MethodsOptions): Promise<number> {
  const names = listApiClientMethodNames()

  if (options.json) {
    console.log(JSON.stringify(names, null, 2))
    return 0
  }

  for (const name of names) {
    console.log(name)
  }

  return 0
}

const program = new Command()
  .name("bun api")
  .description("Call the live Book REST API with auth and origin preconfigured")
  .addHelpText(
    "after",
    `
Examples:
  bun api methods
  bun api call listBookings
  bun api call getBooking --args 2
  bun api call getWorkflow --args '["booking", 2]'
  bun api exec 'api.listBookings()'

Call invokes one api client method with JSON arguments. Exec runs arbitrary
JavaScript — prefer call when a single method is enough. Bearer auth and
deployment origin are configured automatically from secrets and
infra/deployment-id.`,
  )
  .action(() => program.outputHelp())

program.helpCommand("help [command]", "display help for command")

program
  .command("call <method>")
  .description("Call one api client method with JSON arguments")
  .option("--args <json>", "JSON value or array of method arguments", "[]")
  .option("--origin <url>", "override deployment origin")
  .action(async (method: string, options: CallOptions) => {
    process.exitCode = await call(method, options)
  })

program
  .command("exec [code]")
  .description("Run JavaScript against the live Book API client")
  .option("-f, --file <path>", "read code from a file")
  .option("--origin <url>", "override deployment origin")
  .action(async (code: string | undefined, options: ExecOptions) => {
    process.exitCode = await exec(code, options)
  })

program
  .command("methods")
  .description("List api client methods")
  .option("--json", "output JSON")
  .action(async (options: MethodsOptions) => {
    process.exitCode = await methods(options)
  })

try {
  await program.parseAsync(process.argv)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
