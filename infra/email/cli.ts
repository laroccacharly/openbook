#!/usr/bin/env bun
import { Command } from "commander"
import { requireSecrets } from "@book/secrets"
import {
  DEPLOYMENT_SECRET_NAMES,
  EMAIL_SECRET_NAMES,
} from "@book/secrets/catalog"
import {
  SendEmailInputSchema,
  SendEmailResultSchema,
} from "../../worker/src/channels/email/types"
import { emailAddressForDomain } from "../../worker/src/channels/email/config"
import { resolveDeploymentContext } from "../deployment-context"
import { resolveDeploymentStage } from "../deployment-id"
import { loadWorkerState } from "../worker-state"
import { inspectInboundEmailRouting, setupInboundEmailRouting } from "./routing"

const infraDirectory = new URL("..", import.meta.url).pathname

async function routingContext() {
  const secrets = requireSecrets([
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
  ] as const satisfies readonly (typeof DEPLOYMENT_SECRET_NAMES)[number][])
  const deployment = resolveDeploymentContext()
  const worker = await loadWorkerState(infraDirectory, resolveDeploymentStage())
  return {
    credentials: {
      apiToken: secrets.CLOUDFLARE_API_TOKEN,
      accountId: secrets.CLOUDFLARE_ACCOUNT_ID,
    },
    target: {
      zoneName: deployment.zone.domain,
      address: emailAddressForDomain(deployment.zone.domain),
      workerName: worker.workerName,
    },
  }
}

async function inboundStatus(): Promise<void> {
  const { credentials, target } = await routingContext()
  const status = await inspectInboundEmailRouting(credentials, target)
  console.log(
    JSON.stringify(
      {
        address: status.address,
        configured: status.rule !== null,
        enabled: status.rule?.enabled ?? false,
        actions: status.rule?.actions ?? [],
        targetWorker: target.workerName,
      },
      null,
      2,
    ),
  )
}

async function setupInbound(options: { yes: boolean }): Promise<void> {
  const { credentials, target } = await routingContext()
  if (
    !options.yes &&
    !confirm(
      `Route ${target.address} to the current Book Worker ${target.workerName}?`,
    )
  ) {
    console.error("Aborted")
    process.exitCode = 1
    return
  }
  const result = await setupInboundEmailRouting(credentials, target)
  console.log(JSON.stringify(result, null, 2))
}

async function testSend(): Promise<void> {
  const subject = prompt("Subject:")?.trim()
  if (!subject) throw new Error("Subject is required")

  const text = prompt("Body:")?.trim()
  if (!text) throw new Error("Body is required")

  const secrets = requireSecrets([
    "BOOK_API_KEY",
    ...EMAIL_SECRET_NAMES,
  ] as const)
  const input = SendEmailInputSchema.parse({
    to: secrets.USER_EMAIL,
    subject,
    text,
  })
  const deployment = resolveDeploymentContext()
  const response = await fetch(new URL("/api/email/send", deployment.origin), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secrets.BOOK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  })
  const payload: unknown = await response.json()
  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload !== null && "error" in payload
        ? JSON.stringify(payload.error)
        : response.statusText
    throw new Error(`Email send failed (${response.status}): ${detail}`)
  }
  const result = SendEmailResultSchema.parse(payload)
  console.log(JSON.stringify(result, null, 2))
}

const program = new Command()
  .name("bun email")
  .description("Manage the Book email channel")
  .action(() => program.outputHelp())
program.helpCommand("help [command]", "display help for command")

program
  .command("test-send")
  .description(
    "Interactively send an email through the current Book deployment",
  )
  .action(testSend)

program
  .command("inbound-status")
  .description("Show the inbound route and current Book Worker target")
  .action(inboundStatus)

program
  .command("setup-inbound")
  .description("Route the Book email address to the current deployment")
  .option("-y, --yes", "skip the cutover confirmation", false)
  .action(setupInbound)

try {
  await program.parseAsync(process.argv)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
