import type { D1Database } from "@cloudflare/workers-types"
import type { Booking } from "../types/booking"
import { getConfiguration } from "./configuration"
import {
  BookingAmountDueSchema,
  BookingPaymentSchema,
  type BookingAmountDue,
  type BookingPayment,
  type BookingPaymentSummary,
  type AmountDueKind,
  type PaymentStatus,
} from "../types/payment"

type AmountDueRow = {
  id: number
  booking_id: number
  kind: AmountDueKind
  amount: number
  collectible: number
  created_at: number
  updated_at: number
}

function amountDueFromRow(row: AmountDueRow): BookingAmountDue {
  return BookingAmountDueSchema.parse({
    id: row.id,
    bookingId: row.booking_id,
    kind: row.kind,
    amount: row.amount,
    collectible: row.collectible === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

type PaymentRow = {
  amount_due_id: number
  booking_id: number
  status: PaymentStatus
  checkout_session_id: string
  payment_intent_id: string
  charged_amount: number
  refunded_amount: number
  currency: "cad"
  payer_email: string | null
  stripe_created_at: number
  paid_at: number
  updated_at: number
}

function paymentFromRow(row: PaymentRow): BookingPayment {
  return BookingPaymentSchema.parse({
    amountDueId: row.amount_due_id,
    bookingId: row.booking_id,
    status: row.status,
    checkoutSessionId: row.checkout_session_id,
    paymentIntentId: row.payment_intent_id,
    chargedAmount: row.charged_amount,
    refundedAmount: row.refunded_amount,
    currency: row.currency,
    payerEmail: row.payer_email,
    stripeCreatedAt: row.stripe_created_at,
    paidAt: row.paid_at,
    updatedAt: row.updated_at,
  })
}

export function isPayableCatalogPrice(price: number | null): boolean {
  return price !== null && Number.isSafeInteger(price) && price > 0
}

export async function listBookingAmountsDue(
  db: D1Database,
  bookingId: number,
): Promise<BookingAmountDue[]> {
  const result = await db
    .prepare(
      `SELECT * FROM booking_amounts_due WHERE booking_id = ? ORDER BY id ASC`,
    )
    .bind(bookingId)
    .all<AmountDueRow>()
  return result.results.map(amountDueFromRow)
}

export async function getBookingAmountDue(
  db: D1Database,
  amountDueId: number,
): Promise<BookingAmountDue | null> {
  const row = await db
    .prepare("SELECT * FROM booking_amounts_due WHERE id = ?")
    .bind(amountDueId)
    .first<AmountDueRow>()
  return row === null ? null : amountDueFromRow(row)
}

export async function insertBookingAmountDue(
  db: D1Database,
  input: {
    bookingId: number
    kind: AmountDueKind
    amount: number
    collectible: boolean
  },
): Promise<BookingAmountDue> {
  const row = await db
    .prepare(
      `INSERT INTO booking_amounts_due (booking_id, kind, amount, collectible)
       VALUES (?, ?, ?, ?)
       RETURNING *`,
    )
    .bind(input.bookingId, input.kind, input.amount, input.collectible ? 1 : 0)
    .first<AmountDueRow>()
  if (row === null) throw new Error("Amount-due insert returned no row")
  return amountDueFromRow(row)
}

export async function setAmountDueCollectible(
  db: D1Database,
  amountDueId: number,
  collectible: boolean,
): Promise<void> {
  await db
    .prepare(
      `UPDATE booking_amounts_due
       SET collectible = ?, updated_at = unixepoch()
       WHERE id = ?`,
    )
    .bind(collectible ? 1 : 0, amountDueId)
    .run()
}

export async function updateAmountDueAmount(
  db: D1Database,
  amountDueId: number,
  amount: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE booking_amounts_due
       SET amount = ?, updated_at = unixepoch()
       WHERE id = ?`,
    )
    .bind(amount, amountDueId)
    .run()
}

export async function createDefaultDepositAmountDue(
  db: D1Database,
  booking: Booking,
): Promise<BookingAmountDue | null> {
  if (!isPayableCatalogPrice(booking.estimatedPrice)) {
    return null
  }
  const { depositAmount } = await getConfiguration(db)
  return insertBookingAmountDue(db, {
    bookingId: booking.id,
    kind: "deposit",
    amount: depositAmount,
    collectible: true,
  })
}

export async function getAmountDuePayment(
  db: D1Database,
  amountDueId: number,
): Promise<BookingPayment | null> {
  const row = await db
    .prepare("SELECT * FROM booking_payments WHERE amount_due_id = ?")
    .bind(amountDueId)
    .first<PaymentRow>()
  return row === null ? null : paymentFromRow(row)
}

export async function listBookingPayments(
  db: D1Database,
  bookingId: number,
): Promise<BookingPayment[]> {
  const result = await db
    .prepare(
      `SELECT * FROM booking_payments WHERE booking_id = ? ORDER BY paid_at ASC, amount_due_id ASC`,
    )
    .bind(bookingId)
    .all<PaymentRow>()
  return result.results.map(paymentFromRow)
}

export async function getBookingPayment(
  db: D1Database,
  bookingId: number,
): Promise<BookingPayment | null> {
  const payments = await listBookingPayments(db, bookingId)
  return payments.at(-1) ?? null
}

function summaryFromPayments(
  payments: readonly BookingPayment[],
): BookingPaymentSummary | null {
  if (payments.length === 0) return null
  const chargedAmount = payments.reduce(
    (total, payment) => total + payment.chargedAmount,
    0,
  )
  const refundedAmount = payments.reduce(
    (total, payment) => total + payment.refundedAmount,
    0,
  )
  const status: PaymentStatus =
    refundedAmount === 0
      ? "paid"
      : refundedAmount >= chargedAmount
        ? "refunded"
        : "partially_refunded"
  return { status, chargedAmount, refundedAmount, currency: "cad" }
}

export async function getBookingPaymentSummary(
  db: D1Database,
  bookingId: number,
): Promise<BookingPaymentSummary | null> {
  return summaryFromPayments(await listBookingPayments(db, bookingId))
}

export async function getBookingPaymentSummaries(
  db: D1Database,
  bookingIds: readonly number[],
): Promise<Map<number, BookingPaymentSummary>> {
  if (bookingIds.length === 0) return new Map()
  const placeholders = bookingIds.map(() => "?").join(",")
  const result = await db
    .prepare(
      `SELECT * FROM booking_payments WHERE booking_id IN (${placeholders})`,
    )
    .bind(...bookingIds)
    .all<PaymentRow>()
  const paymentsByBooking = new Map<number, BookingPayment[]>()
  for (const row of result.results) {
    const payment = paymentFromRow(row)
    const list = paymentsByBooking.get(payment.bookingId) ?? []
    list.push(payment)
    paymentsByBooking.set(payment.bookingId, list)
  }
  return new Map(
    [...paymentsByBooking.entries()].flatMap(([bookingId, payments]) => {
      const summary = summaryFromPayments(payments)
      return summary === null ? [] : [[bookingId, summary]]
    }),
  )
}

export async function paidAmountCents(
  db: D1Database,
  bookingId: number,
): Promise<number> {
  const payments = await listBookingPayments(db, bookingId)
  return payments.reduce(
    (total, payment) =>
      total + (payment.chargedAmount - payment.refundedAmount),
    0,
  )
}

export async function getNextCollectibleAmountDue(
  db: D1Database,
  booking: Booking,
): Promise<BookingAmountDue | null> {
  const amountsDue = await listBookingAmountsDue(db, booking.id)
  for (const amountDue of amountsDue) {
    if (!amountDue.collectible) continue
    if ((await getAmountDuePayment(db, amountDue.id)) !== null) continue
    return amountDue
  }
  return null
}

export type CheckoutRecord = {
  amountDueId: number
  bookingId: number
  sessionId: string | null
  sessionUrl: string | null
  expiresAt: number | null
  status: "creating" | "open" | "expired" | "completed"
  attempt: number
  claimToken: string
}

type CheckoutRow = {
  amount_due_id: number
  booking_id: number
  session_id: string | null
  session_url: string | null
  expires_at: number | null
  status: CheckoutRecord["status"]
  attempt: number
  claim_token: string
}

function checkoutFromRow(row: CheckoutRow): CheckoutRecord {
  return {
    amountDueId: row.amount_due_id,
    bookingId: row.booking_id,
    sessionId: row.session_id,
    sessionUrl: row.session_url,
    expiresAt: row.expires_at,
    status: row.status,
    attempt: row.attempt,
    claimToken: row.claim_token,
  }
}

export async function getCheckoutRecord(
  db: D1Database,
  amountDueId: number,
): Promise<CheckoutRecord | null> {
  const row = await db
    .prepare("SELECT * FROM booking_checkout_sessions WHERE amount_due_id = ?")
    .bind(amountDueId)
    .first<CheckoutRow>()
  return row === null ? null : checkoutFromRow(row)
}

export async function getCheckoutRecordBySessionId(
  db: D1Database,
  sessionId: string,
): Promise<CheckoutRecord | null> {
  const row = await db
    .prepare("SELECT * FROM booking_checkout_sessions WHERE session_id = ?")
    .bind(sessionId)
    .first<CheckoutRow>()
  return row === null ? null : checkoutFromRow(row)
}

export async function getCheckoutRecordForBooking(
  db: D1Database,
  bookingId: number,
): Promise<CheckoutRecord | null> {
  const row = await db
    .prepare(
      `SELECT * FROM booking_checkout_sessions
       WHERE booking_id = ?
       ORDER BY amount_due_id DESC
       LIMIT 1`,
    )
    .bind(bookingId)
    .first<CheckoutRow>()
  return row === null ? null : checkoutFromRow(row)
}

export async function claimCheckoutCreation(
  db: D1Database,
  amountDueId: number,
  bookingId: number,
  claimToken: string,
): Promise<CheckoutRecord> {
  await db
    .prepare(
      `INSERT INTO booking_checkout_sessions
         (amount_due_id, booking_id, status, attempt, claim_token)
       VALUES (?, ?, 'creating', 1, ?)
       ON CONFLICT (amount_due_id) DO NOTHING`,
    )
    .bind(amountDueId, bookingId, claimToken)
    .run()
  const record = await getCheckoutRecord(db, amountDueId)
  if (record === null) throw new Error("Checkout claim disappeared")
  return record
}

export async function claimCheckoutReplacement(
  db: D1Database,
  amountDueId: number,
  expectedAttempt: number,
  claimToken: string,
): Promise<CheckoutRecord> {
  await db
    .prepare(
      `UPDATE booking_checkout_sessions
       SET session_id = NULL, session_url = NULL, expires_at = NULL,
           status = 'creating', attempt = attempt + 1, claim_token = ?,
           updated_at = unixepoch()
       WHERE amount_due_id = ? AND attempt = ? AND status = 'expired'`,
    )
    .bind(claimToken, amountDueId, expectedAttempt)
    .run()
  const record = await getCheckoutRecord(db, amountDueId)
  if (record === null) throw new Error("Checkout replacement disappeared")
  return record
}

export async function saveOpenCheckout(
  db: D1Database,
  input: {
    amountDueId: number
    claimToken: string
    sessionId: string
    sessionUrl: string
    expiresAt: number
  },
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE booking_checkout_sessions
       SET session_id = ?, session_url = ?, expires_at = ?, status = 'open',
           updated_at = unixepoch()
       WHERE amount_due_id = ? AND claim_token = ? AND status = 'creating'`,
    )
    .bind(
      input.sessionId,
      input.sessionUrl,
      input.expiresAt,
      input.amountDueId,
      input.claimToken,
    )
    .run()
  return result.meta.changes === 1
}

export async function abandonCheckoutClaim(
  db: D1Database,
  amountDueId: number,
  claimToken: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE booking_checkout_sessions
       SET status = 'expired', updated_at = unixepoch()
       WHERE amount_due_id = ? AND claim_token = ? AND status = 'creating'`,
    )
    .bind(amountDueId, claimToken)
    .run()
}

export async function expireOpenCheckout(
  db: D1Database,
  amountDueId: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE booking_checkout_sessions
       SET status = 'expired', updated_at = unixepoch()
       WHERE amount_due_id = ? AND status IN ('creating', 'open')`,
    )
    .bind(amountDueId)
    .run()
}

export async function setCheckoutStatus(
  db: D1Database,
  sessionId: string,
  status: "expired" | "completed",
): Promise<void> {
  await db
    .prepare(
      `UPDATE booking_checkout_sessions SET status = ?, updated_at = unixepoch()
       WHERE session_id = ?`,
    )
    .bind(status, sessionId)
    .run()
}

export async function upsertBookingPayment(
  db: D1Database,
  input: {
    amountDueId: number
    bookingId: number
    checkoutSessionId: string
    paymentIntentId: string
    chargedAmount: number
    refundedAmount: number
    currency: string
    payerEmail: string | null
    stripeCreatedAt: number
    paidAt: number
  },
): Promise<void> {
  if (input.currency !== "cad") throw new Error("Unexpected payment currency")
  const status: PaymentStatus =
    input.refundedAmount === 0
      ? "paid"
      : input.refundedAmount >= input.chargedAmount
        ? "refunded"
        : "partially_refunded"
  await db
    .prepare(
      `INSERT INTO booking_payments (
         amount_due_id, booking_id, status, checkout_session_id, payment_intent_id,
         charged_amount, refunded_amount, currency, payer_email,
         stripe_created_at, paid_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'cad', ?, ?, ?, unixepoch())
       ON CONFLICT (amount_due_id) DO UPDATE SET
         status = excluded.status,
         refunded_amount = excluded.refunded_amount,
         payer_email = COALESCE(excluded.payer_email, booking_payments.payer_email),
         updated_at = unixepoch()
       WHERE booking_payments.checkout_session_id = excluded.checkout_session_id
         AND booking_payments.payment_intent_id = excluded.payment_intent_id`,
    )
    .bind(
      input.amountDueId,
      input.bookingId,
      status,
      input.checkoutSessionId,
      input.paymentIntentId,
      input.chargedAmount,
      input.refundedAmount,
      input.payerEmail,
      input.stripeCreatedAt,
      input.paidAt,
    )
    .run()
}

export async function updateRefundByPaymentIntent(
  db: D1Database,
  paymentIntentId: string,
  chargedAmount: number,
  refundedAmount: number,
): Promise<void> {
  const status: PaymentStatus =
    refundedAmount >= chargedAmount ? "refunded" : "partially_refunded"
  await db
    .prepare(
      `UPDATE booking_payments
       SET status = ?, charged_amount = ?, refunded_amount = ?, updated_at = unixepoch()
       WHERE payment_intent_id = ?`,
    )
    .bind(status, chargedAmount, refundedAmount, paymentIntentId)
    .run()
}

export async function setBookingFinalPrice(
  db: D1Database,
  bookingId: number,
  finalPrice: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE bookings
       SET final_price = ?, balance_due_enabled_at = unixepoch()
       WHERE id = ?`,
    )
    .bind(finalPrice, bookingId)
    .run()
}

export async function bookingCustomerEmail(
  db: D1Database,
  bookingId: number,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT contact.address
       FROM bookings booking
       JOIN customer_contact_methods contact ON contact.customer_id = booking.customer_id
       WHERE booking.id = ? AND contact.channel = 'email'
       ORDER BY contact.id ASC LIMIT 1`,
    )
    .bind(bookingId)
    .first<{ address: string }>()
  return row?.address ?? null
}

export async function hasWebhookReceipt(
  db: D1Database,
  eventId: string,
): Promise<boolean> {
  return (
    (await db
      .prepare(
        "SELECT 1 AS found FROM stripe_webhook_receipts WHERE event_id = ?",
      )
      .bind(eventId)
      .first()) !== null
  )
}

export async function recordWebhookReceipt(
  db: D1Database,
  eventId: string,
  eventType: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO stripe_webhook_receipts (event_id, event_type)
       VALUES (?, ?) ON CONFLICT (event_id) DO NOTHING`,
    )
    .bind(eventId, eventType)
    .run()
}
