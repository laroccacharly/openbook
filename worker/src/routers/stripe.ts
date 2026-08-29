import { Hono } from "hono"
import type { WorkerEnv } from "@infra/alchemy.run"
import { getBookingByPublicId } from "../db/bookings"
import { PublicBookingIdSchema } from "../public-booking-links"
import { createStripeAdapter, StripePaymentError } from "../stripe/adapter"
import { createOrReuseCheckout } from "../stripe/checkout"
import { processStripeEvent } from "../stripe/webhook"

function adapter(env: WorkerEnv) {
  return createStripeAdapter(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET)
}

function paymentErrorStatus(error: StripePaymentError): 409 | 503 {
  return error.reason === "invalid_configuration" ? 503 : 409
}

export const stripePaymentRouter = new Hono<{ Bindings: WorkerEnv }>().post(
  "/bookings/:publicId/payment/checkout",
  async (c) => {
    const parsed = PublicBookingIdSchema.safeParse(c.req.param("publicId"))
    if (!parsed.success) return c.json({ error: "payment_unavailable" }, 404)
    const booking = await getBookingByPublicId(c.env.DB, parsed.data)
    if (booking === null || booking.deleteAt !== null) {
      return c.json({ error: "payment_unavailable" }, 404)
    }
    try {
      return c.json(
        await createOrReuseCheckout(
          c.env.DB,
          await adapter(c.env),
          booking,
          c.env.BOOK_PUBLIC_ORIGIN,
        ),
      )
    } catch (error) {
      if (error instanceof StripePaymentError) {
        return c.json(
          { error: "payment_unavailable" },
          paymentErrorStatus(error),
        )
      }
      throw error
    }
  },
)

export const stripeWebhookRouter = new Hono<{ Bindings: WorkerEnv }>().post(
  "/stripe/webhook",
  async (c) => {
    const signature = c.req.header("Stripe-Signature")
    if (signature === undefined)
      return c.json({ error: "invalid_signature" }, 400)
    const stripe = await adapter(c.env)
    let event
    try {
      event = await stripe.constructWebhookEvent(await c.req.text(), signature)
    } catch {
      return c.json({ error: "invalid_signature" }, 400)
    }
    try {
      const outcome = await processStripeEvent(c.env.DB, stripe, event)
      return c.json({ received: true, outcome })
    } catch (error) {
      const message = error instanceof Error ? error.message : "webhook_failed"
      return c.json({ error: "webhook_failed", message }, 500)
    }
  },
)
