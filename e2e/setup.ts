import { afterAll, beforeAll } from "vitest"
import { setupApiClient, teardownApiClient } from "./fixtures/api-client"

beforeAll(async () => {
  await setupApiClient()
})

afterAll(async () => {
  await teardownApiClient()
})
