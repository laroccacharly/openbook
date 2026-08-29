import type { ApiClient } from "./api/client"

export async function generateCustomerEmail(
  client: ApiClient,
): Promise<string> {
  const { email } = await client.generateCustomerEmail()
  return email
}
