import type { D1Database } from "@cloudflare/workers-types"
import {
  ContactMethodChannelSchema,
  type ContactMethodChannel,
  type ContactMethodSummary,
} from "../types/contact-method"
import {
  type CustomerContactMethod,
  CustomerContactMethodRowSchema,
  customerContactMethodFromRow,
} from "../types/customer"

export function parseContactMethodRow(row: unknown): CustomerContactMethod {
  return customerContactMethodFromRow(CustomerContactMethodRowSchema.parse(row))
}

export async function getOrCreateContactMethod(
  db: D1Database,
  channel: ContactMethodChannel,
  address: string,
): Promise<CustomerContactMethod> {
  const inserted = await db
    .prepare(
      `INSERT INTO customer_contact_methods (channel, address)
       VALUES (?, ?)
       ON CONFLICT(channel, address) DO UPDATE SET
         address = excluded.address
       RETURNING *`,
    )
    .bind(channel, address)
    .first()
  if (inserted === null) {
    throw new Error("Failed to resolve contact method")
  }
  return parseContactMethodRow(inserted)
}

type ContactMethodSummaryRow = {
  id: number
  customer_id: number | null
  customer_name: string | null
  conversation_id: number | null
  channel: string
  address: string
  created_at: number
  conversation_updated_at: number | null
}

function contactMethodSummaryFromRow(
  row: ContactMethodSummaryRow,
): ContactMethodSummary {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    conversationId: row.conversation_id,
    channel: ContactMethodChannelSchema.parse(row.channel),
    address: row.address,
    createdAt: row.created_at,
    conversationUpdatedAt: row.conversation_updated_at,
  }
}

const summarySelect = `SELECT contact.id,
                              contact.customer_id,
                              customer.name AS customer_name,
                              conversation.id AS conversation_id,
                              contact.channel,
                              contact.address,
                              contact.created_at,
                              conversation.updated_at AS conversation_updated_at
                       FROM customer_contact_methods contact
                       LEFT JOIN customers customer
                         ON customer.id = contact.customer_id
                       LEFT JOIN conversations conversation
                         ON conversation.contact_method_id = contact.id`

export async function listContactMethods(
  db: D1Database,
): Promise<ContactMethodSummary[]> {
  const result = await db
    .prepare(
      `${summarySelect}
       ORDER BY COALESCE(conversation.updated_at, contact.created_at) DESC,
                contact.id DESC`,
    )
    .all<ContactMethodSummaryRow>()
  return result.results.map(contactMethodSummaryFromRow)
}

export async function getContactMethodSummary(
  db: D1Database,
  contactMethodId: number,
): Promise<ContactMethodSummary | null> {
  const row = await db
    .prepare(`${summarySelect} WHERE contact.id = ?`)
    .bind(contactMethodId)
    .first<ContactMethodSummaryRow>()
  return row === null ? null : contactMethodSummaryFromRow(row)
}
