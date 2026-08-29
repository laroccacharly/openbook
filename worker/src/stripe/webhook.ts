import type Stripe from "stripe"
import { z } from "zod"
import type { D1Database } from "@cloudflare/workers-types"
import { getBookingById } from "../db/bookings"
import {
  getBookingAmountDue,
  hasWebhookReceipt,
  recordWebhookReceipt,
  setCheckoutStatus,
  updateRefundByPaymentIntent,
  upsertBookingPayment,
} from "../db/payments"
import {
  CheckoutSessionStateSchema,
  STRIPE_CURRENCY,
  stripeObjectId,
  type CheckoutSessionState,
  type StripeAdapter,
} from "./adapter"

const PositiveIdSchema = z.coerce.number().int().positive()

const PaidCheckoutSessionStateSchema = CheckoutSessionStateSchema.extend({
  paymentStatus: z.literal("paid"),
  paymentIntentId: z.string().min(1),
  amountTotal: z.number().int(),
  currency: z.literal(STRIPE_CURRENCY),
  bookingId: PositiveIdSchema,
  amountDueId: PositiveIdSchema,
  publicBookingId: z.string().min(1),
})

function parsePaidCheckoutSessionState(
  session: CheckoutSessionState,
  eventSession: Stripe.Checkout.Session,
): z.infer<typeof PaidCheckoutSessionStateSchema> {
  const metadata = eventSession.metadata ?? {}
  return PaidCheckoutSessionStateSchema.parse({
    ...session,
    bookingId: session.bookingId ?? metadata.booking_id ?? null,
    amountDueId: session.amountDueId ?? metadata.amount_due_id ?? null,
    publicBookingId:
      session.publicBookingId ?? metadata.public_booking_id ?? null,
  })
}

async function persistCompletedCheckout(
  db: D1Database,
  adapter: StripeAdapter,
  eventSession: Stripe.Checkout.Session,
): Promise<void> {
  const session: CheckoutSessionState = await adapter.retrieveCheckoutSession(
    eventSession.id,
  )
  const paidSession = parsePaidCheckoutSessionState(session, eventSession)
  z.object({ publicId: z.literal(paidSession.publicBookingId) }).parse(
    await getBookingById(db, paidSession.bookingId),
  )
  z.object({ bookingId: z.literal(paidSession.bookingId) }).parse(
    await getBookingAmountDue(db, paidSession.amountDueId),
  )
  const paymentIntent = await adapter.retrievePaymentIntent(
    paidSession.paymentIntentId,
  )
  z.object({
    chargedAmount: z.literal(paidSession.amountTotal),
    currency: z.literal(paidSession.currency),
  }).parse(paymentIntent)
  await upsertBookingPayment(db, {
    amountDueId: paidSession.amountDueId,
    bookingId: paidSession.bookingId,
    checkoutSessionId: paidSession.id,
    paymentIntentId: paymentIntent.id,
    chargedAmount: paymentIntent.chargedAmount,
    refundedAmount: paymentIntent.refundedAmount,
    currency: paymentIntent.currency,
    payerEmail: paidSession.customerEmail ?? paymentIntent.payerEmail,
    stripeCreatedAt: paidSession.createdAt,
    paidAt: paidSession.createdAt,
  })
  await setCheckoutStatus(db, paidSession.id, "completed")
}

export async function processStripeEvent(
  db: D1Database,
  adapter: StripeAdapter,
  event: Stripe.Event,
): Promise<"processed" | "duplicate" | "ignored"> {
  if (await hasWebhookReceipt(db, event.id)) return "duplicate"

  let outcome: "processed" | "ignored" = "ignored"
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      await persistCompletedCheckout(db, adapter, event.data.object)
      outcome = "processed"
      break
    }
    case "checkout.session.expired": {
      await setCheckoutStatus(db, event.data.object.id, "expired")
      outcome = "processed"
      break
    }
    case "charge.refunded": {
      const paymentIntentId = stripeObjectId(event.data.object.payment_intent)
      if (paymentIntentId === null)
        throw new Error("Refunded charge has no PaymentIntent")
      const paymentIntent = await adapter.retrievePaymentIntent(paymentIntentId)
      await updateRefundByPaymentIntent(
        db,
        paymentIntent.id,
        paymentIntent.chargedAmount,
        paymentIntent.refundedAmount,
      )
      outcome = "processed"
      break
    }
  }
  await recordWebhookReceipt(db, event.id, event.type)
  return outcome
}
