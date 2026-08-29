import type { Configuration } from "@worker/src/db/configuration"
import type { ApiBooking } from "@worker/src/api-client"
import type { LlmTask } from "@worker/src/types/llm-task"
import {
  type BookingAction,
  FirstPassResultSchema,
} from "@worker/src/types/llm-task-results"
import { testApiClient } from "../fixtures/api-client"
import { pollLlmTasks, pollUntil, requireTask } from "./poll-llm-tasks"
import {
  setupConfiguration,
  FIXED_NOW,
  LANGUAGE_MODEL_ID,
  restoreConfiguration,
} from "./shared"

export type BusinessDate = { date: string; weekday: string }

export type MessagePipelineTestContextOptions = {
  languageModelId?: string
  email?: string
  now?: Date
}

export type MessagePipelineTestContext = {
  languageModelId: string
  timezone: string
  now: Date
  email: string | undefined
  usedEmails: string[]
  originalConfiguration: Configuration
  createdBookingIds: number[]
  initialBookingIds: number[]
}

export type SendMessageOptions = {
  email?: string
}

export type SendMessageResult = {
  messageId: number
  tasks: LlmTask[]
  response: Awaited<ReturnType<typeof testApiClient.getMessageResponse>>
}

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

/** Civil date `days` after `ctx.now` in the business timezone, with weekday name. */
export function businessDate(
  ctx: MessagePipelineTestContext,
  days: number,
): BusinessDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ctx.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ctx.now)
  const value = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((entry) => entry.type === type)
    if (part === undefined) {
      throw new Error(`Missing date part: ${type}`)
    }
    return part.value
  }

  const civil = new Date(
    Date.UTC(
      Number(value("year")),
      Number(value("month")) - 1,
      Number(value("day")) + days,
    ),
  )
  return {
    date: `${civil.getUTCFullYear()}-${pad2(civil.getUTCMonth() + 1)}-${pad2(civil.getUTCDate())}`,
    weekday: new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "long",
    }).format(civil),
  }
}

/**
 * Client-side test harness for the message pipeline.
 * Applies LLM test configuration; call `dispose` in afterAll to restore config.
 * `now` is forwarded on every `send()` so the deployed worker uses a fixed clock.
 */
export async function createMessagePipelineTestContext(
  options?: MessagePipelineTestContextOptions,
): Promise<MessagePipelineTestContext> {
  const originalConfiguration = await setupConfiguration()
  const initialBookings = await testApiClient.listBookings()
  return {
    languageModelId: options?.languageModelId ?? LANGUAGE_MODEL_ID,
    timezone: originalConfiguration.timezone,
    now: options?.now ?? FIXED_NOW,
    email: options?.email,
    usedEmails: options?.email === undefined ? [] : [options.email],
    originalConfiguration,
    createdBookingIds: [],
    initialBookingIds: initialBookings.map((booking) => booking.id),
  }
}

export async function dispose(ctx: MessagePipelineTestContext): Promise<void> {
  const initialBookingIds = new Set(ctx.initialBookingIds)
  const bookingIdsToDelete = new Set(ctx.createdBookingIds)
  const currentBookings = await testApiClient.listBookings()
  for (const booking of currentBookings) {
    if (!initialBookingIds.has(booking.id)) {
      bookingIdsToDelete.add(booking.id)
    }
  }
  for (const bookingId of bookingIdsToDelete) {
    await testApiClient.deleteBooking(bookingId)
  }

  const emails = new Set(ctx.usedEmails)
  const customers = await testApiClient.listCustomers()
  for (const customer of customers) {
    if (customer.email === null || !emails.has(customer.email)) {
      continue
    }
    await testApiClient.deleteCustomer(customer.id)
  }

  await restoreConfiguration(ctx.originalConfiguration)
}

export function bookingAction(turn: SendMessageResult): BookingAction | null {
  return FirstPassResultSchema.parse(
    requireTask(turn.tasks, "first_pass").result,
  ).booking_action
}

/** Judges `text` against `prompt` using the context model. */
export async function llmAssert(
  ctx: MessagePipelineTestContext,
  prompt: string,
  text: string,
): Promise<boolean> {
  const { result } = await testApiClient.llmAssert({
    prompt,
    text,
    languageModelId: ctx.languageModelId,
  })
  return result
}

/** Polls until the customer has exactly one booking, then returns it. */
export async function getLastBookingForCustomer(
  ctx: MessagePipelineTestContext,
  email?: string,
): Promise<ApiBooking> {
  const address = email ?? ctx.email
  if (address === undefined) {
    throw new Error("email is required")
  }

  const booking = await pollUntil(
    async () => {
      const customer = await testApiClient.getCustomerByEmail(address)
      const bookings = (await testApiClient.listBookings()).filter(
        (entry) => entry.customerId === customer.id,
      )
      if (bookings.length !== 1) {
        throw new Error(
          `Expected 1 booking for ${address}, got ${bookings.length}`,
        )
      }
      return bookings[0]!
    },
    {
      timeoutMessage: `Timed out waiting for booking for ${address}`,
    },
  )
  ctx.createdBookingIds.push(booking.id)
  return booking
}

/**
 * Posts a message through ingestCustomerMessage, waits for the pipeline
 * to finish composing and auto-approving a response, prints the response, and
 * returns the turn result.
 */
export async function send(
  ctx: MessagePipelineTestContext,
  message: string,
  options?: SendMessageOptions,
): Promise<SendMessageResult> {
  const address = options?.email ?? ctx.email
  if (address === undefined) {
    throw new Error("email is required")
  }
  if (!ctx.usedEmails.includes(address)) {
    ctx.usedEmails.push(address)
  }
  const { id: messageId } = await testApiClient.ingestCustomerMessage({
    message,
    channel: "email",
    address,
    languageModelId: ctx.languageModelId,
    now: ctx.now.toISOString(),
  })

  const tasks = await pollLlmTasks(messageId, (pending) => {
    requireTask(pending, "compose_response")
  })

  const response = await pollUntil(
    async () => {
      const messageResponse = await testApiClient.getMessageResponse(messageId)
      if (messageResponse.body.length === 0) {
        throw new Error(`Empty response for message ${messageId}`)
      }
      return messageResponse
    },
    {
      timeoutMessage: `Timed out waiting for response on message ${messageId}`,
    },
  )

  console.log(
    `\n--- customer ---\n${message}\n--- response ---\n${response.body}\n`,
  )

  return { messageId, tasks, response }
}
