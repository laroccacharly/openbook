import type { D1Database } from "@cloudflare/workers-types"
import { getBookingById } from "../db/bookings"
import {
  expireOpenCheckout,
  getAmountDuePayment,
  getCheckoutRecord,
  insertBookingAmountDue,
  listBookingAmountsDue,
  paidAmountCents,
  setBookingFinalPrice,
  setAmountDueCollectible,
  updateAmountDueAmount,
} from "../db/payments"
import type { Booking } from "../types/booking"
import type { BookingAmountDue } from "../types/payment"
import type { StripeAdapter } from "./adapter"

export class BalanceDueError extends Error {
  public readonly reason:
    | "not_found"
    | "cancelled"
    | "invalid_price"
    | "price_below_paid"

  constructor(
    reason: "not_found" | "cancelled" | "invalid_price" | "price_below_paid",
    message: string,
  ) {
    super(message)
    this.reason = reason
    this.name = "BalanceDueError"
  }
}

function requirePayableBooking(
  booking: Booking | null,
  finalPrice: number,
): Booking {
  if (!Number.isSafeInteger(finalPrice) || finalPrice <= 0) {
    throw new BalanceDueError(
      "invalid_price",
      "Final price must be a positive amount in cents",
    )
  }
  if (booking === null) {
    throw new BalanceDueError("not_found", "Booking not found")
  }
  if (booking.cancelledAt !== null || booking.deleteAt !== null) {
    throw new BalanceDueError(
      "cancelled",
      "Cancelled bookings cannot collect a remaining balance",
    )
  }
  return booking
}

async function expireAmountDueCheckout(
  db: D1Database,
  stripe: Pick<StripeAdapter, "expireCheckoutSession">,
  amountDueId: number,
): Promise<void> {
  const checkout = await getCheckoutRecord(db, amountDueId)
  if (checkout?.status === "open" && checkout.sessionId !== null) {
    await stripe.expireCheckoutSession(checkout.sessionId)
  }
  await expireOpenCheckout(db, amountDueId)
}

async function disableUnpaidDeposits(
  db: D1Database,
  stripe: Pick<StripeAdapter, "expireCheckoutSession">,
  amountsDue: readonly BookingAmountDue[],
): Promise<void> {
  for (const amountDue of amountsDue) {
    if (amountDue.kind !== "deposit" || !amountDue.collectible) continue
    if ((await getAmountDuePayment(db, amountDue.id)) !== null) continue
    await expireAmountDueCheckout(db, stripe, amountDue.id)
    await setAmountDueCollectible(db, amountDue.id, false)
  }
}

async function firstUnpaidBalance(
  db: D1Database,
  amountsDue: readonly BookingAmountDue[],
): Promise<BookingAmountDue | null> {
  for (const amountDue of amountsDue) {
    if (amountDue.kind !== "balance" || !amountDue.collectible) continue
    if ((await getAmountDuePayment(db, amountDue.id)) !== null) continue
    return amountDue
  }
  return null
}

async function disableUnpaidBalances(
  db: D1Database,
  stripe: Pick<StripeAdapter, "expireCheckoutSession">,
  amountsDue: readonly BookingAmountDue[],
): Promise<void> {
  for (const amountDue of amountsDue) {
    if (amountDue.kind !== "balance" || !amountDue.collectible) continue
    if ((await getAmountDuePayment(db, amountDue.id)) !== null) continue
    await expireAmountDueCheckout(db, stripe, amountDue.id)
    await setAmountDueCollectible(db, amountDue.id, false)
  }
}

async function upsertRemainingBalance(
  db: D1Database,
  stripe: Pick<StripeAdapter, "expireCheckoutSession">,
  bookingId: number,
  amountsDue: readonly BookingAmountDue[],
  remaining: number,
): Promise<void> {
  if (remaining === 0) {
    await disableUnpaidBalances(db, stripe, amountsDue)
    return
  }
  const unpaidBalance = await firstUnpaidBalance(db, amountsDue)
  if (unpaidBalance === null) {
    await insertBookingAmountDue(db, {
      bookingId,
      kind: "balance",
      amount: remaining,
      collectible: true,
    })
    return
  }
  if (unpaidBalance.amount === remaining) return
  await expireAmountDueCheckout(db, stripe, unpaidBalance.id)
  await updateAmountDueAmount(db, unpaidBalance.id, remaining)
}

async function reloadBooking(
  db: D1Database,
  bookingId: number,
): Promise<Booking> {
  const updated = await getBookingById(db, bookingId)
  if (updated === null)
    throw new Error("Booking disappeared after enabling balance due")
  return updated
}

export async function enableBalanceDue(
  db: D1Database,
  stripe: Pick<StripeAdapter, "expireCheckoutSession">,
  bookingId: number,
  finalPrice: number,
): Promise<Booking> {
  const booking = requirePayableBooking(
    await getBookingById(db, bookingId),
    finalPrice,
  )
  const alreadyPaid = await paidAmountCents(db, bookingId)
  if (finalPrice < alreadyPaid) {
    throw new BalanceDueError(
      "price_below_paid",
      "Final price cannot be below the amount already paid",
    )
  }

  const amountsDue = await listBookingAmountsDue(db, bookingId)
  await disableUnpaidDeposits(db, stripe, amountsDue)
  await upsertRemainingBalance(
    db,
    stripe,
    bookingId,
    amountsDue,
    finalPrice - alreadyPaid,
  )
  await setBookingFinalPrice(db, bookingId, finalPrice)
  return reloadBooking(db, booking.id)
}
