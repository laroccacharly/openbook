import type { D1Database } from "@cloudflare/workers-types"
import type { Booking } from "../types"
import {
  abandonCheckoutClaim,
  bookingCustomerEmail,
  claimCheckoutCreation,
  claimCheckoutReplacement,
  getCheckoutRecord,
  getNextCollectibleAmountDue,
  isPayableCatalogPrice,
  saveOpenCheckout,
  setCheckoutStatus,
  type CheckoutRecord,
} from "../db/payments"
import {
  bookingPriceToMinorUnits,
  StripePaymentError,
  type CheckoutSessionState,
  type StripeAdapter,
} from "./adapter"

const CHECKOUT_EXPIRY_SECONDS = 31 * 60

export type CheckoutSessionResult = {
  url: string
  sessionId: string
  expiresAt: number
  amountDueId: number
}

function resultFromSession(
  session: CheckoutSessionState,
  amountDueId: number,
): CheckoutSessionResult {
  if (session.url === null)
    throw new Error("Open Stripe Checkout Session has no URL")
  return {
    url: session.url,
    sessionId: session.id,
    expiresAt: session.expiresAt,
    amountDueId,
  }
}

function belongsToAmountDue(
  session: CheckoutSessionState,
  booking: Booking,
  amountDueId: number,
): boolean {
  return (
    session.bookingId === String(booking.id) &&
    session.publicBookingId === booking.publicId &&
    session.amountDueId === String(amountDueId)
  )
}

async function inspectExisting(
  db: D1Database,
  adapter: StripeAdapter,
  booking: Booking,
  amountDueId: number,
): Promise<CheckoutSessionResult | null> {
  const record = await getCheckoutRecord(db, amountDueId)
  if (record === null) return null
  if (record.status === "creating") {
    throw new StripePaymentError("checkout_busy", "Checkout is being prepared")
  }
  if (record.status === "completed") {
    throw new StripePaymentError("already_paid", "Payment is being confirmed")
  }
  if (record.status === "expired" || record.sessionId === null) return null

  const session = await adapter.retrieveCheckoutSession(record.sessionId)
  if (!belongsToAmountDue(session, booking, amountDueId)) {
    throw new Error("Stripe Session metadata mismatch")
  }
  if (session.status === "open") return resultFromSession(session, amountDueId)
  await setCheckoutStatus(
    db,
    session.id,
    session.status === "complete" ? "completed" : "expired",
  )
  if (session.status === "complete") {
    throw new StripePaymentError("already_paid", "Payment is being confirmed")
  }
  return null
}

async function requireCollectibleAmountDue(db: D1Database, booking: Booking) {
  if (booking.cancelledAt !== null || booking.deleteAt !== null) {
    throw new StripePaymentError(
      "ineligible",
      "Booking is not eligible for payment",
    )
  }
  const amountDue = await getNextCollectibleAmountDue(db, booking)
  if (amountDue !== null) return amountDue
  if (
    booking.balanceDueEnabledAt === null &&
    !isPayableCatalogPrice(booking.estimatedPrice)
  ) {
    throw new StripePaymentError(
      "invalid_price",
      "Booking price is not payable",
    )
  }
  throw new StripePaymentError("already_paid", "No payment is currently due")
}

function isCheckoutClaim(
  value: CheckoutRecord | CheckoutSessionResult,
): value is CheckoutRecord {
  return "claimToken" in value
}

async function claimCheckoutForAmountDue(
  db: D1Database,
  adapter: StripeAdapter,
  booking: Booking,
  amountDueId: number,
): Promise<CheckoutRecord | CheckoutSessionResult> {
  const claimToken = crypto.randomUUID()
  const current = await getCheckoutRecord(db, amountDueId)
  const claimed =
    current === null
      ? await claimCheckoutCreation(db, amountDueId, booking.id, claimToken)
      : await claimCheckoutReplacement(
          db,
          amountDueId,
          current.attempt,
          claimToken,
        )
  if (claimed.claimToken === claimToken && claimed.status === "creating") {
    return claimed
  }
  const wonByOtherRequest = await inspectExisting(
    db,
    adapter,
    booking,
    amountDueId,
  )
  if (wonByOtherRequest !== null) return wonByOtherRequest
  throw new StripePaymentError("checkout_busy", "Checkout is being prepared")
}

export async function createOrReuseCheckout(
  db: D1Database,
  adapter: StripeAdapter,
  booking: Booking,
  publicOrigin: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<CheckoutSessionResult> {
  const amountDue = await requireCollectibleAmountDue(db, booking)
  const existing = await inspectExisting(db, adapter, booking, amountDue.id)
  if (existing !== null) return existing

  const claimed = await claimCheckoutForAmountDue(
    db,
    adapter,
    booking,
    amountDue.id,
  )
  if (!isCheckoutClaim(claimed)) return claimed

  const returnUrl = new URL(`/bookings/${booking.publicId}`, publicOrigin)
  const successUrl = new URL(returnUrl)
  successUrl.searchParams.set("checkout", "{CHECKOUT_SESSION_ID}")
  try {
    const session = await adapter.createCheckoutSession({
      bookingId: booking.id,
      publicBookingId: booking.publicId,
      amountDueId: amountDue.id,
      amount: bookingPriceToMinorUnits(amountDue.amount),
      description: booking.description.trim() || "Booking",
      customerEmail: await bookingCustomerEmail(db, booking.id),
      successUrl: successUrl.toString(),
      cancelUrl: returnUrl.toString(),
      expiresAt: nowSeconds + CHECKOUT_EXPIRY_SECONDS,
      idempotencyKey: `book-amount-due-${amountDue.id}-checkout-${claimed.attempt}`,
    })
    if (
      !belongsToAmountDue(session, booking, amountDue.id) ||
      session.status !== "open"
    ) {
      throw new Error("Stripe returned an invalid Checkout Session")
    }
    const saved = await saveOpenCheckout(db, {
      amountDueId: amountDue.id,
      claimToken: claimed.claimToken,
      sessionId: session.id,
      sessionUrl: session.url ?? "",
      expiresAt: session.expiresAt,
    })
    if (!saved) throw new Error("Checkout claim was lost")
    return resultFromSession(session, amountDue.id)
  } catch (error) {
    await abandonCheckoutClaim(db, amountDue.id, claimed.claimToken)
    throw error
  }
}
