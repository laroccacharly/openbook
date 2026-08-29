import { expect, test } from "@playwright/test"
import { paths, spaHashRedirect } from "@infra/routes"
import { requireAdminPassword } from "../fixtures/admin-login"

test("admin settings are saved explicitly", async ({ page }) => {
  await page.goto(spaHashRedirect(paths.admin.settings))
  await page
    .getByLabel("Password", { exact: true })
    .fill(requireAdminPassword())
  await page.getByRole("button", { name: "Sign in" }).click()

  const autoApprove = page.getByRole("switch", {
    name: "Auto-approve drafts",
  })
  const model = page.getByLabel("Model", { exact: true })
  const save = page.getByRole("button", { name: "Save changes" })

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
  await expect(save).toBeDisabled()

  const originalModel = await model.inputValue()
  const alternateModel =
    originalModel === "openai/gpt-5.6-luna"
      ? "@cf/openai/gpt-oss-120b"
      : "openai/gpt-5.6-luna"
  await model.selectOption(alternateModel)
  await expect(save).toBeEnabled()
  await model.selectOption(originalModel)
  await expect(save).toBeDisabled()

  const originallyEnabled =
    (await autoApprove.getAttribute("aria-checked")) === "true"
  await autoApprove.click()
  await expect(save).toBeEnabled()

  const savedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/config") &&
      response.request().method() === "PATCH",
  )
  await save.click()
  expect((await savedResponse).ok()).toBe(true)
  await expect(page.getByRole("status")).toHaveText("Saved")
  await expect(save).toBeDisabled()

  // Restore the shared deployment's original value.
  await autoApprove.click()
  const restoredResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/config") &&
      response.request().method() === "PATCH",
  )
  await save.click()
  expect((await restoredResponse).ok()).toBe(true)
  await expect(autoApprove).toHaveAttribute(
    "aria-checked",
    String(originallyEnabled),
  )
  await expect(save).toBeDisabled()
})
