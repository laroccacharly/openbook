import { expect, test } from "@playwright/test"
import { paths, spaHashRedirect } from "@infra/routes"
import { requireAdminPassword } from "../fixtures/admin-login"

test("admin can sign in and sign out", async ({ page }) => {
  const password = requireAdminPassword()

  await page.goto(spaHashRedirect(paths.admin.home))
  await expect(
    page.getByRole("heading", { name: "Admin sign in" }),
  ).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`#${paths.admin.login}$`))

  await page.getByLabel("Password", { exact: true }).fill(`${password}-invalid`)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByRole("alert")).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`#${paths.admin.login}$`))

  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`#${paths.admin.home}$`))

  await page.reload()
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible()

  await page.goto(spaHashRedirect(paths.admin.logs))
  const messages = page.getByRole("region", { name: "Messages" })
  await expect(messages).toBeVisible()
  await messages.getByRole("button", { name: "Show Messages" }).click()
  await expect(messages.getByText("Loading messages…")).not.toBeVisible()
  const messagesTable = messages.getByRole("table")
  const messagesEmpty = messages.getByText("No messages")
  await expect(messagesTable.or(messagesEmpty)).toBeVisible()
  const visibleMessageCount = await messages.locator("tbody tr").count()
  console.log(`Messages visible: ${visibleMessageCount}`)

  const responses = page.getByRole("region", { name: "Responses" })
  await expect(responses).toBeVisible()
  await responses.getByRole("button", { name: "Show Responses" }).click()
  await expect(responses.getByText("Loading responses…")).not.toBeVisible()
  const visibleResponseCount = await responses.getByRole("listitem").count()
  await expect(
    responses.getByText(`${visibleResponseCount} responses`),
  ).toBeVisible()
  console.log(`Responses visible: ${visibleResponseCount}`)

  const logoutResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`${paths.admin.root}/logout`) &&
      response.request().method() === "POST",
  )
  await page.getByRole("button", { name: "Sign out" }).click()
  expect((await logoutResponse).ok()).toBe(true)
  await expect(
    page.getByRole("heading", { name: "Admin sign in" }),
  ).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`#${paths.admin.login}$`))
})
