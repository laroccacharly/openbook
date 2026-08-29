import { expect, test, type Locator, type Page } from "@playwright/test"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { resolveDeploymentOrigin } from "@infra/deployment-context"
import { paths, spaHashRedirect } from "@infra/routes"
import { requireAdminPassword } from "../fixtures/admin-login"
import {
  setupApiClient,
  teardownApiClient,
  testApiClient,
} from "../fixtures/api-client"

const createdBookingIds: number[] = []

test.beforeAll(setupApiClient)
test.afterAll(async () => {
  for (const bookingId of createdBookingIds) {
    await testApiClient.deleteBooking(bookingId)
  }
  await teardownApiClient()
})

async function createStripeTestBooking(
  input: Parameters<typeof testApiClient.createBooking>[0],
): Promise<Awaited<ReturnType<typeof testApiClient.createBooking>>> {
  const outcome = await testApiClient.createBooking(input)
  createdBookingIds.push(outcome.booking.id)
  return outcome
}

const execFileAsync = promisify(execFile)

const requiredWebhookEvents = [
  "charge.refunded",
  "checkout.session.async_payment_succeeded",
  "checkout.session.completed",
  "checkout.session.expired",
] as const

function stripeCliEnvironment(): NodeJS.ProcessEnv {
  const stripeApiKey = process.env.STRIPE_TEST_SECRET_KEY
  if (!stripeApiKey?.startsWith("sk_test_")) {
    throw new Error(
      "STRIPE_TEST_SECRET_KEY is required to run Stripe CLI tests",
    )
  }
  return { ...process.env, STRIPE_API_KEY: stripeApiKey }
}

async function runStripeCli(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("stripe", args, {
    env: stripeCliEnvironment(),
    timeout: 30_000,
  })
  return stdout
}

async function simulateCompletedStripeCheckout(input: {
  amount: number
  bookingId: number
  publicBookingId: string
  amountDueId: number
}): Promise<void> {
  const metadata = {
    booking_id: String(input.bookingId),
    public_booking_id: input.publicBookingId,
    amount_due_id: String(input.amountDueId),
  }
  await runStripeCli([
    "trigger",
    "checkout.session.completed",
    "--raw",
    JSON.stringify({
      _meta: { template_version: 0 },
      fixtures: [
        {
          name: "product",
          path: "/v1/products",
          method: "post",
          params: {
            name: "Booking",
            description: "(created by Stripe CLI)",
          },
        },
        {
          name: "price",
          path: "/v1/prices",
          method: "post",
          params: {
            product: "${product:id}",
            unit_amount: input.amount,
            currency: "cad",
          },
        },
        {
          name: "checkout_session",
          path: "/v1/checkout/sessions",
          method: "post",
          params: {
            success_url: "https://httpbin.org/post",
            cancel_url: "https://httpbin.org/post",
            mode: "payment",
            line_items: [{ price: "${price:id}", quantity: 1 }],
            metadata,
            payment_intent_data: { metadata },
          },
        },
        {
          name: "payment_page",
          path: "/v1/payment_pages/${checkout_session:id}",
          method: "get",
        },
        {
          name: "payment_method",
          path: "/v1/payment_methods",
          method: "post",
          params: {
            type: "card",
            card: { token: "tok_visa" },
            billing_details: {
              email: "stripe@example.com",
              name: "Jenny Rosen",
            },
          },
        },
        {
          name: "payment_page_confirm",
          path: "/v1/payment_pages/${checkout_session:id}/confirm",
          method: "post",
          params: {
            payment_method: "${payment_method:id}",
            expected_amount: input.amount,
          },
        },
      ],
    }),
  ])
}

async function waitForHeading(page: Page, url: string, name: string) {
  await expect(async () => {
    await page.goto(url)
    await expect(page.getByRole("heading", { name })).toBeVisible()
  }).toPass({ timeout: 30_000 })
}

async function findBookingRow(
  page: Page,
  description: string,
): Promise<Locator> {
  await expect(page.getByRole("table")).toBeVisible()
  for (;;) {
    const row = page.getByRole("row").filter({ hasText: description })
    if ((await row.count()) > 0) return row
    const next = page.getByRole("button", { name: "Next" })
    if (await next.isDisabled())
      throw new Error(`Booking row not found: ${description}`)
    await next.click()
  }
}

test("stripe: webhook endpoint is configured", async () => {
  const expectedUrl = new URL(
    "/stripe/webhook",
    resolveDeploymentOrigin(),
  ).toString()
  const response = JSON.parse(
    await runStripeCli(["webhook_endpoints", "list", "--limit", "100"]),
  ) as {
    data: Array<{
      enabled_events: string[]
      status: string
      url: string
    }>
  }
  const endpoint = response.data.find(
    (candidate) =>
      candidate.url === expectedUrl &&
      candidate.status === "enabled" &&
      requiredWebhookEvents.every((event) =>
        candidate.enabled_events.includes(event),
      ),
  )
  expect(
    endpoint,
    `Expected an enabled Stripe webhook endpoint at ${expectedUrl} with Book's required events`,
  ).toBeDefined()
})

test("stripe: invalid-price booking shows a disabled Reserve control", async ({
  page,
}) => {
  const outcome = await createStripeTestBooking({
    workerIds: [],
    startDatetime: "2027-01-20T14:00:00.000Z",
    endDatetime: "2027-01-20T15:00:00.000Z",
    description: `Stripe disabled ${Date.now()}`,
    estimatedPrice: 0,
  })
  await page.goto(`/bookings/${outcome.booking.publicId}`)
  await expect(page.getByRole("button", { name: "Reserve" })).toBeDisabled()
})

test("stripe: customer reserves a booking with a $50 deposit", async ({
  page,
}) => {
  test.setTimeout(90_000)
  const description = `Stripe deposit ${Date.now()}`
  const outcome = await createStripeTestBooking({
    workerIds: [],
    startDatetime: "2027-01-21T14:00:00.000Z",
    endDatetime: "2027-01-21T15:00:00.000Z",
    description,
    estimatedPrice: 100 + (Math.floor(Date.now() / 1000) % 800),
  })
  const details = await testApiClient.getBooking(outcome.booking.id)
  const deposit = details.amountsDue.find(
    (amountDue) => amountDue.kind === "deposit",
  )
  expect(deposit).toBeDefined()
  if (deposit === undefined) throw new Error("Expected a deposit amount due")
  const { depositAmount } = await testApiClient.getConfiguration()

  await page.goto(`/bookings/${outcome.booking.publicId}`)
  await expect(
    page.getByText(
      `${new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
      }).format(
        depositAmount / 100,
      )} CAD · Checkout expires in about 30 minutes.`,
    ),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Reserve" })).toBeEnabled()
  await expect(page.getByRole("button", { name: "Pay" })).toHaveCount(0)
  await simulateCompletedStripeCheckout({
    amount: depositAmount,
    bookingId: outcome.booking.id,
    publicBookingId: outcome.booking.publicId,
    amountDueId: deposit.id,
  })
  await waitForHeading(
    page,
    `/bookings/${outcome.booking.publicId}`,
    "Deposit paid",
  )
  await expect(page.getByRole("button", { name: "Reserve" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Pay" })).toHaveCount(0)
})

test("stripe: customer pays the full balance after enableBalanceDue", async ({
  page,
}) => {
  test.setTimeout(90_000)
  const amount = 100 + (Math.floor(Date.now() / 1000) % 800)
  const description = `Stripe payment ${Date.now()}`
  const outcome = await createStripeTestBooking({
    workerIds: [],
    startDatetime: "2027-01-21T14:00:00.000Z",
    endDatetime: "2027-01-21T15:00:00.000Z",
    description,
    estimatedPrice: amount,
  })
  await testApiClient.enableBalanceDue(outcome.booking.id, {
    finalPrice: amount,
  })
  const details = await testApiClient.getBooking(outcome.booking.id)
  const balance = details.amountsDue.find(
    (amountDue) => amountDue.kind === "balance",
  )
  expect(balance).toBeDefined()
  if (balance === undefined) throw new Error("Expected a balance amount due")

  await page.goto(`/bookings/${outcome.booking.publicId}`)
  await expect(page.getByRole("button", { name: "Pay" })).toBeEnabled()
  await expect(page.getByRole("button", { name: "Reserve" })).toHaveCount(0)
  await simulateCompletedStripeCheckout({
    amount,
    bookingId: outcome.booking.id,
    publicBookingId: outcome.booking.publicId,
    amountDueId: balance.id,
  })
  await waitForHeading(page, `/bookings/${outcome.booking.publicId}`, "Paid")
  await expect(page.getByRole("button", { name: "Pay" })).toHaveCount(0)

  await page.goto(spaHashRedirect(paths.admin.bookings))
  await page
    .getByLabel("Password", { exact: true })
    .fill(requireAdminPassword())
  await page.getByRole("button", { name: "Sign in" }).click()
  const row = await findBookingRow(page, description)
  await expect(row).toContainText("Paid")
  await expect(row).toContainText(
    new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(amount / 100),
  )
})
