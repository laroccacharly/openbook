#!/usr/bin/env bun
import { Command } from "commander"
import { listAiModels, modelDisplayLine, type ModelSort } from "./ai-models"
import { loadDatabaseState, wipeDatabase } from "./d1"
import { resolveDeploymentContext } from "./deployment-context"
import {
  cloudflareZonePath,
  listCloudflareZones,
  readCloudflareZone,
  selectCloudflareZone,
  storeCloudflareZone,
} from "./cloudflare-zone"
import {
  deploymentIdPath,
  resolveDeploymentStage,
  setDeploymentId,
} from "./deployment-id"
import { runErrors, type ErrorsOptions } from "./errors"
import { analyzeLlmTaskRuntimes } from "./llm-tasks-analysis"
import { waitForUiFresh } from "./ui-freshness"
import { run } from "../tooling/process"
import { generateSecret, requireEnv } from "@book/secrets"
import { emailAddressForDomain } from "../worker/src/channels/email/config"
import Stripe from "stripe"

const infraDirectory = import.meta.dir

async function alchemy(...args: string[]): Promise<number> {
  const deployment = resolveDeploymentContext()
  return run(["bun", "alchemy", ...args], {
    cwd: infraDirectory,
    env: {
      ...process.env,
      BOOK_DEPLOYMENT_ID: deployment.deploymentId,
      BOOK_DEPLOYMENT_DOMAIN: deployment.domain,
      BOOK_DEPLOYMENT_ORIGIN: deployment.origin,
      BOOK_EMAIL_ADDRESS: emailAddressForDomain(deployment.zone.domain),
      STAGE: deployment.stage,
    },
  })
}

interface SetDeploymentIdOptions {
  force: boolean
}

function setLocalDeploymentId(
  value: string,
  options: SetDeploymentIdOptions,
): number {
  const deployment = resolveDeploymentContext(value)
  const id = setDeploymentId(value, { overwrite: options.force })
  console.log(`Deployment ID: ${id}`)
  console.log(`Alchemy stage: ${deployment.stage}`)
  console.log(`Domain: ${deployment.origin}`)
  console.log(`Stored in ${deploymentIdPath}`)
  return 0
}

function cloudflareCredentials(): { accountId: string; apiToken: string } {
  return {
    accountId: requireEnv("CLOUDFLARE_ACCOUNT_ID"),
    apiToken: requireEnv("CLOUDFLARE_API_TOKEN"),
  }
}

async function listZones(): Promise<number> {
  const selected = readCloudflareZone()
  const zones = await listCloudflareZones(cloudflareCredentials())
  for (const zone of zones) {
    const marker = selected?.zoneId === zone.zoneId ? "*" : " "
    console.log(`${marker} ${zone.domain}\t${zone.zoneId}`)
  }
  console.error(`${zones.length} zone(s); * selected`)
  return 0
}

async function setZone(value: string): Promise<number> {
  const zones = await listCloudflareZones(cloudflareCredentials())
  const zone = storeCloudflareZone(selectCloudflareZone(zones, value))
  console.log(`Cloudflare zone: ${zone.domain} (${zone.zoneId})`)
  console.log(`Stored in ${cloudflareZonePath}`)
  return 0
}

async function up(): Promise<number> {
  const code = await alchemy("deploy", "--yes")
  if (code !== 0) return code
  await waitForUiFresh(infraDirectory)
  return 0
}

interface LogsOptions {
  limit: string
  since?: string
  filter?: string
}

async function logs(options: LogsOptions): Promise<number> {
  const limit = Number.parseInt(options.limit, 10)
  if (!Number.isInteger(limit) || limit < 1 || limit > 2_000) {
    throw new Error("--limit must be an integer between 1 and 2000")
  }
  const command = ["logs", "--limit", String(limit)]
  if (options.since !== undefined) command.push("--since", options.since)
  if (options.filter !== undefined) command.push("--filter", options.filter)
  return alchemy(...command)
}

interface YesOptions {
  yes: boolean
}

async function destroy(options: YesOptions): Promise<number> {
  return alchemy("destroy", ...(options.yes ? ["--yes"] : []))
}

interface ResetDbOptions extends YesOptions {
  stage?: string
}

async function resetDb(options: ResetDbOptions): Promise<number> {
  const stage = options.stage ?? resolveDeploymentStage()
  const database = await loadDatabaseState(infraDirectory, stage)
  if (
    !options.yes &&
    !confirm(
      `Wipe D1 ${JSON.stringify(database.databaseName)} on stage ${JSON.stringify(stage)} and re-apply migrations with deploy --force?`,
    )
  ) {
    console.error("Aborted")
    return 1
  }
  const tables = await wipeDatabase(database)
  console.log(
    tables.length === 0
      ? "D1 already empty."
      : `Dropped ${tables.length} table(s): ${tables.join(", ")}`,
  )
  console.log(`Re-applying migrations via alchemy deploy --force (${stage})`)
  return alchemy("deploy", "--force", "--yes", "--stage", stage)
}

async function genApiKey(): Promise<number> {
  process.stdout.write(generateSecret())
  return 0
}

async function setupStripeWebhook(): Promise<number> {
  const secretKey = requireEnv("STRIPE_TEST_SECRET_KEY")
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("STRIPE_TEST_SECRET_KEY must be a Stripe test-mode key")
  }
  const deployment = resolveDeploymentContext()
  const webhookUrl = new URL("/stripe/webhook", deployment.origin).toString()
  const stripe = new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  })
  for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
    if (
      endpoint.url === webhookUrl &&
      endpoint.metadata.managed_by === "book" &&
      endpoint.metadata.deployment_id === deployment.deploymentId
    ) {
      await stripe.webhookEndpoints.del(endpoint.id)
      console.error(`Deleted prior Book-managed endpoint ${endpoint.id}.`)
    }
  }
  const endpoint = await stripe.webhookEndpoints.create({
    url: webhookUrl,
    enabled_events: [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.expired",
      "charge.refunded",
    ],
    metadata: {
      managed_by: "book",
      deployment_id: deployment.deploymentId,
    },
  })
  if (endpoint.secret === undefined) {
    throw new Error("Stripe did not return a webhook signing secret")
  }
  console.error(`Created ${endpoint.id} for ${webhookUrl}.`)
  process.stdout.write(endpoint.secret)
  return 0
}

interface AiModelsOptions {
  search?: string
  sort: string
  limit: string
  thirdParty: boolean
  api: boolean
  json: boolean
}

async function aiModels(options: AiModelsOptions): Promise<number> {
  if (options.sort !== "newest" && options.sort !== "score") {
    throw new Error("--sort must be newest or score")
  }
  const limit = Number.parseInt(options.limit, 10)
  if (!Number.isInteger(limit) || limit < 0)
    throw new Error("--limit must be at least 0")
  const models = await listAiModels({
    api: options.api,
    search: options.search,
    includeThirdParty: options.thirdParty,
    sort: options.sort as ModelSort,
    limit,
  })
  if (options.json) console.log(JSON.stringify(models, null, 2))
  else for (const model of models) console.log(modelDisplayLine(model))
  console.error(`${models.length} model(s)`)
  return 0
}

interface LlmTasksAnalysisOptions {
  stage?: string
  json: boolean
}

async function llmTasksAnalysis(
  options: LlmTasksAnalysisOptions,
): Promise<number> {
  const database = await loadDatabaseState(
    infraDirectory,
    options.stage ?? resolveDeploymentStage(),
  )
  const stats = await analyzeLlmTaskRuntimes(database)
  if (stats.length === 0) {
    console.error("No llm_tasks with duration_ms yet.")
    return 0
  }
  if (options.json) {
    console.log(JSON.stringify(stats, null, 2))
    return 0
  }
  console.log(
    `${"task_type".padEnd(32)} ${"count".padStart(5)} ${"mean_ms".padStart(10)} ${"median_ms".padStart(10)} ${"max_ms".padStart(10)}`,
  )
  for (const row of stats) {
    console.log(
      `${row.taskType.padEnd(32)} ${String(row.count).padStart(5)} ${row.meanMs.toFixed(1).padStart(10)} ${row.medianMs.toFixed(1).padStart(10)} ${String(row.maxMs).padStart(10)}`,
    )
  }
  return 0
}

function complete(action: () => Promise<number>): () => Promise<void> {
  return async () => {
    process.exitCode = await action()
  }
}

const program = new Command()
  .name("bun infra")
  .description("Manage the Book infrastructure")
  .action(() => program.outputHelp())
program.helpCommand("help [command]", "display help for command")

const zone = program.command("zone").description("Manage the Cloudflare zone")

zone
  .command("list")
  .description("List available Cloudflare zones")
  .action(complete(listZones))

zone
  .command("set <zone>")
  .description("Select a Cloudflare zone by domain or ID")
  .action((value: string) => complete(() => setZone(value))())

program
  .command("set-deployment-id <id>")
  .description("Set this checkout's deployment ID")
  .option("-f, --force", "overwrite the existing deployment ID")
  .action((id: string, options: SetDeploymentIdOptions) => {
    process.exitCode = setLocalDeploymentId(id, options)
  })

program
  .command("up")
  .description("Deploy and wait for the UI to become fresh")
  .action(complete(up))

for (const command of ["plan", "dev", "tail"] as const) {
  program
    .command(command)
    .description(
      command === "plan"
        ? "Show the Alchemy deployment plan"
        : command === "dev"
          ? "Run the stack in development mode"
          : "Stream live logs",
    )
    .action(complete(() => alchemy(command)))
}

program
  .command("logs")
  .description("Show recent logs")
  .option("-n, --limit <number>", "maximum number of logs", "50")
  .option("--since <time>", "only show logs since a duration or ISO timestamp")
  .option("--filter <expression>", "filter logs")
  .action(async (options: LogsOptions) => {
    process.exitCode = await logs(options)
  })

program
  .command("errors")
  .description("List uncaught Worker exceptions")
  .option("--json", "output JSON")
  .option("-n, --limit <number>", "maximum number of exceptions", "50")
  .option(
    "--since <time>",
    "only show errors since a duration or ISO timestamp",
  )
  .option("--worker <name>", "filter by Worker name")
  .action(async (options: ErrorsOptions) => {
    process.exitCode = await runErrors(options)
  })

program
  .command("destroy")
  .description("Destroy the stack")
  .option("-y, --yes", "skip the confirmation prompt")
  .action(async (options: YesOptions) => {
    process.exitCode = await destroy(options)
  })

program
  .command("reset-db")
  .description("Wipe D1 and re-apply migrations")
  .option("-y, --yes", "skip the confirmation prompt")
  .option("--stage <stage>", "deployment stage")
  .action(async (options: ResetDbOptions) => {
    process.exitCode = await resetDb(options)
  })

program
  .command("gen-api-key")
  .description("Generate a BOOK_API_KEY and print it")
  .action(complete(genApiKey))

program
  .command("setup-stripe-webhook")
  .description(
    "Create the test-mode Stripe webhook and print its signing secret",
  )
  .action(complete(setupStripeWebhook))

program
  .command("ai-models")
  .description("List Cloudflare AI models")
  .option("-q, --search <term>", "search model names and descriptions")
  .option("--sort <order>", "sort by newest or score", "newest")
  .option("-n, --limit <number>", "maximum number of models", "10")
  .option("--third-party", "include third-party models")
  .option("--api", "query the Cloudflare API")
  .option("--json", "output JSON")
  .action(async (options: AiModelsOptions) => {
    process.exitCode = await aiModels(options)
  })

program
  .command("llm-tasks-analysis")
  .description("Summarize persisted LLM task runtimes")
  .option("--stage <stage>", "deployment stage")
  .option("--json", "output JSON")
  .action(async (options: LlmTasksAnalysisOptions) => {
    process.exitCode = await llmTasksAnalysis(options)
  })

try {
  await program.parseAsync(process.argv)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
