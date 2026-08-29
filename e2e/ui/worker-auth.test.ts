import { randomUUID } from "node:crypto"
import { expect, test } from "@playwright/test"
import { paths, spaHashRedirect } from "@infra/routes"
import { requireAdminPassword } from "../fixtures/admin-login"

test("admin provisions a worker who changes their password and sees only assigned bookings", async ({
  page,
  request,
}) => {
  const marker = randomUUID()
  const workerName = `Worker ${marker}`
  const otherWorkerName = `Other ${marker}`
  const email = `worker-${marker}@example.com`
  const assignedDescription = `Assigned ${marker}`
  const otherDescription = `Other ${marker}`
  const newPassword = `Changed-${marker}!9a`

  await page.goto(spaHashRedirect(paths.admin.workers))
  await page
    .getByLabel("Password", { exact: true })
    .fill(requireAdminPassword())
  await page.getByRole("button", { name: "Sign in" }).click()

  async function createWorker(name: string) {
    await page.getByLabel("Name", { exact: true }).fill(name)
    await page.getByRole("button", { name: "Create worker" }).click()
    const card = page.getByRole("listitem").filter({ hasText: name })
    await expect(card).toBeVisible()
    return card
  }

  const workerCard = await createWorker(workerName)
  const otherWorkerCard = await createWorker(otherWorkerName)

  await workerCard.getByLabel("Account email").fill(email)
  await workerCard.getByRole("button", { name: "Create account" }).click()
  const temporaryPassword = await workerCard
    .getByTestId("temporary-password")
    .textContent()
  expect(temporaryPassword).toBeTruthy()

  const workerId = Number(await workerCard.getAttribute("data-worker-id"))
  const otherWorkerId = Number(
    await otherWorkerCard.getAttribute("data-worker-id"),
  )
  expect(workerId).toBeGreaterThan(0)
  expect(otherWorkerId).toBeGreaterThan(0)

  const start = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  const bookingIds = await page.evaluate(
    async ({
      workerId,
      otherWorkerId,
      assignedDescription,
      otherDescription,
      start,
      end,
    }) => {
      async function create(workerIds: number[], description: string) {
        const response = await fetch("/api/bookings", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workerIds,
            description,
            startDatetime: start,
            endDatetime: end,
            address: "Worker auth E2E",
          }),
        })
        if (!response.ok) throw new Error(await response.text())
        return ((await response.json()) as { booking: { id: number } }).booking
          .id
      }
      return [
        await create([workerId], assignedDescription),
        await create([otherWorkerId], otherDescription),
      ]
    },
    {
      workerId,
      otherWorkerId,
      assignedDescription,
      otherDescription,
      start: start.toISOString(),
      end: end.toISOString(),
    },
  )

  const adminLogout = page.waitForResponse(
    (response) =>
      response.url().endsWith(`${paths.admin.root}/logout`) &&
      response.request().method() === "POST",
  )
  await page.getByRole("button", { name: "Sign out" }).click()
  expect((await adminLogout).ok()).toBe(true)
  await page.goto(spaHashRedirect(paths.worker.signIn))
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password", { exact: true }).fill(temporaryPassword!)
  await page.getByRole("button", { name: "Sign in" }).click()

  await expect(page).toHaveURL(new RegExp(`#${paths.worker.changePassword}$`))
  await page.goto(spaHashRedirect(paths.worker.bookings))
  await expect(page).toHaveURL(new RegExp(`#${paths.worker.changePassword}$`))
  await page.getByLabel("Current password").fill(temporaryPassword!)
  await page.getByLabel("New password", { exact: true }).fill(newPassword)
  await page.getByLabel("Confirm new password").fill(newPassword)
  await page.getByRole("button", { name: "Change password" }).click()

  await expect(page).toHaveURL(new RegExp(`#${paths.worker.dashboard}$`))
  await expect(page.getByText(email)).toBeVisible()
  await expect(page.getByText(/account created/i)).toBeVisible()
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Bookings" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Workers" })).toHaveCount(0)

  await page.getByRole("link", { name: "Bookings" }).click()
  await expect(page.getByRole("table")).toBeVisible()
  await expect(page.getByText(assignedDescription)).toBeVisible()
  await expect(page.getByText(otherDescription)).toHaveCount(0)

  const adminApiStatus = await page.evaluate(
    async () =>
      (await fetch("/api/workers", { credentials: "include" })).status,
  )
  expect(adminApiStatus).toBe(401)

  await page.goto(spaHashRedirect(paths.admin.workers))
  await expect(
    page.getByRole("heading", { name: "Admin sign in" }),
  ).toBeVisible()

  const apiKey = process.env.BOOK_API_KEY
  if (!apiKey)
    throw new Error("BOOK_API_KEY is required. Run via `bun run test ui`.")
  for (const id of bookingIds) {
    const response = await request.delete(`/api/bookings/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    expect(response.ok()).toBe(true)
  }
  for (const id of [workerId, otherWorkerId]) {
    const response = await request.delete(`/api/workers/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    expect(response.ok()).toBe(true)
  }
})
