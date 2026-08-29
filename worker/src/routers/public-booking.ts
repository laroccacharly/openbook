import { Hono } from "hono"
import { html, raw } from "hono/html"
import type { WorkerEnv } from "@infra/alchemy.run"
import { getBookingByPublicId } from "../db/bookings"
import { getConfiguration } from "../db/configuration"
import {
  PublicBookingIdSchema,
  publicBookingIdFromShortToken,
} from "../public-booking-links"
import type { Booking } from "../types"
import type { BookingAmountDue, BookingPaymentSummary } from "../types/payment"
import {
  getBookingPaymentSummary,
  getAmountDuePayment,
  getCheckoutRecordBySessionId,
  getNextCollectibleAmountDue,
  listBookingAmountsDue,
  listBookingPayments,
} from "../db/payments"

function bookingStatus(booking: Booking): {
  label: "Cancelled" | "Rescheduled" | "Confirmed"
  className: string
} {
  if (booking.cancelledAt !== null) {
    return { label: "Cancelled", className: "cancelled" }
  }
  if (booking.rescheduledAt !== null) {
    return { label: "Rescheduled", className: "rescheduled" }
  }
  return { label: "Confirmed", className: "confirmed" }
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100)
}

function googleMapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

function paymentLabel(payment: BookingPaymentSummary | null): string {
  if (payment === null) return "Amount due"
  switch (payment.status) {
    case "paid":
      return "Paid"
    case "partially_refunded":
      return "Partially refunded"
    case "refunded":
      return "Refunded"
  }
}

function actionLabelForAmountDue(
  kind: BookingAmountDue["kind"],
): "Reserve" | "Pay" {
  switch (kind) {
    case "deposit":
      return "Reserve"
    case "balance":
      return "Pay"
    default: {
      const exhaustive: never = kind
      throw new Error(`Unhandled amount-due kind: ${String(exhaustive)}`)
    }
  }
}

function paymentSection(
  booking: Booking,
  payment: BookingPaymentSummary | null,
  nextAmountDue: BookingAmountDue | null,
  depositOnlyPaid: boolean,
  confirmingPayment: boolean,
) {
  const cancelled = booking.cancelledAt !== null
  let heading: string
  let detail: string
  let buttonLabel: "Reserve" | "Pay" = "Reserve"
  let showButton = true
  let enabled = false

  if (nextAmountDue !== null) {
    buttonLabel = actionLabelForAmountDue(nextAmountDue.kind)
    enabled = !cancelled && !confirmingPayment
    heading = confirmingPayment ? "Confirming payment…" : "Amount due"
    detail = `${formatPrice(nextAmountDue.amount)} CAD · Checkout expires in about 30 minutes.`
  } else if (payment !== null) {
    showButton = false
    const refund =
      payment.refundedAmount > 0
        ? ` · ${formatPrice(payment.refundedAmount)} refunded`
        : ""
    detail = `${formatPrice(payment.chargedAmount)} CAD charged${refund}.`
    if (confirmingPayment) {
      heading = "Confirming payment…"
    } else if (depositOnlyPaid && payment.status === "paid") {
      heading = "Deposit paid"
    } else {
      heading = paymentLabel(payment)
    }
  } else {
    heading = confirmingPayment ? "Confirming payment…" : "Amount due"
    if (booking.estimatedPrice === null || booking.estimatedPrice <= 0) {
      detail = "A valid price is required before this booking can be paid."
    } else {
      detail = `${formatPrice(booking.estimatedPrice)} CAD · Checkout expires in about 30 minutes.`
    }
  }

  const button = showButton
    ? enabled
      ? html`<button class="pay-button" id="pay-button" type="button">
          ${buttonLabel}
        </button>`
      : html`<button class="pay-button" id="pay-button" type="button" disabled>
          ${buttonLabel}
        </button>`
    : ""
  return html`<section class="payment" aria-labelledby="payment-heading">
    <div class="payment-row">
      <div>
        <h2 id="payment-heading">${heading}</h2>
        <p>${detail}</p>
      </div>
      ${button}
    </div>
    <p class="payment-error" id="payment-error" role="alert" hidden></p>
  </section>`
}

function paymentClientScript(
  publicId: string,
  confirmationSessionId: string | null,
) {
  const confirmation =
    confirmationSessionId === null
      ? ""
      : `
    const confirmationKey = "book-payment-confirmation-${confirmationSessionId}";
    const confirmationAttempts = Number(sessionStorage.getItem(confirmationKey) ?? "0");
    if (confirmationAttempts < 15) {
      sessionStorage.setItem(confirmationKey, String(confirmationAttempts + 1));
      setTimeout(() => window.location.reload(), 2000);
    }
  `
  return raw(`
    const payButton = document.getElementById("pay-button");
    const paymentError = document.getElementById("payment-error");
    payButton?.addEventListener("click", async () => {
      payButton.disabled = true;
      paymentError.hidden = true;
      try {
        const response = await fetch("/bookings/${publicId}/payment/checkout", {
          method: "POST",
          headers: { "Accept": "application/json" }
        });
        if (!response.ok) throw new Error("Payment is unavailable right now.");
        const checkout = await response.json();
        window.location.assign(checkout.url);
      } catch (error) {
        paymentError.textContent = error instanceof Error ? error.message : "Payment is unavailable right now.";
        paymentError.hidden = false;
        payButton.disabled = false;
      }
    });
    ${confirmation}
  `)
}

function bookingPage(
  booking: Booking,
  timezone: string,
  payment: BookingPaymentSummary | null,
  nextAmountDue: BookingAmountDue | null,
  depositOnlyPaid: boolean,
  confirmationSessionId: string | null,
) {
  const confirmingPayment = confirmationSessionId !== null
  const status = bookingStatus(booking)
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(booking.startDatetime)
  const time = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  })
  const timeRange = `${time.format(booking.startDatetime)}–${time.format(booking.endDatetime)}`
  const title = booking.description.trim() || "Your booking"
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Event",
    identifier: booking.publicId,
    name: title,
    startDate: booking.startDatetime.toISOString(),
    endDate: booking.endDatetime.toISOString(),
    eventStatus:
      status.label === "Cancelled"
        ? "https://schema.org/EventCancelled"
        : "https://schema.org/EventScheduled",
    ...(booking.address === null
      ? {}
      : {
          location: {
            "@type": "Place",
            address: booking.address,
          },
        }),
    ...(booking.estimatedPrice === null
      ? {}
      : {
          offers: {
            "@type": "Offer",
            price: (booking.estimatedPrice / 100).toFixed(2),
            priceCurrency: "CAD",
          },
        }),
  }).replaceAll("<", "\\u003c")

  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content="#fafafa" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <title>${title} · Booking details</title>
        <script type="application/ld+json">
          ${raw(structuredData)}
        </script>
        <style>
          ${raw(`
          :root { color-scheme: light; font-family: Geist, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #252525; background: #fafafa; }
          * { box-sizing: border-box; }
          body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top, #fff 0, #fafafa 48%, #f3f3f3 100%); }
          main { width: min(100% - 32px, 680px); margin: 0 auto; padding: 64px 0; }
          .eyebrow { margin: 0 0 14px; color: #737373; font-size: 13px; font-weight: 650; letter-spacing: .1em; text-transform: uppercase; }
          .card { overflow: hidden; border: 1px solid #e5e5e5; border-radius: 20px; background: rgba(255,255,255,.92); box-shadow: 0 24px 70px rgba(0,0,0,.08); }
          header { padding: 30px 32px 26px; border-bottom: 1px solid #ededed; }
          .heading-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
          h1 { margin: 0; max-width: 470px; font-size: clamp(26px, 5vw, 36px); line-height: 1.14; letter-spacing: -.035em; }
          .status { flex: none; display: inline-flex; align-items: center; gap: 7px; padding: 7px 11px; border: 1px solid; border-radius: 999px; font-size: 13px; font-weight: 650; }
          .status::before { width: 7px; height: 7px; border-radius: 50%; background: currentColor; content: ""; }
          .confirmed { color: #166534; border-color: #bbf7d0; background: #f0fdf4; }
          .rescheduled { color: #854d0e; border-color: #fde68a; background: #fffbeb; }
          .cancelled { color: #991b1b; border-color: #fecaca; background: #fef2f2; }
          .schedule { padding: 27px 32px; border-bottom: 1px solid #ededed; background: #fcfcfc; }
          .date { margin: 0 0 5px; font-size: 19px; font-weight: 650; }
          .time { margin: 0; color: #666; font-size: 16px; }
          dl { display: grid; grid-template-columns: 150px 1fr; margin: 0; padding: 10px 32px; }
          dt, dd { margin: 0; padding: 18px 0; border-bottom: 1px solid #ededed; }
          dt { color: #737373; font-size: 14px; }
          dd { font-size: 15px; font-weight: 520; overflow-wrap: anywhere; }
          dd a { color: inherit; text-underline-offset: 3px; }
          dd a:hover { color: #166534; }
          dl > :nth-last-child(-n+2) { border-bottom: 0; }
          footer { padding: 20px 32px; color: #858585; border-top: 1px solid #ededed; font-size: 12px; line-height: 1.5; }
          .payment { padding: 25px 32px; border-top: 1px solid #ededed; background: #fcfcfc; }
          .payment-row { display:flex; align-items:center; justify-content:space-between; gap:20px; }
          .payment h2 { margin:0 0 5px; font-size:17px; }
          .payment p { margin:0; color:#666; font-size:14px; line-height:1.5; }
          .pay-button { flex:none; appearance:none; border:0; border-radius:10px; padding:11px 20px; color:white; background:#166534; font:inherit; font-weight:650; cursor:pointer; }
          .pay-button:hover { background:#14532d; }
          .pay-button:disabled { color:#8b8b8b; background:#e5e5e5; cursor:not-allowed; }
          .payment-error { margin-top:10px !important; color:#991b1b !important; }
          @media (max-width: 560px) { main { padding: 24px 0; } header, .schedule, footer { padding-left: 22px; padding-right: 22px; } .heading-row { display: block; } .status { margin-top: 18px; } dl { grid-template-columns: 1fr; padding: 8px 22px; } dt { padding-bottom: 4px; border: 0; } dd { padding-top: 0; } dl > :nth-last-child(2) { padding-bottom: 4px; } }
        `)}
        </style>
      </head>
      <body>
        <main>
          <p class="eyebrow">Booking details</p>
          <article class="card">
            <header>
              <div class="heading-row">
                <h1>${title}</h1>
                <span class="status ${status.className}">${status.label}</span>
              </div>
            </header>
            <section class="schedule" aria-label="Appointment time">
              <p class="date">${date}</p>
              <p class="time">${timeRange} (${timezone})</p>
            </section>
            <dl>
              ${
                booking.address === null
                  ? ""
                  : html`<dt>Service address</dt>
                      <dd>
                        <a
                          href="${googleMapsUrl(booking.address)}"
                          target="_blank"
                          rel="noopener noreferrer"
                          >${booking.address}</a
                        >
                      </dd>`
              }
              ${
                booking.estimatedPrice === null
                  ? ""
                  : html`<dt>Estimated price</dt>
                      <dd>${formatPrice(booking.estimatedPrice)}</dd>`
              }
              <dt>Booking reference</dt>
              <dd>${booking.publicId}</dd>
            </dl>
            ${paymentSection(booking, payment, nextAmountDue, depositOnlyPaid, confirmingPayment)}
            <footer>
              This private link shows the latest details for your booking. Keep
              it for your records.
            </footer>
          </article>
        </main>
        <script>
          ${paymentClientScript(booking.publicId, confirmationSessionId)}
        </script>
      </body>
    </html>`
}

function notFoundPage() {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <title>Booking not found</title>
      </head>
      <body
        style="margin:0;background:#fafafa;color:#252525;font-family:ui-sans-serif,system-ui,sans-serif"
      >
        <main
          style="width:min(100% - 32px,600px);margin:12vh auto;padding:32px;border:1px solid #e5e5e5;border-radius:18px;background:white"
        >
          <h1 style="margin-top:0">Booking not found</h1>
          <p style="margin-bottom:0;color:#666">
            This link is invalid or the booking is no longer available.
          </p>
        </main>
      </body>
    </html>`
}

export const publicBookingRouter = new Hono<{ Bindings: WorkerEnv }>()
  .get("/b/:token", (c) => {
    const publicId = publicBookingIdFromShortToken(c.req.param("token"))
    if (publicId === null) {
      c.header("Cache-Control", "no-store")
      return c.html(notFoundPage(), 404)
    }
    c.header("Cache-Control", "no-store")
    return c.redirect(
      new URL(`/bookings/${publicId}`, c.req.url).toString(),
      302,
    )
  })
  .get("/bookings/:publicId", async (c) => {
    c.header("Cache-Control", "no-store")
    const parsed = PublicBookingIdSchema.safeParse(c.req.param("publicId"))
    if (!parsed.success) {
      return c.html(notFoundPage(), 404)
    }
    const booking = await getBookingByPublicId(c.env.DB, parsed.data)
    if (booking === null || booking.deleteAt !== null) {
      return c.html(notFoundPage(), 404)
    }
    const payment = await getBookingPaymentSummary(c.env.DB, booking.id)
    const nextAmountDue = await getNextCollectibleAmountDue(c.env.DB, booking)
    const [amountsDue, payments] = await Promise.all([
      listBookingAmountsDue(c.env.DB, booking.id),
      listBookingPayments(c.env.DB, booking.id),
    ])
    const paidAmountDueIds = new Set(payments.map((row) => row.amountDueId))
    const depositOnlyPaid =
      amountsDue.some(
        (amountDue) =>
          amountDue.kind === "deposit" && paidAmountDueIds.has(amountDue.id),
      ) &&
      !amountsDue.some(
        (amountDue) =>
          amountDue.kind === "balance" && paidAmountDueIds.has(amountDue.id),
      )
    const checkoutHint = c.req.query("checkout")
    const checkout =
      checkoutHint === undefined
        ? null
        : await getCheckoutRecordBySessionId(c.env.DB, checkoutHint)
    const amountDuePayment =
      checkout === null
        ? null
        : await getAmountDuePayment(c.env.DB, checkout.amountDueId)
    const confirmationSessionId =
      checkout !== null &&
      checkout.bookingId === booking.id &&
      checkout.sessionId === checkoutHint &&
      amountDuePayment === null
        ? checkoutHint
        : null
    const { timezone } = await getConfiguration(c.env.DB)
    return c.html(
      bookingPage(
        booking,
        timezone,
        payment,
        nextAmountDue,
        depositOnlyPaid,
        confirmationSessionId,
      ),
    )
  })
