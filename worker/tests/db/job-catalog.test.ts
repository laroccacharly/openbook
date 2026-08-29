import { env } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import {
  createCatalogJob,
  deleteCatalogJob,
  getCatalogJobById,
  getJobCatalog,
  updateCatalogJob,
} from "@worker/src/db/job-catalog"
import { testApiClient } from "../fixtures/api-client"

describe("job catalog persistence", () => {
  test("starts with seeded jobs", async () => {
    await expect(getJobCatalog(env.DB)).resolves.toEqual([
      {
        id: 1,
        name: "Replacing/fixing sinks",
        estimatedPriceCents: 50_000,
        durationMinutes: 60,
        workerCount: 1,
      },
      {
        id: 2,
        name: "Fixing hot water heaters",
        estimatedPriceCents: 100_000,
        durationMinutes: 120,
        workerCount: 1,
      },
      {
        id: 3,
        name: "Replacing a bathtub",
        estimatedPriceCents: 200_000,
        durationMinutes: 120,
        workerCount: 2,
      },
    ])
  })

  test("creates, reads, updates, and deletes a job", async () => {
    const created = await createCatalogJob(env.DB, {
      name: "Drain cleaning",
      estimatedPriceCents: 250,
      durationMinutes: 90,
      workerCount: 1,
    })
    await expect(getCatalogJobById(env.DB, created.id)).resolves.toEqual(
      created,
    )

    const updated = await updateCatalogJob(env.DB, created.id, {
      estimatedPriceCents: 300,
      workerCount: 2,
    })
    expect(updated).toMatchObject({
      name: "Drain cleaning",
      estimatedPriceCents: 300,
      durationMinutes: 90,
      workerCount: 2,
    })
    await expect(updateCatalogJob(env.DB, created.id, {})).resolves.toEqual(
      updated,
    )
    await expect(deleteCatalogJob(env.DB, created.id)).resolves.toEqual(updated)
    await expect(getCatalogJobById(env.DB, created.id)).resolves.toBeNull()
  })
})

describe("job catalog API", () => {
  test("supports CRUD through the typed client", async () => {
    const initial = await testApiClient.listJobCatalog()
    expect(initial).toHaveLength(3)

    const created = await testApiClient.createCatalogJob({
      name: "Toilet repair",
      estimatedPriceCents: 225,
      durationMinutes: 60,
      workerCount: 1,
    })
    await expect(testApiClient.getCatalogJob(created.id)).resolves.toEqual(
      created,
    )

    const updated = await testApiClient.updateCatalogJob(created.id, {
      durationMinutes: 75,
    })
    expect(updated.durationMinutes).toBe(75)
    await expect(testApiClient.deleteCatalogJob(created.id)).resolves.toEqual(
      updated,
    )
  })
})
