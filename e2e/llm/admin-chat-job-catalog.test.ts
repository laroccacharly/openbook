import { randomUUID } from "node:crypto"
import { expect } from "vitest"
import { test } from "../fixtures/admin-chat"
import { testApiClient } from "../fixtures/api-client"

test("admin chat creates a job that appears on the catalog endpoint", async ({
  adminChat,
}) => {
  const name = `LLM drain cleaning ${randomUUID()}`
  let createdId: number | undefined

  try {
    await adminChat.send(
      `Create a job catalog entry named "${name}" with an estimated price of 275 dollars, a duration of 75 minutes, and 2 workers. Describe the exact change and ask me to confirm before writing it.`,
    )

    expect(
      (await testApiClient.listJobCatalog()).some((job) => job.name === name),
    ).toBe(false)

    await adminChat.send("Yes, I confirm that exact change.")

    const created = (await testApiClient.listJobCatalog()).find(
      (job) => job.name === name,
    )
    expect(created).toMatchObject({
      name,
      estimatedPriceCents: 27_500,
      durationMinutes: 75,
      workerCount: 2,
    })
    createdId = created?.id
  } finally {
    if (createdId === undefined) {
      createdId = (await testApiClient.listJobCatalog()).find(
        (job) => job.name === name,
      )?.id
    }
    if (createdId !== undefined) {
      await testApiClient.deleteCatalogJob(createdId)
    }
  }
})

test("admin chat asks for required fields when a job request is incomplete", async ({
  adminChat,
}) => {
  const name = `Incomplete LLM job ${randomUUID()}`
  let unexpectedJobId: number | undefined

  try {
    await adminChat.send(
      `Create a job catalog entry named "${name}" with an estimated price of 180 dollars. I have not specified anything else.`,
    )
    const responseText = await adminChat.send(
      "Yes, proceed with creating it based only on the information I gave you.",
    )

    const jobs = await testApiClient.listJobCatalog()
    unexpectedJobId = jobs.find((job) => job.name === name)?.id
    expect(unexpectedJobId).toBeUndefined()

    const { result: asksForMissingFields } = await testApiClient.llmAssert({
      prompt:
        "The assistant says the job cannot yet be created and asks the user to provide the missing duration and worker count. It does not claim the job was created.",
      text: responseText,
    })
    expect(asksForMissingFields).toBe(true)
  } finally {
    if (unexpectedJobId === undefined) {
      unexpectedJobId = (await testApiClient.listJobCatalog()).find(
        (job) => job.name === name,
      )?.id
    }
    if (unexpectedJobId !== undefined) {
      await testApiClient.deleteCatalogJob(unexpectedJobId)
    }
  }
})
