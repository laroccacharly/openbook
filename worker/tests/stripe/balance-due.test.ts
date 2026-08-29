import { env } from "cloudflare:workers"
import { describe, expect, test, vi } from "vitest"
import { cancelBooking, createBooking } from "@worker/src/db/bookings"
import { getConfiguration } from "@worker/src/db/configuration"
import {
  claimCheckoutCreation,
  getAmountDuePayment,
  getCheckoutRecord,
  listBookingAmountsDue,
  paidAmountCents,
  saveOpenCheckout,
  upsertBookingPayment,
} from "@worker/src/db/payments"
import {
  BalanceDueError,
  enableBalanceDue,
} from "@worker/src/stripe/balance-due"
import type { StripeAdapter } from "@worker/src/stripe/adapter"

function fakeStripe() {
  return {
    expireCheckoutSession: vi.fn(async () => {}),
  } satisfies Pick<StripeAdapter, "expireCheckoutSession">
}

describe("enableBalanceDue", () => {
  test("replaces an unpaid deposit with a balance amount due for the final price", async () => {
    const booking = await createBooking(env.DB, {
      workerIds: [],
      startDatetime: new Date("2026-08-20T14:00:00Z"),
      endDatetime: new Date("2026-08-20T15:00:00Z"),
      estimatedPrice: 200,
    })
    const before = await listBookingAmountsDue(env.DB, booking.id)
    const { depositAmount } = await getConfiguration(env.DB)
    expect(before).toEqual([
      expect.objectContaining({
        kind: "deposit",
        amount: depositAmount,
        collectible: true,
      }),
    ])

    const updated = await enableBalanceDue(
      env.DB,
      fakeStripe(),
      booking.id,
      200,
    )
    expect(updated.finalPrice).toBe(200)
    expect(updated.balanceDueEnabledAt).not.toBeNull()
    expect(updated.estimatedPrice).toBe(200)

    const amountsDue = await listBookingAmountsDue(env.DB, booking.id)
    expect(amountsDue).toEqual([
      expect.objectContaining({ kind: "deposit", collectible: false }),
      expect.objectContaining({
        kind: "balance",
        amount: 200,
        collectible: true,
      }),
    ])
  })

  test("creates a remaining balance after a paid deposit", async () => {
    const booking = await createBooking(env.DB, {
      workerIds: [],
      startDatetime: new Date("2026-08-21T14:00:00Z"),
      endDatetime: new Date("2026-08-21T15:00:00Z"),
      estimatedPrice: 20_000,
    })
    const amountsDue = await listBookingAmountsDue(env.DB, booking.id)
    const deposit = amountsDue[0]
    if (deposit === undefined) throw new Error("Expected a deposit amount due")
    const { depositAmount } = await getConfiguration(env.DB)
    await upsertBookingPayment(env.DB, {
      amountDueId: deposit.id,
      bookingId: booking.id,
      checkoutSessionId: "cs_test_deposit",
      paymentIntentId: "pi_test_deposit",
      chargedAmount: depositAmount,
      refundedAmount: 0,
      currency: "cad",
      payerEmail: null,
      stripeCreatedAt: 1_900_000_000,
      paidAt: 1_900_000_000,
    })

    await enableBalanceDue(env.DB, fakeStripe(), booking.id, 18_000)
    expect(await paidAmountCents(env.DB, booking.id)).toBe(depositAmount)
    const after = await listBookingAmountsDue(env.DB, booking.id)
    expect(
      after.find((amountDue) => amountDue.kind === "deposit"),
    ).toMatchObject({
      collectible: true,
    })
    expect(
      after.find((amountDue) => amountDue.kind === "balance"),
    ).toMatchObject({
      amount: 18_000 - depositAmount,
      collectible: true,
    })
    expect(await getAmountDuePayment(env.DB, deposit.id)).not.toBeNull()
  })

  test("updates an unpaid balance and true-ups after a paid balance", async () => {
    const booking = await createBooking(env.DB, {
      workerIds: [],
      startDatetime: new Date("2026-08-22T14:00:00Z"),
      endDatetime: new Date("2026-08-22T15:00:00Z"),
      estimatedPrice: 200,
    })
    await enableBalanceDue(env.DB, fakeStripe(), booking.id, 20_000)
    await enableBalanceDue(env.DB, fakeStripe(), booking.id, 220)
    const afterUpdate = await listBookingAmountsDue(env.DB, booking.id)
    const unpaid = afterUpdate.find((amountDue) => amountDue.kind === "balance")
    expect(unpaid).toMatchObject({ amount: 220, collectible: true })
    if (unpaid === undefined) throw new Error("Expected a balance amount due")

    await upsertBookingPayment(env.DB, {
      amountDueId: unpaid.id,
      bookingId: booking.id,
      checkoutSessionId: "cs_test_balance",
      paymentIntentId: "pi_test_balance",
      chargedAmount: 220,
      refundedAmount: 0,
      currency: "cad",
      payerEmail: null,
      stripeCreatedAt: 1_900_000_000,
      paidAt: 1_900_000_000,
    })

    await enableBalanceDue(env.DB, fakeStripe(), booking.id, 250)
    const amountsDue = await listBookingAmountsDue(env.DB, booking.id)
    const balances = amountsDue.filter(
      (amountDue) => amountDue.kind === "balance",
    )
    expect(balances).toHaveLength(2)
    expect(balances[1]).toMatchObject({ amount: 30, collectible: true })
  })

  test("disables an unpaid balance when the remaining amount becomes zero", async () => {
    const booking = await createBooking(env.DB, {
      workerIds: [],
      startDatetime: new Date("2026-08-22T16:00:00Z"),
      endDatetime: new Date("2026-08-22T17:00:00Z"),
      estimatedPrice: 20_000,
    })
    const [deposit] = await listBookingAmountsDue(env.DB, booking.id)
    if (deposit === undefined) throw new Error("Expected a deposit amount due")
    await upsertBookingPayment(env.DB, {
      amountDueId: deposit.id,
      bookingId: booking.id,
      checkoutSessionId: "cs_test_zero_deposit",
      paymentIntentId: "pi_test_zero_deposit",
      chargedAmount: deposit.amount,
      refundedAmount: 0,
      currency: "cad",
      payerEmail: null,
      stripeCreatedAt: 1_900_000_000,
      paidAt: 1_900_000_000,
    })
    await enableBalanceDue(env.DB, fakeStripe(), booking.id, 20_000)
    const balance = (await listBookingAmountsDue(env.DB, booking.id)).find(
      (amountDue) => amountDue.kind === "balance",
    )
    if (balance === undefined) throw new Error("Expected a balance amount due")
    await claimCheckoutCreation(env.DB, balance.id, booking.id, "zero-claim")
    await saveOpenCheckout(env.DB, {
      amountDueId: balance.id,
      claimToken: "zero-claim",
      sessionId: "cs_test_zero_balance",
      sessionUrl: "https://checkout.stripe.test/cs_test_zero_balance",
      expiresAt: 2_000_000_000,
    })

    const stripe = fakeStripe()
    await enableBalanceDue(env.DB, stripe, booking.id, deposit.amount)

    expect(await listBookingAmountsDue(env.DB, booking.id)).toContainEqual(
      expect.objectContaining({
        id: balance.id,
        amount: 20_000 - deposit.amount,
        collectible: false,
      }),
    )
    expect(await getCheckoutRecord(env.DB, balance.id)).toMatchObject({
      status: "expired",
    })
    expect(stripe.expireCheckoutSession).toHaveBeenCalledWith(
      "cs_test_zero_balance",
    )
  })

  test("rejects cancelled bookings and prices below the amount already paid", async () => {
    const booking = await createBooking(env.DB, {
      workerIds: [],
      startDatetime: new Date("2026-08-23T14:00:00Z"),
      endDatetime: new Date("2026-08-23T15:00:00Z"),
      estimatedPrice: 20_000,
    })
    const amountsDue = await listBookingAmountsDue(env.DB, booking.id)
    const deposit = amountsDue[0]
    if (deposit === undefined) throw new Error("Expected a deposit amount due")
    const { depositAmount } = await getConfiguration(env.DB)
    await upsertBookingPayment(env.DB, {
      amountDueId: deposit.id,
      bookingId: booking.id,
      checkoutSessionId: "cs_test_paid_deposit",
      paymentIntentId: "pi_test_paid_deposit",
      chargedAmount: depositAmount,
      refundedAmount: 0,
      currency: "cad",
      payerEmail: null,
      stripeCreatedAt: 1_900_000_000,
      paidAt: 1_900_000_000,
    })
    await expect(
      enableBalanceDue(env.DB, fakeStripe(), booking.id, 0),
    ).rejects.toMatchObject({
      reason: "invalid_price",
    })
    await expect(
      enableBalanceDue(env.DB, fakeStripe(), booking.id, 4_000),
    ).rejects.toMatchObject({
      reason: "price_below_paid",
    })

    const cancelled = await createBooking(env.DB, {
      workerIds: [],
      startDatetime: new Date("2026-08-24T14:00:00Z"),
      endDatetime: new Date("2026-08-24T15:00:00Z"),
      estimatedPrice: 200,
    })
    await cancelBooking(env.DB, cancelled.id)
    await expect(
      enableBalanceDue(env.DB, fakeStripe(), cancelled.id, 200),
    ).rejects.toBeInstanceOf(BalanceDueError)
    await expect(
      enableBalanceDue(env.DB, fakeStripe(), cancelled.id, 200),
    ).rejects.toMatchObject({ reason: "cancelled" })
    await expect(
      enableBalanceDue(env.DB, fakeStripe(), 9_999_999, 200),
    ).rejects.toMatchObject({ reason: "not_found" })
  })
})
