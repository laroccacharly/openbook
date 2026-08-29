import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { businessLocalToUtc } from "@worker/src/time"
import { ExtractJobResultSchema } from "@worker/src/types/llm-task-results"
import { testApiClient } from "../fixtures/api-client"
import {
  type BusinessDate,
  bookingAction,
  businessDate,
  createMessagePipelineTestContext,
  dispose,
  getLastBookingForCustomer,
  llmAssert,
  type MessagePipelineTestContext,
  send,
} from "./pipeline-context"
import { pollUntil, requireTask } from "./poll-llm-tasks"
import { ensureFullTimeWorker, requireCatalogJob } from "./shared"

describe("message conversation llm", () => {
  let ctx: MessagePipelineTestContext
  let tomorrow: BusinessDate
  let offDay: BusinessDate
  let onDay: BusinessDate

  beforeAll(async () => {
    ctx = await createMessagePipelineTestContext({
      email: `conversation-${randomUUID()}@doe.com`,
    })
    // FIXED_NOW is Monday → tomorrow Tue, Wed off, Thu on.
    tomorrow = businessDate(ctx, 1)
    offDay = businessDate(ctx, 2)
    onDay = businessDate(ctx, 3)

    await ensureFullTimeWorker()
    // Block Wednesday on every worker so other tests' full-time workers
    // cannot accept the off-day reschedule. Timeoff create is idempotent
    // (skips when the worker already has an overlapping window).
    const workers = await testApiClient.listWorkers()
    for (const worker of workers) {
      await testApiClient.createWorkerDayOff(worker.id, { date: offDay.date })
    }
  })

  afterAll(async () => {
    await dispose(ctx)
  })

  test("books, fails reschedule on day off, reschedules, then cancels", async () => {
    await send(
      ctx,
      "Can you fix my hot water heater? Are you available tomorrow?",
    )

    const booked = await send(
      ctx,
      "9am works. My address is 1000 St Denis, Montreal. " +
        "My name is John Doe.",
    )
    expect(bookingAction(booked)).toBe("create")
    const heater = await requireCatalogJob("Fixing hot water heaters")
    const { job } = ExtractJobResultSchema.parse(
      requireTask(booked.tasks, "extract_job").result,
    )
    expect(job).not.toBeNull()
    expect(job!.estimated_price).toBe(heater.estimatedPriceCents)
    expect(job!.duration_minutes).toBe(heater.durationMinutes)

    const booking = await getLastBookingForCustomer(ctx)
    expect(booking.startDatetime).toBe(
      businessLocalToUtc(tomorrow.date, "09:00", ctx.timezone).toISOString(),
    )
    expect(booking.estimatedPrice).toBe(heater.estimatedPriceCents)

    const blockedReschedule = await send(
      ctx,
      `Can you reschedule for ${offDay.weekday} 9AM?`,
    )
    expect(bookingAction(blockedReschedule)).toBe("reschedule")
    const stillOriginal = await testApiClient.getBooking(booking.id)
    expect(stillOriginal.rescheduledAt).toBeNull()
    expect(stillOriginal.startDatetime).toBe(
      businessLocalToUtc(tomorrow.date, "09:00", ctx.timezone).toISOString(),
    )

    const rescheduled = await send(ctx, `What about ${onDay.weekday} at 1pm?`)
    expect(bookingAction(rescheduled)).toBe("reschedule")
    await pollUntil(async () => {
      const updated = await testApiClient.getBooking(booking.id)
      expect(updated.rescheduledAt).not.toBeNull()
      expect(updated.startDatetime).toBe(
        businessLocalToUtc(onDay.date, "13:00", ctx.timezone).toISOString(),
      )
      return updated
    })

    const cancelled = await send(ctx, "Please cancel my booking")
    expect(bookingAction(cancelled)).toBe("cancel")
    await pollUntil(async () => {
      const updated = await testApiClient.getBooking(booking.id)
      expect(updated.cancelledAt).not.toBeNull()
      return updated
    })
  }, 300_000)

  test("picks second preferred time when first is unavailable", async () => {
    // Customer offers options in one message: Wednesday 9am (unavailable),
    // Wednesday 1pm (same), then Thursday 1pm (free). Prefer chronologically
    // and book Thursday.
    const email = `preferred-time-${randomUUID()}@doe.com`
    const turn = await send(
      ctx,
      "Hi, can you fix my sink? I live at 1000 St Denis, Montreal " +
        "and my name is John Doe. Are you available " +
        `${offDay.weekday} at 9am, 1pm or ${onDay.weekday} at 1pm?`,
      { email },
    )
    expect(bookingAction(turn)).toBe("create")

    const booking = await getLastBookingForCustomer(ctx, email)
    expect(booking.startDatetime).toBe(
      businessLocalToUtc(onDay.date, "13:00", ctx.timezone).toISOString(),
    )
  })

  test("books the proposed slot when the customer replies that it works", async () => {
    const email = `accept-proposal-${randomUUID()}@doe.com`
    const proposal = await send(
      ctx,
      "Hi, can you fix my sink? My name is Jane Doe and my address is " +
        "2000 St Denis, Montreal. What times are available?",
      { email },
    )
    expect(proposal.response.proposedDatetime).not.toBeNull()

    const accepted = await send(ctx, "Okay, that works.", { email })
    expect(bookingAction(accepted)).toBe("create")

    const booking = await getLastBookingForCustomer(ctx, email)
    expect(booking.startDatetime).toBe(proposal.response.proposedDatetime)
  })

  test("offers the next slot when the proposed slot is taken before acceptance", async () => {
    const email = `stale-proposal-${randomUUID()}@doe.com`
    const proposal = await send(
      ctx,
      "Hi, can you fix my sink? My name is Jane Doe and my address is " +
        "2000 St Denis, Montreal. What times are available?",
      { email },
    )
    expect(proposal.response.proposedDatetime).not.toBeNull()

    const proposedStart = new Date(proposal.response.proposedDatetime!)
    const proposedEnd = new Date(proposedStart.getTime() + 60 * 60_000)
    const workers = await testApiClient.listWorkers()
    const competing = await testApiClient.createBooking({
      workerIds: workers.map((worker) => worker.id),
      startDatetime: proposedStart.toISOString(),
      endDatetime: proposedEnd.toISOString(),
      description: "Competing booking",
    })
    ctx.createdBookingIds.push(competing.booking.id)

    const accepted = await send(ctx, "Okay, that works.", { email })
    expect(bookingAction(accepted)).toBe("create")
    expect(accepted.response.proposedDatetime).not.toBeNull()
    expect(accepted.response.proposedDatetime).not.toBe(
      proposal.response.proposedDatetime,
    )
    expect(
      new Date(accepted.response.proposedDatetime!).getTime(),
    ).toBeGreaterThan(proposedStart.getTime())
    expect(
      await llmAssert(
        ctx,
        "Does this reply explain that the previously offered appointment is no longer available and offer a different appointment time?",
        accepted.response.body,
      ),
    ).toBe(true)

    const customer = await testApiClient.getCustomerByEmail(email)
    const customerBookings = (await testApiClient.listBookings()).filter(
      (booking) => booking.customerId === customer.id,
    )
    expect(customerBookings).toHaveLength(0)
  })
})
