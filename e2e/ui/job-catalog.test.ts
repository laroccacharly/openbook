import { expect, test } from "@playwright/test"
import { paths, spaHashRedirect } from "@infra/routes"
import { requireAdminPassword } from "../fixtures/admin-login"

test("admin can view the job catalog", async ({ page }) => {
  await page.goto(spaHashRedirect(paths.admin.jobCatalog))
  await page
    .getByLabel("Password", { exact: true })
    .fill(requireAdminPassword())
  await page.getByRole("button", { name: "Sign in" }).click()

  await expect(page).toHaveURL(new RegExp(`#${paths.admin.jobCatalog}$`))
  await expect(page.getByRole("heading", { name: "Job catalog" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Job catalog" })).toBeVisible()

  const table = page.getByRole("table")
  await expect(table).toBeVisible()
  await expect(table.locator("tbody").getByRole("row").first()).toBeVisible()
})
