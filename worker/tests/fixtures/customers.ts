import type { D1Database } from "@cloudflare/workers-types"
import { getCustomerById } from "@worker/src/db/customers"
import {
  type Customer,
  type CustomerCreateInput,
  CustomerCreateSchema,
  CustomerRowSchema,
} from "@worker/src/types/customer"

export async function createCustomer(
  db: D1Database,
  input: CustomerCreateInput,
): Promise<Customer> {
  const customer = CustomerCreateSchema.parse(input)
  const result = await db
    .prepare(
      `INSERT INTO customers (name)
       VALUES (?)
       RETURNING *`,
    )
    .bind(customer.name ?? null)
    .first()
  if (result === null) {
    throw new Error("Failed to create customer")
  }
  const created = CustomerRowSchema.parse(result)
  await db
    .prepare(
      `INSERT INTO customer_contact_methods (customer_id, channel, address)
       VALUES (?, 'email', ?)`,
    )
    .bind(created.id, customer.email)
    .run()
  const hydrated = await getCustomerById(db, created.id)
  if (hydrated === null) {
    throw new Error("Customer disappeared after creation")
  }
  return hydrated
}
