import { requireEnv } from "@book/secrets"
import { resolveDeploymentOrigin } from "@infra/deployment-context"
import { createApiClient, type ApiClient } from "@worker/src/api-client"

export type LiveApiClient = {
  client: ApiClient
  origin: string
}

export async function createLiveApiClient(options?: {
  origin?: string
}): Promise<LiveApiClient> {
  const apiKey = requireEnv("BOOK_API_KEY")
  const origin = options?.origin ?? resolveDeploymentOrigin()
  return {
    origin,
    client: createApiClient(origin, { apiKey }),
  }
}
