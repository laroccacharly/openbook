import { createApiClient } from "@worker/src/api-client"

const PLACEHOLDER_ORIGIN = "http://book-api-cli.invalid"

export function listApiClientMethodNames(): string[] {
  const client = createApiClient(PLACEHOLDER_ORIGIN, { apiKey: "placeholder" })
  return Object.keys(client).sort()
}
