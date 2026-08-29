import { env } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import app from "@worker/src/app"
import { cancelBooking, createBooking } from "@worker/src/db/bookings"
import { listBookingAmountsDue } from "@worker/src/db/payments"

describe("public Stripe routes", () => {
  test("uses non-enumerable errors for invalid booking capabilities", async () => {
    const response = await app.request(
      "https://stage.book.test/bookings/not-a-capability/payment/checkout",
      { method: "POST" },
      env,
    )
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "payment_unavailable" })
  })

  test("rejects webhook payloads without a valid Stripe signature", async () => {
    const response = await app.request(
      "https://stage.book.test/stripe/webhook",
      {
        method: "POST",
        headers: { "Stripe-Signature": "invalid" },
        body: "{}",
      },
      env,
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "invalid_signature" })
  })

  test("renders disabled payment controls for cancelled and invalid-price bookings", async () => {
    const invalidPrice = await createBooking(env.DB, {
      workerIds: [],
      startDatetime: new Date("2026-08-20T14:00:00Z"),
      endDatetime: new Date("2026-08-20T15:00:00Z"),
      estimatedPrice: 0,
    })
    const cancelled = await createBooking(env.DB, {
      workerIds: [],
      startDatetime: new Date("2026-08-21T14:00:00Z"),
      endDatetime: new Date("2026-08-21T15:00:00Z"),
      estimatedPrice: 100,
    })
    await cancelBooking(env.DB, cancelled.id)

    for (const booking of [invalidPrice, cancelled]) {
      const response = await app.request(
        `https://stage.book.test/bookings/${booking.publicId}`,
        undefined,
        env,
      )
      expect(response.status).toBe(200)
      expect(response.headers.get("Cache-Control")).toBe("no-store")
      expect(await response.text()).toContain(
        '<button class="pay-button" id="pay-button" type="button" disabled>',
      )
    }

    const payable = await createBooking(env.DB, {
      workerIds: [],
      startDatetime: new Date("2026-08-22T14:00:00Z"),
      endDatetime: new Date("2026-08-22T15:00:00Z"),
      estimatedPrice: 100,
    })
    const payableResponse = await app.request(
      `https://stage.book.test/bookings/${payable.publicId}`,
      undefined,
      env,
    )
    expect(await payableResponse.text()).toContain(
      '<button class="pay-button" id="pay-button" type="button">',
    )
  })

  test("does not create a deposit while reading a booking without amounts due", async () => {
    const booking = await createBooking(env.DB, {
      workerIds: [],
      startDatetime: new Date("2026-08-23T14:00:00Z"),
      endDatetime: new Date("2026-08-23T15:00:00Z"),
      estimatedPrice: 100,
    })
    await env.DB.prepare("DELETE FROM booking_amounts_due WHERE booking_id = ?")
      .bind(booking.id)
      .run()

    const response = await app.request(
      `https://stage.book.test/bookings/${booking.publicId}`,
      undefined,
      env,
    )

    expect(response.status).toBe(200)
    expect(await listBookingAmountsDue(env.DB, booking.id)).toEqual([])
    expect(await response.text()).toContain(
      '<button class="pay-button" id="pay-button" type="button" disabled>',
    )
  })
})
