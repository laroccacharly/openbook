import { NonRetryableError } from "cloudflare:workflows"
import type { WorkerEnv } from "@infra/alchemy.run"
import { replyEmailSubject } from "../channels/email/inbound"
import { sendEmail } from "../channels/email/outbound"
import { sendSms } from "../channels/sms/outbound"
import { TwilioSendEnvironmentSchema } from "../channels/sms/twilio/schemas"
import {
  getMessageDelivery,
  type MessageDelivery,
} from "../db/message-deliveries"
import { recordMessageDeliveryReceipt } from "../db/message-delivery-receipts"
import { updateWorkflow } from "../db/workflows"
import { messageDeliveryWorkflowRecord } from "./workflow-start"

export type MessageDeliveryEnvironment = Pick<
  WorkerEnv,
  | "BOOK_EMAIL_ADDRESS"
  | "DB"
  | "EMAIL"
  | "TWILIO_ACCOUNT_SID"
  | "TWILIO_API_KEY"
  | "TWILIO_API_SECRET"
  | "TWILIO_PHONE_NUMBER"
>

async function deliverSms(
  env: MessageDeliveryEnvironment,
  messageResponseId: number,
  record: ReturnType<typeof messageDeliveryWorkflowRecord>,
  delivery: MessageDelivery,
): Promise<{ messageResponseId: number; providerMessageId: string }> {
  const twilio = TwilioSendEnvironmentSchema.safeParse(env)
  if (!twilio.success) {
    throw new NonRetryableError("SMS delivery is not configured")
  }

  const outcome = await sendSms(twilio.data, {
    to: delivery.contactMethod.address,
    body: delivery.body,
  })
  if (!outcome.ok) {
    throw new Error(outcome.error)
  }
  await recordMessageDeliveryReceipt(env.DB, {
    messageResponseId,
    provider: "twilio",
    providerMessageId: outcome.sid,
    providerStatus: outcome.status,
  })
  await updateWorkflow(env.DB, record, { status: "completed" })
  return { messageResponseId, providerMessageId: outcome.sid }
}

async function deliverEmail(
  env: MessageDeliveryEnvironment,
  messageResponseId: number,
  record: ReturnType<typeof messageDeliveryWorkflowRecord>,
  delivery: MessageDelivery,
): Promise<{ messageResponseId: number; providerMessageId: string }> {
  const outcome = await sendEmail(env, {
    to: delivery.contactMethod.address,
    subject: replyEmailSubject(delivery.inboundMessage),
    text: delivery.body,
  })
  if (!outcome.ok) {
    throw new Error(outcome.error)
  }
  await recordMessageDeliveryReceipt(env.DB, {
    messageResponseId,
    provider: "cloudflare",
    providerMessageId: outcome.messageId,
    providerStatus: "sent",
  })
  await updateWorkflow(env.DB, record, { status: "completed" })
  return { messageResponseId, providerMessageId: outcome.messageId }
}

export async function deliverMessage(
  env: MessageDeliveryEnvironment,
  messageResponseId: number,
): Promise<{ messageResponseId: number; providerMessageId: string }> {
  const record = messageDeliveryWorkflowRecord(messageResponseId)
  await updateWorkflow(env.DB, record, {
    status: "running",
    stage: "sending",
  })
  const delivery = await getMessageDelivery(env.DB, messageResponseId)
  if (delivery === null) {
    throw new NonRetryableError(
      `Message response ${messageResponseId} not found`,
    )
  }

  const channel = delivery.contactMethod.channel
  switch (channel) {
    case "sms":
      return deliverSms(env, messageResponseId, record, delivery)
    case "email":
      return deliverEmail(env, messageResponseId, record, delivery)
    default: {
      const unexpected: never = channel
      throw new NonRetryableError(
        `Message delivery does not support ${String(unexpected)}`,
      )
    }
  }
}
