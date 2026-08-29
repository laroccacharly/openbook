import { env } from "cloudflare:workers"
import { describe, expect, test, vi } from "vitest"
import type Stripe from "stripe"
import { createBooking } from "@worker/src/db/bookings"
import {
  claimCheckoutCreation,
  expireOpenCheckout,
  getBookingPayment,
  getBookingPaymentSummaries,
  getBookingPaymentSummary,
  getCheckoutRecord,
  listBookingAmountsDue,
  saveOpenCheckout,
} from "@worker/src/db/payments"
import { enableBalanceDue } from "@worker/src/stripe/balance-due"
import type {
  CheckoutSessionState,
  StripeAdapter,
} from "@worker/src/stripe/adapter"
import { processStripeEvent } from "@worker/src/stripe/webhook"

function event(id: string, type: string, eventObject: unknown): Stripe.Event {
  return { id, type, data: { object: eventObject } } as unknown as Stripe.Event
}

describe("Stripe webhook state processing", () => {
  test("persists authoritative payment/refund totals and deduplicates events", async () => {
    const booking = await createBooking(env.DB, {
      workerIds: [],
      startDatetime: new Date("2026-08-20T14:00:00Z"),
      endDatetime: new Date("2026-08-20T15:00:00Z"),
      estimatedPrice: 125,
    })
    await enableBalanceDue(
      env.DB,
      { expireCheckoutSession: vi.fn(async () => {}) },
      booking.id,
      125,
    )
    const amountsDue = await listBookingAmountsDue(env.DB, booking.id)
    const balance = amountsDue.find((amountDue) => amountDue.kind === "balance")
    if (balance === undefined) throw new Error("Expected a balance amount due")
    const checkout: CheckoutSessionState = {
      id: "cs_test_paid",
      url: null,
      status: "complete",
      paymentStatus: "paid",
      expiresAt: 2_000_000_000,
      createdAt: 1_900_000_000,
      amountTotal: 12_500,
      currency: "cad",
      paymentIntentId: "pi_test_paid",
      customerEmail: "payer@example.com",
      bookingId: String(booking.id),
      publicBookingId: booking.publicId,
      amountDueId: null,
    }
    const retrievePaymentIntent = vi.fn().mockResolvedValue({
      id: "pi_test_paid",
      chargedAmount: 12_500,
      refundedAmount: 0,
      currency: "cad",
      payerEmail: "payer@example.com",
    })
    const stripe: StripeAdapter = {
      createCheckoutSession: vi.fn(),
      expireCheckoutSession: vi.fn(async () => {}),
      retrieveCheckoutSession: vi.fn().mockResolvedValue(checkout),
      retrievePaymentIntent,
      constructWebhookEvent: vi.fn(),
    }
    await claimCheckoutCreation(env.DB, balance.id, booking.id, "paid-claim")
    await saveOpenCheckout(env.DB, {
      amountDueId: balance.id,
      claimToken: "paid-claim",
      sessionId: checkout.id,
      sessionUrl: "https://checkout.stripe.test/cs_test_paid",
      expiresAt: checkout.expiresAt,
    })
    await expireOpenCheckout(env.DB, balance.id)
    const completed = event("evt_completed", "checkout.session.completed", {
      id: checkout.id,
      metadata: {
        booking_id: String(booking.id),
        public_booking_id: booking.publicId,
        amount_due_id: String(balance.id),
      },
    })

    await expect(processStripeEvent(env.DB, stripe, completed)).resolves.toBe(
      "processed",
    )
    await expect(processStripeEvent(env.DB, stripe, completed)).resolves.toBe(
      "duplicate",
    )
    expect(await getBookingPayment(env.DB, booking.id)).toMatchObject({
      amountDueId: balance.id,
      status: "paid",
      chargedAmount: 12_500,
      refundedAmount: 0,
    })
    await expect(getCheckoutRecord(env.DB, balance.id)).resolves.toMatchObject({
      status: "completed",
    })
    await expect(getBookingPaymentSummary(env.DB, booking.id)).resolves.toEqual(
      {
        status: "paid",
        chargedAmount: 12_500,
        refundedAmount: 0,
        currency: "cad",
      },
    )
    expect(
      (await getBookingPaymentSummaries(env.DB, [booking.id])).get(booking.id),
    ).toMatchObject({ status: "paid", chargedAmount: 12_500 })

    retrievePaymentIntent.mockResolvedValue({
      id: "pi_test_paid",
      chargedAmount: 12_500,
      refundedAmount: 2_500,
      currency: "cad",
      payerEmail: "payer@example.com",
    })
    await processStripeEvent(
      env.DB,
      stripe,
      event("evt_refund_partial", "charge.refunded", {
        payment_intent: "pi_test_paid",
      }),
    )
    expect(await getBookingPayment(env.DB, booking.id)).toMatchObject({
      status: "partially_refunded",
      refundedAmount: 2_500,
    })

    retrievePaymentIntent.mockResolvedValue({
      id: "pi_test_paid",
      chargedAmount: 12_500,
      refundedAmount: 12_500,
      currency: "cad",
      payerEmail: "payer@example.com",
    })
    await processStripeEvent(
      env.DB,
      stripe,
      event("evt_refund_full", "charge.refunded", {
        payment_intent: "pi_test_paid",
      }),
    )
    expect(await getBookingPayment(env.DB, booking.id)).toMatchObject({
      status: "refunded",
      refundedAmount: 12_500,
    })
  })
})
