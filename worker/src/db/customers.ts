import type { D1Database } from "@cloudflare/workers-types"
import {
  type Customer,
  type CustomerContactMethod,
  CustomerRowSchema,
  customerFromRow,
} from "../types/customer"
import { getBookingsByCustomerId } from "./bookings"
import { parseContactMethodRow } from "./contact-methods"

function parseCustomerRow(
  row: unknown,
  contacts: CustomerContactMethod[],
): Customer {
  return customerFromRow(CustomerRowSchema.parse(row), contacts)
}

async function listContactMethodsForCustomer(
  db: D1Database,
  customerId: number,
): Promise<CustomerContactMethod[]> {
  const result = await db
    .prepare(
      `SELECT * FROM customer_contact_methods
       WHERE customer_id = ?
       ORDER BY id ASC`,
    )
    .bind(customerId)
    .all()
  return result.results.map(parseContactMethodRow)
}

async function hydrateCustomer(
  db: D1Database,
  row: unknown,
): Promise<Customer> {
  const parsed = CustomerRowSchema.parse(row)
  const contacts = await listContactMethodsForCustomer(db, parsed.id)
  return parseCustomerRow(parsed, contacts)
}

export async function linkCustomerToContact(
  db: D1Database,
  contactMethod: CustomerContactMethod,
  name: string | null,
): Promise<Customer> {
  if (contactMethod.customerId !== null) {
    const existing = await getCustomerById(db, contactMethod.customerId)
    if (existing === null) {
      throw new Error("Contact method references missing customer")
    }
    return existing
  }

  const created = await db
    .prepare(
      `INSERT INTO customers (name)
       VALUES (?)
       RETURNING *`,
    )
    .bind(name)
    .first()
  if (created === null) {
    throw new Error("Failed to create customer")
  }
  const createdRow = CustomerRowSchema.parse(created)
  await db
    .prepare(
      `UPDATE customer_contact_methods
       SET customer_id = ?
       WHERE id = ?
         AND customer_id IS NULL`,
    )
    .bind(createdRow.id, contactMethod.id)
    .run()
  return hydrateCustomer(db, createdRow)
}

export async function getCustomerById(
  db: D1Database,
  customerId: number,
): Promise<Customer | null> {
  const result = await db
    .prepare(`SELECT * FROM customers WHERE id = ?`)
    .bind(customerId)
    .first()
  if (result === null) {
    return null
  }
  return hydrateCustomer(db, result)
}

export async function getCustomerByEmail(
  db: D1Database,
  email: string,
): Promise<Customer | null> {
  const normalized = email.trim().toLowerCase()
  const result = await db
    .prepare(
      `SELECT customers.*
       FROM customers
       JOIN customer_contact_methods contact
         ON contact.customer_id = customers.id
       WHERE contact.channel = 'email'
         AND contact.address = ?`,
    )
    .bind(normalized)
    .first()
  if (result === null) {
    return null
  }
  return hydrateCustomer(db, result)
}

export async function getCustomers(db: D1Database): Promise<Customer[]> {
  const result = await db
    .prepare(
      `SELECT * FROM customers
       ORDER BY created_at DESC, id DESC`,
    )
    .all()
  const customers = []
  for (const row of result.results) {
    customers.push(await hydrateCustomer(db, row))
  }
  return customers
}

export async function ensureCustomerForConversation(
  db: D1Database,
  conversationId: number,
  name: string,
): Promise<Customer> {
  const contact = await db
    .prepare(
      `SELECT contact.*
       FROM conversations conversation
       JOIN customer_contact_methods contact
         ON contact.id = conversation.contact_method_id
       WHERE conversation.id = ?`,
    )
    .bind(conversationId)
    .first()
  if (contact === null) {
    throw new Error(`Conversation ${conversationId} not found`)
  }
  const contactMethod = parseContactMethodRow(contact)
  const customer = await linkCustomerToContact(db, contactMethod, name)
  if (customer.name === name) {
    return customer
  }
  await db
    .prepare(`UPDATE customers SET name = ? WHERE id = ?`)
    .bind(name, customer.id)
    .run()
  const updated = await getCustomerById(db, customer.id)
  if (updated === null) {
    throw new Error("Customer disappeared after name update")
  }
  return updated
}

export class CustomerDeleteError extends Error {
  readonly code: "has_active_bookings"

  constructor(code: "has_active_bookings", message: string) {
    super(message)
    this.code = code
    this.name = "CustomerDeleteError"
  }
}

function sqlInPlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ")
}

async function deleteConversationGraph(
  db: D1Database,
  conversationId: number,
): Promise<void> {
  const messages = await db
    .prepare(`SELECT id FROM messages WHERE conversation_id = ?`)
    .bind(conversationId)
    .all<{ id: number }>()
  const messageIds = messages.results.map((row) => row.id)

  if (messageIds.length > 0) {
    const messageIn = sqlInPlaceholders(messageIds.length)
    await db
      .prepare(
        `UPDATE bookings SET message_id = NULL WHERE message_id IN (${messageIn})`,
      )
      .bind(...messageIds)
      .run()
    await db
      .prepare(
        `UPDATE bookings
         SET cancelled_by_message_id = NULL
         WHERE cancelled_by_message_id IN (${messageIn})`,
      )
      .bind(...messageIds)
      .run()
    await db
      .prepare(
        `UPDATE bookings
         SET rescheduled_by_message_id = NULL
         WHERE rescheduled_by_message_id IN (${messageIn})`,
      )
      .bind(...messageIds)
      .run()
    await db
      .prepare(
        `DELETE FROM workflows
         WHERE record_name = 'message' AND record_id IN (${messageIn})`,
      )
      .bind(...messageIds)
      .run()

    const responses = await db
      .prepare(
        `SELECT id FROM message_responses WHERE message_id IN (${messageIn})`,
      )
      .bind(...messageIds)
      .all<{ id: number }>()
    const responseIds = responses.results.map((row) => row.id)
    if (responseIds.length > 0) {
      const responseIn = sqlInPlaceholders(responseIds.length)
      await db
        .prepare(
          `DELETE FROM workflows
           WHERE record_name = 'message_response'
             AND record_id IN (${responseIn})`,
        )
        .bind(...responseIds)
        .run()
      await db
        .prepare(
          `DELETE FROM message_delivery_receipts
           WHERE message_response_id IN (${responseIn})`,
        )
        .bind(...responseIds)
        .run()
    }

    await db
      .prepare(`DELETE FROM response_drafts WHERE conversation_id = ?`)
      .bind(conversationId)
      .run()
    await db
      .prepare(
        `DELETE FROM message_responses WHERE message_id IN (${messageIn})`,
      )
      .bind(...messageIds)
      .run()
    await db
      .prepare(`DELETE FROM llm_tasks WHERE message_id IN (${messageIn})`)
      .bind(...messageIds)
      .run()
  }

  await db
    .prepare(`UPDATE conversations SET latest_message_id = NULL WHERE id = ?`)
    .bind(conversationId)
    .run()
  await db
    .prepare(`DELETE FROM messages WHERE conversation_id = ?`)
    .bind(conversationId)
    .run()
  await db
    .prepare(`DELETE FROM conversations WHERE id = ?`)
    .bind(conversationId)
    .run()
}

export async function deleteCustomer(
  db: D1Database,
  customerId: number,
): Promise<Customer | null> {
  const customer = await getCustomerById(db, customerId)
  if (customer === null) {
    return null
  }

  const activeBookings = await getBookingsByCustomerId(db, customerId)
  if (activeBookings.length > 0) {
    throw new CustomerDeleteError(
      "has_active_bookings",
      "Customer has active bookings",
    )
  }

  const contacts = await listContactMethodsForCustomer(db, customerId)
  for (const contact of contacts) {
    const conversation = await db
      .prepare(`SELECT id FROM conversations WHERE contact_method_id = ?`)
      .bind(contact.id)
      .first<{ id: number }>()
    if (conversation !== null) {
      await deleteConversationGraph(db, conversation.id)
    }
    await db
      .prepare(`DELETE FROM customer_contact_methods WHERE id = ?`)
      .bind(contact.id)
      .run()
  }

  await db.prepare(`DELETE FROM customers WHERE id = ?`).bind(customerId).run()
  return customer
}
