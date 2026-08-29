#!/usr/bin/env bun
import { parseArgs } from "node:util"
import { resolveDeploymentContext } from "../deployment-context"
import { TWILIO_INBOUND_SMS_PATH } from "../../worker/src/channels/sms/twilio/routes"
import { sendSms } from "../../worker/src/channels/sms/outbound"
import { setupInboundSmsWebhook } from "../../worker/src/channels/sms/twilio/setup-webhook"
import { SendSmsInputSchema } from "../../worker/src/channels/sms/types"
import { requireSecrets } from "@book/secrets"
import { SMS_SECRET_NAMES } from "@book/secrets/catalog"

async function setupWebhook(): Promise<void> {
  const twilio = requireSecrets(SMS_SECRET_NAMES)
  const deployment = resolveDeploymentContext()
  const webhookUrl = new URL(
    TWILIO_INBOUND_SMS_PATH,
    deployment.origin,
  ).toString()
  console.log(`Configuring ${twilio.TWILIO_PHONE_NUMBER} → ${webhookUrl}`)
  const result = await setupInboundSmsWebhook(
    {
      accountSid: twilio.TWILIO_ACCOUNT_SID,
      apiKey: twilio.TWILIO_API_KEY,
      apiSecret: twilio.TWILIO_API_SECRET,
    },
    twilio.TWILIO_PHONE_NUMBER,
    webhookUrl,
  )
  console.log(JSON.stringify(result, null, 2))
}

async function testSend(): Promise<void> {
  const twilio = requireSecrets(SMS_SECRET_NAMES)
  const body = prompt("Message:")?.trim()
  if (!body) throw new Error("Message is required")
  const input = SendSmsInputSchema.parse({
    to: twilio.USER_PHONE_NUMBER,
    body,
  })
  const result = await sendSms(twilio, input)
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exitCode = 1
}

function usage(): void {
  console.log(`Usage: bun sms <command>

Commands:
  setup-webhook  Point the Twilio number at the current Book deployment
  test-send      Interactively send an SMS through Twilio
  help           Show this help
`)
}

const { positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  strict: true,
})

const command = positionals.at(0)
try {
  switch (command) {
    case "setup-webhook":
      await setupWebhook()
      break
    case "test-send":
      await testSend()
      break
    case undefined:
    case "help":
      usage()
      break
    default:
      throw new Error(`Unknown SMS command: ${command}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
