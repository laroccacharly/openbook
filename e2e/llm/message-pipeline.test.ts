import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import {
  businessLocalToUtc,
  humanReadableDatetime,
  upcomingFridayDate,
} from "@worker/src/time"
import {
  PreferredDatetimesSchema,
  ExtractJobResultSchema,
  ExtractedCustomerInformationSchema,
  FirstPassResultSchema,
} from "@worker/src/types/llm-task-results"
import { testApiClient } from "../fixtures/api-client"
import {
  bookingAction,
  createMessagePipelineTestContext,
  dispose,
  getLastBookingForCustomer,
  llmAssert,
  type MessagePipelineTestContext,
  send,
} from "./pipeline-context"
import { requireTask } from "./poll-llm-tasks"
import { ensureFullTimeWorker, requireCatalogJob } from "./shared"

let ctx: MessagePipelineTestContext

function expectContainsDatetime(body: string, datetime: Date): void {
  const display = humanReadableDatetime(datetime, ctx.timezone)
  const withoutWeekday = display.slice(display.indexOf(", ") + 2)
  const [date, time] = withoutWeekday.split(" at ")
  expect(body).toContain(date)
  expect(body).toContain(time)
}

describe.concurrent("message classification llm", () => {
  beforeAll(async () => {
    ctx = await createMessagePipelineTestContext()
    await ensureFullTimeWorker()
  })

  afterAll(async () => {
    await dispose(ctx)
  })

  test("Question without booking intent", async () => {
    const email = `question-${randomUUID()}@doe.com`
    const turn = await send(
      ctx,
      "Hello, how long is your guarentee on your service",
      { email },
    )

    expect(bookingAction(turn)).toBeNull()
    const firstPass = FirstPassResultSchema.parse(
      requireTask(turn.tasks, "first_pass").result,
    )
    expect(firstPass.customer_questions).toHaveLength(1)

    expect(
      await llmAssert(
        ctx,
        "Does this message explain that the guarantee is exactly one year, and does it not contain a date?",
        turn.response.body,
      ),
    ).toBe(true)
  })

  test("Request and extracts empty details", async () => {
    const email = `empty-details-${randomUUID()}@doe.com`
    const turn = await send(
      ctx,
      "I'd like to book a sink repair. What is the guarentee on that?",
      { email },
    )

    expect(bookingAction(turn)).toBe("create")

    const required = ExtractedCustomerInformationSchema.parse(
      requireTask(turn.tasks, "extract_required_information").result,
    )
    expect(required.address).toBeNull()
    expect(required.customer_name).toBeNull()

    const datetimes = PreferredDatetimesSchema.parse(
      requireTask(turn.tasks, "extract_datetimes").result,
    )
    expect(datetimes.preferred_datetimes).toHaveLength(0)

    expect(turn.response.proposedDatetime).not.toBeNull()
    const readable = humanReadableDatetime(
      new Date(turn.response.proposedDatetime!),
      ctx.timezone,
    )
    expect(turn.response.body).toContain(readable)

    expect(
      await llmAssert(
        ctx,
        "Does this message contain a time/date slot and explain that the guarantee is exactly one year and asks for the customer name and address.",
        turn.response.body,
      ),
    ).toBe(true)
  })

  test("explains no availability for a past requested date", async () => {
    const email = `past-date-${randomUUID()}@doe.com`
    const turn = await send(
      ctx,
      "Please book a sink repair for my home on April 18, 2026, " +
        "at 10:00 AM at 1000 St Denis, Montreal.",
      { email },
    )

    expect(
      await llmAssert(
        ctx,
        "Does this response clearly explain that there is no availability for April 18, 2026?",
        turn.response.body,
      ),
    ).toBe(true)
  })

  test("rejects an address far from Montreal as outside_service_area", async () => {
    const email = `toronto-${randomUUID()}@doe.com`
    const turn = await send(
      ctx,
      "Hello, can you fix my sink? I live at 100 Queen Street West, Toronto, " +
        "Ontario and my name is John Doe. Are you available Friday at 10am?",
      { email },
    )

    expect(bookingAction(turn)).toBe("create")
    expect(turn.response.pipelineState).not.toBeNull()
    const pipelineState = JSON.parse(turn.response.pipelineState!) as {
      actionOutcome: { status: string }
    }
    expect(pipelineState.actionOutcome.status).toBe("outside_service_area")
    expect(turn.response.proposedDatetime).toBeNull()

    expect(
      await llmAssert(
        ctx,
        "Does this response explain that the address cannot be serviced because it is too far away?",
        turn.response.body,
      ),
    ).toBe(true)
  })

  test("extracts questions, name, and Friday preference", async () => {
    const expectedFriday = upcomingFridayDate(ctx.now, ctx.timezone)
    const email = `friday-preference-${randomUUID()}@doe.com`
    const turn = await send(
      ctx,
      "Hello, can you help me fix my sink? Can you serve in Montreal? Are you available Friday? Bob Smith. ",
      { email },
    )

    expect(bookingAction(turn)).toBe("create")
    const firstPass = FirstPassResultSchema.parse(
      requireTask(turn.tasks, "first_pass").result,
    )
    expect(firstPass.customer_questions.length).toBeGreaterThanOrEqual(1)

    const required = ExtractedCustomerInformationSchema.parse(
      requireTask(turn.tasks, "extract_required_information").result,
    )
    expect(required.address).toBeNull()
    expect(required.customer_name).toBe("Bob Smith")

    const datetimes = PreferredDatetimesSchema.parse(
      requireTask(turn.tasks, "extract_datetimes").result,
    )
    expect(datetimes.preferred_datetimes).toHaveLength(1)
    expect(datetimes.preferred_datetimes[0]).toEqual({
      date: expectedFriday,
      time: null,
    })
    expect(turn.response.proposedDatetime).not.toBeNull()
    const firstFridaySlot = new Date(turn.response.proposedDatetime!)
    expect(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: ctx.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(firstFridaySlot),
    ).toBe(expectedFriday)
    expectContainsDatetime(turn.response.body, firstFridaySlot)
    const { job } = ExtractJobResultSchema.parse(
      requireTask(turn.tasks, "extract_job").result,
    )
    expect(job).not.toBeNull()
  })

  test("refuses a service that is not in the job catalog", async () => {
    const email = `piano-${randomUUID()}@doe.com`
    const turn = await send(
      ctx,
      "Please book a piano tuning for Friday at 10am. " +
        "My name is Jane Doe and my address is 2000 St Denis, Montreal.",
      { email },
    )

    expect(bookingAction(turn)).toBe("create")

    const { job } = ExtractJobResultSchema.parse(
      requireTask(turn.tasks, "extract_job").result,
    )
    expect(job).toBeNull()
    expect(turn.response.proposedDatetime).toBeNull()

    expect(
      await llmAssert(
        ctx,
        "Does this response politely say that piano tuning (or that service) is not offered, without asking for name or address and without offering a booking time?",
        turn.response.body,
      ),
    ).toBe(true)
  })

  test("offers but does not book the first slot for a date-only request", async () => {
    const expectedFriday = upcomingFridayDate(ctx.now, ctx.timezone)
    const email = `date-only-${randomUUID()}@doe.com`
    const turn = await send(
      ctx,
      "Hello, can you fix my sink? My name is Jane Doe and my address is " +
        "2000 St Denis, Montreal. Are you available Friday?",
      { email },
    )

    expect(bookingAction(turn)).toBe("create")
    expect(turn.response.proposedDatetime).not.toBeNull()
    const offeredSlot = new Date(turn.response.proposedDatetime!)
    expect(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: ctx.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(offeredSlot),
    ).toBe(expectedFriday)
    expectContainsDatetime(turn.response.body, offeredSlot)

    const customer = await testApiClient.getCustomerByEmail(email)
    const bookings = (await testApiClient.listBookings()).filter(
      (booking) => booking.customerId === customer.id,
    )
    expect(bookings).toHaveLength(0)
  })

  test("creates a customer and booking when all details are present", async () => {
    const timezone = ctx.timezone
    const expectedFriday = upcomingFridayDate(ctx.now, timezone)
    const expectedStart = businessLocalToUtc(expectedFriday, "10:00", timezone)
    const email = `john-${randomUUID()}@doe.com`

    const turn = await send(
      ctx,
      "Hello, can you fix my sink? I live at 1000 St Denis, Montreal " +
        "and my name is John Doe. Are you available Friday at 10am?",
      { email },
    )

    expect(bookingAction(turn)).toBe("create")

    const required = ExtractedCustomerInformationSchema.parse(
      requireTask(turn.tasks, "extract_required_information").result,
    )
    expect(required.customer_name).toBe("John Doe")
    expect(required.address).not.toBeNull()

    const datetimes = PreferredDatetimesSchema.parse(
      requireTask(turn.tasks, "extract_datetimes").result,
    )
    expect(datetimes.preferred_datetimes).toContainEqual({
      date: expectedFriday,
      time: "10:00",
    })

    const sink = await requireCatalogJob("Replacing/fixing sinks")
    const { job } = ExtractJobResultSchema.parse(
      requireTask(turn.tasks, "extract_job").result,
    )
    expect(job).not.toBeNull()
    expect(job!.duration_minutes).toBe(sink.durationMinutes)
    expect(job!.estimated_price).toBe(sink.estimatedPriceCents)
    expect(job!.worker_count).toBe(sink.workerCount)

    const booking = await getLastBookingForCustomer(ctx, email)
    const customer = await testApiClient.getCustomerByEmail(email)
    expect(customer.email).toBe(email)
    expect(customer.name).toBe("John Doe")
    expect(booking.startDatetime).toBe(expectedStart.toISOString())
    expect(booking.estimatedPrice).toBe(sink.estimatedPriceCents)
    expect(booking.workerIds).toHaveLength(1)
    expect(turn.response.body).toMatch(/https:\/\/[^\s]+\/b\/[A-Za-z0-9_-]{16}/)
  })
})
