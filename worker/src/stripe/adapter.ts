import type Stripe from "stripe"
import { z } from "zod"

export const STRIPE_CURRENCY = "cad" as const
export const STRIPE_MAX_MINOR_AMOUNT = 99_999_999

export function bookingPriceToMinorUnits(price: number | null): number {
  if (
    !Number.isSafeInteger(price) ||
    price === null ||
    price <= 0 ||
    price > STRIPE_MAX_MINOR_AMOUNT
  ) {
    throw new StripePaymentError(
      "invalid_price",
      "Booking price is not payable",
    )
  }
  return price
}

export class StripePaymentError extends Error {
  public readonly reason:
    | "invalid_price"
    | "ineligible"
    | "already_paid"
    | "checkout_busy"
    | "invalid_configuration"

  constructor(
    reason:
      | "invalid_price"
      | "ineligible"
      | "already_paid"
      | "checkout_busy"
      | "invalid_configuration",
    message: string,
  ) {
    super(message)
    this.reason = reason
    this.name = "StripePaymentError"
  }
}

export const CheckoutSessionStateSchema = z.object({
  id: z.string().min(1),
  url: z.string().nullable(),
  status: z.enum(["open", "complete", "expired"]),
  paymentStatus: z.enum(["paid", "unpaid", "no_payment_required"]),
  expiresAt: z.number().int(),
  createdAt: z.number().int(),
  amountTotal: z.number().int().nullable(),
  currency: z.string().nullable(),
  paymentIntentId: z.string().nullable(),
  customerEmail: z.string().nullable(),
  bookingId: z.string().nullable(),
  publicBookingId: z.string().nullable(),
  amountDueId: z.string().nullable(),
})

export type CheckoutSessionState = z.infer<typeof CheckoutSessionStateSchema>

export type PaymentIntentState = {
  id: string
  chargedAmount: number
  refundedAmount: number
  currency: string
  payerEmail: string | null
}

export interface StripeAdapter {
  createCheckoutSession(input: {
    bookingId: number
    publicBookingId: string
    amountDueId: number
    amount: number
    description: string
    customerEmail: string | null
    successUrl: string
    cancelUrl: string
    expiresAt: number
    idempotencyKey: string
  }): Promise<CheckoutSessionState>
  expireCheckoutSession(sessionId: string): Promise<void>
  retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionState>
  retrievePaymentIntent(paymentIntentId: string): Promise<PaymentIntentState>
  constructWebhookEvent(
    payload: string,
    signature: string,
  ): Promise<Stripe.Event>
}

export function stripeObjectId(
  value: string | { id: string } | null,
): string | null {
  const id = typeof value === "string" ? value : value?.id
  return id === undefined || id.length === 0 ? null : id
}

function paymentStatus(
  value: Stripe.Checkout.Session.PaymentStatus,
): CheckoutSessionState["paymentStatus"] {
  switch (value) {
    case "paid":
      return "paid"
    case "unpaid":
      return "unpaid"
    case "no_payment_required":
      return "no_payment_required"
    default:
      throw new Error(`Unsupported Stripe payment status: ${value}`)
  }
}

function toCheckoutSessionState(
  session: Stripe.Checkout.Session,
): CheckoutSessionState {
  return CheckoutSessionStateSchema.parse({
    id: session.id,
    url: session.url,
    status: session.status ?? "expired",
    paymentStatus: paymentStatus(session.payment_status),
    expiresAt: session.expires_at,
    createdAt: session.created,
    amountTotal: session.amount_total,
    currency: session.currency,
    paymentIntentId: stripeObjectId(session.payment_intent),
    customerEmail:
      session.customer_details?.email ?? session.customer_email ?? null,
    bookingId: session.metadata?.booking_id ?? null,
    publicBookingId: session.metadata?.public_booking_id ?? null,
    amountDueId: session.metadata?.amount_due_id ?? null,
  })
}

export async function createStripeAdapter(
  secretKey: string,
  webhookSecret: string,
): Promise<StripeAdapter> {
  if (!secretKey.startsWith("sk_test_")) {
    throw new StripePaymentError(
      "invalid_configuration",
      "Only Stripe test-mode secret keys are accepted",
    )
  }
  if (!webhookSecret.startsWith("whsec_")) {
    throw new StripePaymentError(
      "invalid_configuration",
      "Invalid Stripe webhook signing secret",
    )
  }
  const { default: StripeClient } = await import("stripe")
  const stripe = new StripeClient(secretKey, {
    httpClient: StripeClient.createFetchHttpClient(),
  })

  return {
    async createCheckoutSession(input) {
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          customer_email: input.customerEmail ?? undefined,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: STRIPE_CURRENCY,
                unit_amount: input.amount,
                product_data: { name: input.description || "Booking" },
              },
            },
          ],
          metadata: {
            booking_id: String(input.bookingId),
            public_booking_id: input.publicBookingId,
            amount_due_id: String(input.amountDueId),
          },
          payment_intent_data: {
            metadata: {
              booking_id: String(input.bookingId),
              public_booking_id: input.publicBookingId,
              amount_due_id: String(input.amountDueId),
            },
          },
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          expires_at: input.expiresAt,
        },
        { idempotencyKey: input.idempotencyKey },
      )
      return toCheckoutSessionState(session)
    },
    async expireCheckoutSession(sessionId) {
      await stripe.checkout.sessions.expire(sessionId)
    },
    async retrieveCheckoutSession(sessionId) {
      return toCheckoutSessionState(
        await stripe.checkout.sessions.retrieve(sessionId),
      )
    },
    async retrievePaymentIntent(paymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
      })
      const charge =
        typeof intent.latest_charge === "object" ? intent.latest_charge : null
      if (charge === null) {
        throw new Error("Stripe PaymentIntent has no charge")
      }
      return {
        id: intent.id,
        chargedAmount: charge.amount,
        refundedAmount: charge.amount_refunded,
        currency: charge.currency,
        payerEmail: charge.billing_details.email ?? charge.receipt_email,
      }
    },
    constructWebhookEvent(payload, signature) {
      return stripe.webhooks.constructEventAsync(
        payload,
        signature,
        webhookSecret,
      )
    },
  }
}
