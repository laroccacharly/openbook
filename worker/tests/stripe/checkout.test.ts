import { env } from "cloudflare:workers"
import { describe, expect, test, vi } from "vitest"
import { createBooking } from "@worker/src/db/bookings"
import { getConfiguration } from "@worker/src/db/configuration"
import {
  getCheckoutRecordBySessionId,
  getCheckoutRecordForBooking,
  listBookingAmountsDue,
  setCheckoutStatus,
} from "@worker/src/db/payments"
import {
  bookingPriceToMinorUnits,
  StripePaymentError,
  type CheckoutSessionState,
  type StripeAdapter,
} from "@worker/src/stripe/adapter"
import { createOrReuseCheckout } from "@worker/src/stripe/checkout"
import { enableBalanceDue } from "@worker/src/stripe/balance-due"

function checkoutSessionState(
  bookingId: number,
  publicBookingId: string,
  amountDueId: number,
  id = "cs_test_first",
  amountTotal = 5_000,
): CheckoutSessionState {
  return {
    id,
    url: `https://checkout.stripe.test/${id}`,
    status: "open",
    paymentStatus: "unpaid",
    expiresAt: 2_000_000_000,
    createdAt: 1_900_000_000,
    amountTotal,
    currency: "cad",
    paymentIntentId: null,
    customerEmail: null,
    bookingId: String(bookingId),
    publicBookingId,
    amountDueId: String(amountDueId),
  }
}

function fakeAdapter() {
  return {
    createCheckoutSession: vi.fn(
      async (input: Parameters<StripeAdapter["createCheckoutSession"]>[0]) =>
        checkoutSessionState(
          input.bookingId,
          input.publicBookingId,
          input.amountDueId,
        ),
    ),
    expireCheckoutSession: vi.fn(async () => {}),
    retrieveCheckoutSession: vi.fn(
      async (_sessionId: string): Promise<CheckoutSessionState> => {
        throw new Error("No mocked Checkout Session")
      },
    ),
    retrievePaymentIntent: vi.fn(async () => {
      throw new Error("No mocked payment")
    }),
    constructWebhookEvent: vi.fn(async () => {
      throw new Error("No mocked webhook")
    }),
  } satisfies StripeAdapter
}

describe("Stripe booking checkout", () => {
  test("accepts validated CAD prices already stored in cents", () => {
    expect(bookingPriceToMinorUnits(1)).toBe(1)
    expect(bookingPriceToMinorUnits(99_999_999)).toBe(99_999_999)
    for (const price of [null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
      expect(() => bookingPriceToMinorUnits(price)).toThrow(StripePaymentError)
    }
  })

  test("creates, reuses, and replaces Checkout Sessions for the deposit amount due", async () => {
    const booking = await createBooking(env.DB, {
      workerIds: [],
      startDatetime: new Date("2026-08-20T14:00:00Z"),
      endDatetime: new Date("2026-08-20T15:00:00Z"),
      description: "Test booking",
      estimatedPrice: 123,
    })
    const amountsDue = await listBookingAmountsDue(env.DB, booking.id)
    const deposit = amountsDue[0]
    if (deposit === undefined) throw new Error("Expected a deposit amount due")
    const { depositAmount } = await getConfiguration(env.DB)
    expect(deposit).toMatchObject({
      kind: "deposit",
      amount: depositAmount,
      collectible: true,
    })
    const stripe = fakeAdapter()

    const first = await createOrReuseCheckout(
      env.DB,
      stripe,
      booking,
      "https://book.test",
      1_900_000_000,
    )
    expect(first.sessionId).toBe("cs_test_first")
    expect(first.amountDueId).toBe(deposit.id)
    expect(stripe.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: depositAmount,
        amountDueId: deposit.id,
        expiresAt: 1_900_001_860,
        idempotencyKey: `book-amount-due-${deposit.id}-checkout-1`,
      }),
    )

    stripe.retrieveCheckoutSession.mockResolvedValue(
      checkoutSessionState(booking.id, booking.publicId, deposit.id),
    )
    await expect(
      createOrReuseCheckout(env.DB, stripe, booking, "https://book.test"),
    ).resolves.toEqual(first)
    expect(stripe.createCheckoutSession).toHaveBeenCalledTimes(1)
    await expect(
      getCheckoutRecordBySessionId(env.DB, first.sessionId),
    ).resolves.toMatchObject({ amountDueId: deposit.id, status: "open" })

    await setCheckoutStatus(env.DB, first.sessionId, "expired")
    stripe.createCheckoutSession.mockImplementationOnce(async (input) =>
      checkoutSessionState(
        input.bookingId,
        input.publicBookingId,
        input.amountDueId,
        "cs_test_replacement",
      ),
    )
    const replacement = await createOrReuseCheckout(
      env.DB,
      stripe,
      booking,
      "https://book.test",
      1_900_002_000,
    )
    expect(replacement.sessionId).toBe("cs_test_replacement")
    expect(stripe.createCheckoutSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        idempotencyKey: `book-amount-due-${deposit.id}-checkout-2`,
      }),
    )
  })

  test("rejects cancelled and invalid-price bookings before contacting Stripe", async () => {
    const stripe = fakeAdapter()
    const base = await createBooking(env.DB, {
      workerIds: [],
      startDatetime: new Date("2026-08-20T14:00:00Z"),
      endDatetime: new Date("2026-08-20T15:00:00Z"),
      estimatedPrice: null,
    })
    await expect(
      createOrReuseCheckout(env.DB, stripe, base, "https://book.test"),
    ).rejects.toMatchObject({ reason: "invalid_price" })
    await expect(
      createOrReuseCheckout(
        env.DB,
        stripe,
        { ...base, estimatedPrice: 10, cancelledAt: 1 },
        "https://book.test",
      ),
    ).rejects.toMatchObject({ reason: "ineligible" })
    expect(stripe.createCheckoutSession).not.toHaveBeenCalled()
  })

  test("collects the remaining balance after enableBalanceDue", async () => {
    const booking = await createBooking(env.DB, {
      workerIds: [],
      startDatetime: new Date("2026-08-23T14:00:00Z"),
      endDatetime: new Date("2026-08-23T15:00:00Z"),
      estimatedPrice: 200,
    })
    const stripe = fakeAdapter()
    const updated = await enableBalanceDue(env.DB, stripe, booking.id, 200)
    const amountsDue = await listBookingAmountsDue(env.DB, booking.id)
    const balance = amountsDue.find((amountDue) => amountDue.kind === "balance")
    if (balance === undefined) throw new Error("Expected a balance amount due")
    stripe.createCheckoutSession.mockImplementationOnce(async (input) =>
      checkoutSessionState(
        input.bookingId,
        input.publicBookingId,
        input.amountDueId,
        "cs_test_balance",
        200,
      ),
    )
    const result = await createOrReuseCheckout(
      env.DB,
      stripe,
      updated,
      "https://book.test",
      1_900_000_000,
    )
    expect(result.amountDueId).toBe(balance.id)
    expect(stripe.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 200,
        amountDueId: balance.id,
      }),
    )
  })

  test("releases its D1 claim when Stripe Session creation fails", async () => {
    const booking = await createBooking(env.DB, {
      workerIds: [],
      startDatetime: new Date("2026-08-22T14:00:00Z"),
      endDatetime: new Date("2026-08-22T15:00:00Z"),
      estimatedPrice: 50,
    })
    const stripe = fakeAdapter()
    stripe.createCheckoutSession.mockRejectedValueOnce(
      new Error("Stripe unavailable"),
    )
    await expect(
      createOrReuseCheckout(env.DB, stripe, booking, "https://book.test"),
    ).rejects.toThrow("Stripe unavailable")
    await expect(
      getCheckoutRecordForBooking(env.DB, booking.id),
    ).resolves.toMatchObject({
      status: "expired",
    })
  })
})
