import { Hono } from "hono"
import { validator } from "hono/validator"
import { z } from "zod"
import type { WorkerEnv } from "@infra/alchemy.run"
import { createBookingWithSync, deleteBookingWithSync } from "../booking-flow"
import { getConfiguration } from "../db/configuration"
import { getBookingById, getBookings } from "../db/bookings"
import {
  getBookingPaymentSummaries,
  getBookingPaymentSummary,
  listBookingAmountsDue,
} from "../db/payments"
import { getLlmTasks, getLlmTasksByMessageId } from "../db/llm-tasks"
import type { GoogleCalendarCredentials } from "../google-calendar/google-calendar"
import {
  getGoogleCalendarSyncStatus,
  GoogleCalendarSyncError,
  retryGoogleCalendarDeletion,
  retryGoogleCalendarSync,
} from "../google-calendar/google-calendar-sync"
import { CreateBookingInputSchema } from "../types"
import { EnableBalanceDueInputSchema } from "../types/payment"
import { BalanceDueError, enableBalanceDue } from "../stripe/balance-due"
import { createStripeAdapter } from "../stripe/adapter"

function googleCredentials(env: WorkerEnv): GoogleCalendarCredentials {
  return {
    clientId: env.BOOK_GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: env.BOOK_GOOGLE_OAUTH_CLIENT_SECRET,
  }
}

function balanceDueErrorStatus(error: BalanceDueError): 404 | 409 {
  switch (error.reason) {
    case "not_found":
      return 404
    case "cancelled":
    case "invalid_price":
    case "price_below_paid":
      return 409
    default: {
      const exhaustive: never = error.reason
      throw new Error(`Unhandled balance-due failure: ${String(exhaustive)}`)
    }
  }
}

function parseBookingId(raw: string): number | null {
  if (raw === "") {
    return null
  }
  const id = Number(raw)
  if (!Number.isInteger(id)) {
    return null
  }
  return id
}

function syncErrorStatus(error: GoogleCalendarSyncError): 404 | 409 {
  switch (error.reason) {
    case "booking_not_found":
    case "no_association":
      return 404
    case "booking_deleted":
    case "not_connected":
    case "ineligible_state":
    case "claim_conflict":
      return 409
    default: {
      const exhaustive: never = error.reason
      throw new Error(`Unhandled sync failure: ${String(exhaustive)}`)
    }
  }
}

export const bookingRouter = new Hono<{ Bindings: WorkerEnv }>()
  .get("/bookings", async (c) => {
    const bookings = await getBookings(c.env.DB)
    const payments = await getBookingPaymentSummaries(
      c.env.DB,
      bookings.map((booking) => booking.id),
    )
    return c.json(
      bookings.map((booking) => ({
        ...booking,
        payment: payments.get(booking.id) ?? null,
      })),
    )
  })
  .get("/bookings/:id", async (c) => {
    const id = parseBookingId(c.req.param("id"))
    if (id === null) {
      return c.json({ error: "Invalid booking id" }, 400)
    }
    const booking = await getBookingById(c.env.DB, id)
    if (booking === null) {
      return c.json({ error: "Booking not found" }, 404)
    }
    return c.json({
      ...booking,
      payment: await getBookingPaymentSummary(c.env.DB, booking.id),
      amountsDue: await listBookingAmountsDue(c.env.DB, booking.id),
    })
  })
  .post(
    "/bookings/:id/balance-due",
    validator("json", (value, c) => {
      const parsed = EnableBalanceDueInputSchema.safeParse(value)
      if (!parsed.success) {
        return c.json({ error: z.flattenError(parsed.error) }, 400)
      }
      return parsed.data
    }),
    async (c) => {
      const id = parseBookingId(c.req.param("id"))
      if (id === null) {
        return c.json({ error: "Invalid booking id" }, 400)
      }
      try {
        const booking = await enableBalanceDue(
          c.env.DB,
          await createStripeAdapter(
            c.env.STRIPE_SECRET_KEY,
            c.env.STRIPE_WEBHOOK_SECRET,
          ),
          id,
          c.req.valid("json").finalPrice,
        )
        return c.json({
          ...booking,
          payment: await getBookingPaymentSummary(c.env.DB, booking.id),
          amountsDue: await listBookingAmountsDue(c.env.DB, booking.id),
        })
      } catch (error) {
        if (error instanceof BalanceDueError) {
          return c.json({ error: error.reason }, balanceDueErrorStatus(error))
        }
        throw error
      }
    },
  )
  .get("/llm_tasks", async (c) => {
    const rawMessageId = c.req.query("message_id")
    if (rawMessageId === undefined) {
      return c.json(await getLlmTasks(c.env.DB))
    }
    const messageId = parseBookingId(rawMessageId)
    if (messageId === null) {
      return c.json({ error: "Invalid message_id" }, 400)
    }

    return c.json(await getLlmTasksByMessageId(c.env.DB, messageId))
  })
  .post("/bookings", async (c) => {
    const parsed = CreateBookingInputSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: z.flattenError(parsed.error) }, 400)
    }

    const outcome = await createBookingWithSync(
      c.env.DB,
      googleCredentials(c.env),
      parsed.data,
    )
    return c.json(outcome, 201)
  })
  .delete("/bookings/:id", async (c) => {
    const id = parseBookingId(c.req.param("id"))
    if (id === null) {
      return c.json({ error: "Invalid booking id" }, 400)
    }

    const outcome = await deleteBookingWithSync(
      c.env.DB,
      googleCredentials(c.env),
      id,
    )
    if (outcome === null) {
      return c.json({ error: "Booking not found" }, 404)
    }
    return c.json(outcome)
  })
  .get("/bookings/:id/google-calendar", async (c) => {
    const id = parseBookingId(c.req.param("id"))
    if (id === null) {
      return c.json({ error: "Invalid booking id" }, 400)
    }

    const sync = await getGoogleCalendarSyncStatus(c.env.DB, id)
    if (sync === null) {
      return c.json(
        { error: "Booking has no Google Calendar association" },
        404,
      )
    }
    return c.json(sync)
  })
  .post("/bookings/:id/google-calendar/retry", async (c) => {
    const id = parseBookingId(c.req.param("id"))
    if (id === null) {
      return c.json({ error: "Invalid booking id" }, 400)
    }

    const configuration = await getConfiguration(c.env.DB)
    if (!configuration.enableGoogleCalendar) {
      return c.json(
        { error: "Google Calendar synchronization is disabled" },
        409,
      )
    }

    try {
      const sync = await retryGoogleCalendarSync(
        c.env.DB,
        googleCredentials(c.env),
        id,
      )
      return c.json(sync)
    } catch (error) {
      if (error instanceof GoogleCalendarSyncError) {
        return c.json({ error: error.message }, syncErrorStatus(error))
      }
      throw error
    }
  })
  .post("/bookings/:id/google-calendar/delete-retry", async (c) => {
    const id = parseBookingId(c.req.param("id"))
    if (id === null) {
      return c.json({ error: "Invalid booking id" }, 400)
    }

    try {
      const sync = await retryGoogleCalendarDeletion(
        c.env.DB,
        googleCredentials(c.env),
        id,
      )
      return c.json(sync)
    } catch (error) {
      if (error instanceof GoogleCalendarSyncError) {
        return c.json({ error: error.message }, syncErrorStatus(error))
      }
      throw error
    }
  })
