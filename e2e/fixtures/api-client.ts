import { resolveDeploymentOrigin } from "@infra/deployment-context"
import { createApiClient, type ApiClient } from "@worker/src/api-client"
import { createCloudflareDnsFetch } from "../cloudflare-dns-fetch"

export let testApiClient: ApiClient
let closeDispatcher: (() => Promise<void>) | undefined

export const setupApiClient = async (): Promise<void> => {
  const apiKey = process.env.BOOK_API_KEY
  if (!apiKey) {
    throw new Error("BOOK_API_KEY is required`.")
  }

  const origin = resolveDeploymentOrigin()
  const url = new URL(origin)
  const cloudflareDns = await createCloudflareDnsFetch(url.hostname)
  closeDispatcher = cloudflareDns.close
  testApiClient = createApiClient(origin, {
    apiKey,
    fetch: cloudflareDns.fetch,
  })
}

export const teardownApiClient = async (): Promise<void> => {
  await closeDispatcher?.()
  closeDispatcher = undefined
}
