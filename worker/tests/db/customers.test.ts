import type { D1Database } from "@cloudflare/workers-types"
import { env } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import { getOrCreateContactMethod } from "@worker/src/db/contact-methods"
import { getContactMethodKey } from "@worker/src/db/conversations"
import { createBooking, deleteBooking } from "@worker/src/db/bookings"
import { listContactMethods } from "@worker/src/db/contact-methods"
import { loadConversation } from "@worker/src/db/conversations"
import {
  CustomerDeleteError,
  deleteCustomer,
  getCustomerByEmail,
  getCustomerById,
  getCustomers,
  ensureCustomerForConversation,
} from "@worker/src/db/customers"
import { getMessagesByConversationId } from "@worker/src/db/messages"
import { createCustomer } from "@worker/tests/fixtures/customers"
import { createInboundMessage } from "@worker/tests/fixtures/messages"
import { testApiClient } from "../fixtures/api-client"

function dbThatReturnsNullForFirst(querySubstring: string): D1Database {
  return {
    prepare(query: string) {
      const statement = env.DB.prepare(query)
      if (!query.includes(querySubstring)) {
        return statement
      }
      return {
        bind(...args: (string | number | null)[]) {
          const bound = statement.bind(...args)
          return {
            first: async () => null,
            run: () => bound.run(),
            all: () => bound.all(),
          }
        },
      }
    },
  } as unknown as D1Database
}

function dbWithOrphanedContactMethod(address: string): D1Database {
  return {
    prepare(query: string) {
      return {
        bind() {
          return {
            async first() {
              if (query.includes("INSERT INTO customer_contact_methods")) {
                return {
                  id: 1,
                  customer_id: 999_999,
                  channel: "email",
                  address,
                  created_at: 1,
                }
              }
              if (query.includes("SELECT contact.*")) {
                return {
                  id: 1,
                  customer_id: 999_999,
                  channel: "email",
                  address,
                  created_at: 1,
                }
              }
              if (query.includes("SELECT * FROM customers WHERE id")) {
                return null
              }
              return null
            },
            async run() {
              return { success: true }
            },
            async all() {
              return { results: [] }
            },
          }
        },
      }
    },
  } as unknown as D1Database
}

describe("customers CRUD", () => {
  const db = env.DB

  test("creates a customer and reads it back by id and email", async () => {
    const created = await createCustomer(db, {
      email: "customer@example.com",
      name: "Ada Lovelace",
    })

    expect(created.id).toBeDefined()
    expect(created.createdAt).toBeDefined()
    expect(created.email).toBe("customer@example.com")
    expect(created.name).toBe("Ada Lovelace")

    expect(await getCustomerById(db, created.id)).toEqual(created)
    expect(await getCustomerByEmail(db, "customer@example.com")).toEqual(
      created,
    )
  })

  test("returns null for missing ids and emails", async () => {
    expect(await getCustomerById(db, 999_999)).toBeNull()
    expect(await getCustomerByEmail(db, "missing@example.com")).toBeNull()
  })

  test("lists customers newest first", async () => {
    const first = await createCustomer(db, {
      email: "first@example.com",
      name: "First",
    })
    const second = await createCustomer(db, {
      email: "second@example.com",
      name: "Second",
    })

    const customers = await getCustomers(db)
    expect(customers[0]).toEqual(second)
    expect(customers[1]).toEqual(first)
  })

  test("getContactMethodKey returns the channel address for a conversation", async () => {
    const { message: emailMessage } = await createInboundMessage(db, {
      message: "Email inbound",
      channel: "email",
      address: "contact-key@example.com",
    })
    const { message: smsMessage } = await createInboundMessage(db, {
      message: "SMS inbound",
      channel: "sms",
      address: "+15550001111",
    })

    expect(await getContactMethodKey(db, emailMessage.conversationId)).toEqual({
      channel: "email",
      address: "contact-key@example.com",
    })
    expect(await getContactMethodKey(db, smsMessage.conversationId)).toEqual({
      channel: "sms",
      address: "+15550001111",
    })
  })

  test("getContactMethodKey throws for a missing conversation", async () => {
    await expect(getContactMethodKey(db, 999_999)).rejects.toThrow(
      "Conversation 999999 not found",
    )
  })

  test("createInboundMessage links a customer on first inbound for email and sms", async () => {
    const { message: emailMessage } = await createInboundMessage(db, {
      message: "Email inbound",
      channel: "email",
      address: "first-message@example.com",
    })
    const { message: smsMessage } = await createInboundMessage(db, {
      message: "SMS inbound",
      channel: "sms",
      address: "+15550002222",
    })

    const emailCustomer = await getCustomerByEmail(
      db,
      "first-message@example.com",
    )
    expect(emailCustomer).not.toBeNull()
    expect(emailCustomer?.name).toBe("first-message")
    expect(emailMessage.conversationId).toBeGreaterThan(0)

    const customers = await getCustomers(db)
    const smsCustomer = customers.find(
      (customer) => customer.phone === "+15550002222",
    )
    expect(smsCustomer).toEqual(
      expect.objectContaining({
        name: null,
        phone: "+15550002222",
        email: null,
      }),
    )
    expect(smsMessage.conversationId).toBeGreaterThan(0)
  })

  test("ensureCustomerForConversation returns the linked customer and can update name", async () => {
    const { message } = await createInboundMessage(db, {
      message: "Need a visit",
      channel: "email",
      address: "conversation-customer@example.com",
    })

    const first = await ensureCustomerForConversation(
      db,
      message.conversationId,
      "Conversation Customer",
    )
    const second = await ensureCustomerForConversation(
      db,
      message.conversationId,
      "Conversation Customer",
    )

    expect(first.name).toBe("Conversation Customer")
    expect(first.email).toBe("conversation-customer@example.com")
    expect(second).toEqual(first)
  })

  test("ensureCustomerForConversation throws for a missing conversation", async () => {
    await expect(
      ensureCustomerForConversation(db, 999_999, "Missing"),
    ).rejects.toThrow("Conversation 999999 not found")
  })

  test("ensureCustomerForConversation throws when the contact points at a missing customer", async () => {
    await expect(
      ensureCustomerForConversation(
        dbWithOrphanedContactMethod("orphaned-conversation@example.com"),
        1,
        "Orphaned",
      ),
    ).rejects.toThrow("Contact method references missing customer")
  })

  test("getOrCreateContactMethod throws when insert returns no row", async () => {
    await expect(
      getOrCreateContactMethod(
        dbThatReturnsNullForFirst("INSERT INTO customer_contact_methods"),
        "email",
        "null-insert@example.com",
      ),
    ).rejects.toThrow("Failed to resolve contact method")
  })

  test("deleteCustomer returns null for a missing id", async () => {
    expect(await deleteCustomer(db, 999_999)).toBeNull()
  })

  test("deleteCustomer rejects customers with active bookings", async () => {
    const customer = await createCustomer(db, {
      email: "delete-blocked@example.com",
      name: "Blocked",
    })
    await createBooking(db, {
      workerIds: [1],
      startDatetime: new Date("2026-07-13T09:00:00.000Z"),
      endDatetime: new Date("2026-07-13T10:00:00.000Z"),
      customerId: customer.id,
    })

    await expect(deleteCustomer(db, customer.id)).rejects.toBeInstanceOf(
      CustomerDeleteError,
    )
    expect(await getCustomerById(db, customer.id)).toEqual(customer)
  })

  test("deleteCustomer removes the customer, contact methods, and conversation", async () => {
    const { message } = await createInboundMessage(db, {
      message: "Please book a visit",
      channel: "email",
      address: "delete-cascade@example.com",
    })
    const customer = await getCustomerByEmail(db, "delete-cascade@example.com")
    if (customer === null) {
      throw new Error("Expected inbound customer")
    }

    const booking = await createBooking(db, {
      workerIds: [1],
      startDatetime: new Date("2026-07-13T11:00:00.000Z"),
      endDatetime: new Date("2026-07-13T12:00:00.000Z"),
      customerId: customer.id,
      messageId: message.id,
    })
    await deleteBooking(db, booking.id)

    expect(await deleteCustomer(db, customer.id)).toEqual(customer)
    expect(await getCustomerById(db, customer.id)).toBeNull()
    expect(await loadConversation(db, message.conversationId)).toBeNull()
    expect(
      await getMessagesByConversationId(db, message.conversationId),
    ).toEqual([])
    expect(
      (await listContactMethods(db)).some(
        (contact) => contact.address === "delete-cascade@example.com",
      ),
    ).toBe(false)
  })
})

describe("customers API", () => {
  test("deletes a customer through the typed client", async () => {
    const created = await createCustomer(env.DB, {
      email: "api-delete-customer@example.com",
      name: "API Delete",
    })

    await expect(testApiClient.deleteCustomer(created.id)).resolves.toEqual(
      created,
    )
    expect(await getCustomerById(env.DB, created.id)).toBeNull()
  })

  test("rejects delete when the customer still has bookings", async () => {
    const created = await createCustomer(env.DB, {
      email: "api-delete-blocked@example.com",
      name: "API Blocked",
    })
    const booked = await testApiClient.createBooking({
      workerIds: [1],
      startDatetime: "2026-07-13T09:00:00.000Z",
      endDatetime: "2026-07-13T10:00:00.000Z",
      customerId: created.id,
    })

    await expect(testApiClient.deleteCustomer(created.id)).rejects.toThrow()
    expect(await getCustomerById(env.DB, created.id)).toEqual(created)

    await testApiClient.deleteBooking(booked.booking.id)
    await testApiClient.deleteCustomer(created.id)
  })
})
