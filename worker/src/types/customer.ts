import { z } from "zod"
import { ContactMethodChannelSchema, E164PhoneSchema } from "./contact-method"

export const CustomerRowSchema = z.object({
  id: z.number().int(),
  name: z.string().nullable(),
  created_at: z.number().int(),
})

export type CustomerRow = z.infer<typeof CustomerRowSchema>

export const CustomerContactMethodRowSchema = z.object({
  id: z.number().int(),
  customer_id: z.number().int().nullable(),
  channel: ContactMethodChannelSchema,
  address: z.string(),
  created_at: z.number().int(),
})

export type CustomerContactMethodRow = z.infer<
  typeof CustomerContactMethodRowSchema
>

export const CustomerContactMethodSchema = z.object({
  id: z.number().int(),
  customerId: z.number().int().nullable(),
  channel: ContactMethodChannelSchema,
  address: z.string().min(1),
  createdAt: z.number().int(),
})

export type CustomerContactMethod = z.infer<typeof CustomerContactMethodSchema>

export const CustomerCreateSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  name: z.string().min(1).nullable().optional(),
})

export type CustomerCreateInput = z.input<typeof CustomerCreateSchema>
export type CustomerCreate = z.infer<typeof CustomerCreateSchema>

export const CustomerSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1).nullable(),
  createdAt: z.number().int(),
  email: z.email().nullable(),
  phone: E164PhoneSchema.nullable(),
})

export type Customer = z.infer<typeof CustomerSchema>

export function customerContactMethodFromRow(
  row: CustomerContactMethodRow,
): CustomerContactMethod {
  return CustomerContactMethodSchema.parse({
    id: row.id,
    customerId: row.customer_id,
    channel: row.channel,
    address: row.address,
    createdAt: row.created_at,
  })
}

export function customerFromRow(
  row: CustomerRow,
  contacts: CustomerContactMethod[],
): Customer {
  const email = contacts.find((contact) => contact.channel === "email")
  const phone = contacts.find((contact) => contact.channel === "sms")
  return CustomerSchema.parse({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    email: email?.address ?? null,
    phone: phone?.address ?? null,
  })
}
