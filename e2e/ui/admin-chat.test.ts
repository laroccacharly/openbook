import { randomUUID } from "node:crypto"
import { expect, test, type Page } from "@playwright/test"
import { paths, spaHashRedirect } from "@infra/routes"
import { requireAdminPassword } from "../fixtures/admin-login"
import {
  setupApiClient,
  teardownApiClient,
  testApiClient,
} from "../fixtures/api-client"

test.beforeAll(setupApiClient)
test.afterAll(teardownApiClient)

test.describe.configure({ mode: "serial" })

async function signInToAdminChat(page: Page): Promise<void> {
  await page.goto(spaHashRedirect(paths.admin.chat))
  await page
    .getByLabel("Password", { exact: true })
    .fill(requireAdminPassword())
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`#${paths.admin.chat}$`))
}

async function sendChatMessage(page: Page, text: string): Promise<void> {
  const composer = page.getByPlaceholder("Ask about bookings…")
  await expect(composer).toBeVisible()
  await composer.fill(text)
  await page.getByRole("button", { name: "Send message" }).click()
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible({
    timeout: 90_000,
  })
}

async function resetAdminChatIfNeeded(page: Page): Promise<void> {
  const reset = page.getByRole("button", { name: "Reset chat" })
  await expect(reset).toBeVisible()
  if (await reset.isEnabled()) {
    await reset.click()
    await expect(
      page.getByText("Ask about bookings", { exact: true }),
    ).toBeVisible()
  }
}

test("admin chat reports how many bookings exist", async ({ page }) => {
  test.setTimeout(90_000)

  await page.goto(spaHashRedirect(paths.admin.chat))
  await page
    .getByLabel("Password", { exact: true })
    .fill(requireAdminPassword())
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`#${paths.admin.chat}$`))

  await page.reload()
  const composer = page.getByPlaceholder("Ask about bookings…")
  await expect(composer).toBeVisible()

  await composer.fill("How many bookings do we have?")
  await page.getByRole("button", { name: "Send message" }).click()
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible({
    timeout: 90_000,
  })

  const log = page.getByRole("log")
  await expect(log).toContainText(/querySql · [1-9]\d*\+? rows?/)
  await expect(log).toContainText(/[1-9]\d* (active )?bookings/i)
})

test("admin chat messages survive a reload", async ({ page }) => {
  test.setTimeout(90_000)

  const token = `persist-${randomUUID()}`
  const prompt = `Repeat this token back to me: ${token}`

  await page.goto(spaHashRedirect(paths.admin.chat))
  await page
    .getByLabel("Password", { exact: true })
    .fill(requireAdminPassword())
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`#${paths.admin.chat}$`))

  const composer = page.getByPlaceholder("Ask about bookings…")
  await expect(composer).toBeVisible()
  await composer.fill(prompt)
  await page.getByRole("button", { name: "Send message" }).click()
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible({
    timeout: 90_000,
  })

  await expect(page.getByRole("log")).toContainText(prompt)

  await page.reload()
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible()
  await expect(page.getByPlaceholder("Ask about bookings…")).toBeVisible()
  await expect(page.getByRole("log")).toContainText(prompt)

  await page.getByRole("button", { name: "Reset chat" }).click()
  await expect(
    page.getByText("Ask about bookings", { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(prompt)).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible()
  await expect(page.getByPlaceholder("Ask about bookings…")).toBeVisible()
  await expect(
    page.getByText("Ask about bookings", { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(prompt)).toHaveCount(0)
})

test("admin chat asks for confirmation before a write", async ({ page }) => {
  test.setTimeout(180_000)

  const token = `write-sql-${randomUUID()}`
  const outcome = await testApiClient.createBooking({
    workerIds: [],
    startDatetime: "2027-08-13T14:00:00.000Z",
    endDatetime: "2027-08-13T15:00:00.000Z",
    description: `before ${token}`,
  })
  const bookingId = outcome.booking.id

  try {
    await signInToAdminChat(page)
    await resetAdminChatIfNeeded(page)

    await sendChatMessage(
      page,
      `Update booking ${bookingId} so its description is exactly "${token}". Do not change anything else.`,
    )

    const log = page.getByRole("log")
    await expect(log).not.toContainText(/writeSql ·/)
    const confirmationText = (await log.innerText()).trim()
    const { result: askedForConfirmation } = await testApiClient.llmAssert({
      prompt:
        "The assistant asked the user to confirm before making a database change, and did not claim the change was already done.",
      text: confirmationText,
    })
    expect(askedForConfirmation).toBe(true)

    await sendChatMessage(page, "Yes, go ahead and run that update.")
    await expect(log).toContainText(/writeSql · [1-9]\d* changes?/)

    const updated = await testApiClient.getBooking(bookingId)
    expect(updated.description).toBe(token)

    await page.getByRole("button", { name: "Reset chat" }).click()
    await expect(
      page.getByText("Ask about bookings", { exact: true }),
    ).toBeVisible()
  } finally {
    await testApiClient.deleteBooking(bookingId)
  }
})
