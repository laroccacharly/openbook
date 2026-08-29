import type { ApiClient } from "./api/client"

export async function generateBookingDescription(
  client: ApiClient,
): Promise<string> {
  const { description } = await client.generateBookingDescription()
  return description
}
