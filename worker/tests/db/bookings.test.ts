import { env } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import {
  cancelBooking,
  createBooking,
  deleteBooking,
  getActiveBookingByConversationId,
  getBookingByCancelledByMessageId,
  getBookingById,
  getBookingByMessageId,
  getBookingByPublicId,
  getBookings,
  getBookingsByCustomerId,
  rescheduleBooking,
  updateBooking,
} from "@worker/src/db/bookings"
import { createCustomer } from "@worker/tests/fixtures/customers"
import { createInboundMessage } from "@worker/tests/fixtures/messages"
import type { BookingCreateInput } from "@worker/src/types"
import { testApiClient } from "../fixtures/api-client"

describe("bookings CRUD", () => {
  const db = env.DB

  test("create in memory, persist to D1, and read back via getters", async () => {
    const booking: BookingCreateInput = {
      workerIds: [1, 2],
      startDatetime: new Date("2026-07-13T09:00:00.000Z"),
      endDatetime: new Date("2026-07-13T10:00:00.000Z"),
      description: "Fix sink",
      address: "123 Main St",
      estimatedPrice: 15000,
      customerId: 42,
    }

    const created = await createBooking(db, booking)

    expect(created.id).toBeDefined()
    expect(created.createdAt).toBeDefined()
    expect(created.workerIds).toEqual([1, 2])
    expect(created.description).toBe("Fix sink")
    expect(created.address).toBe("123 Main St")
    expect(created.estimatedPrice).toBe(15000)
    expect(created.customerId).toBe(42)
    expect(created.messageId).toBeNull()
    expect(created.startDatetime.toISOString()).toBe("2026-07-13T09:00:00.000Z")
    expect(created.endDatetime.toISOString()).toBe("2026-07-13T10:00:00.000Z")

    const fetched = await getBookingById(db, created.id)
    expect(fetched).not.toBeNull()
    expect(fetched).toEqual(created)

    const listed = await getBookings(db)
    expect(listed).toHaveLength(1)
    expect(listed[0]).toEqual(created)
    expect(await getBookingsByCustomerId(db, 42)).toEqual([created])
    expect(await getBookingsByCustomerId(db, 999_999)).toEqual([])
  })

  test("update persists field changes", async () => {
    const created = await createBooking(db, {
      workerIds: [1],
      startDatetime: new Date("2026-07-13T09:00:00.000Z"),
      endDatetime: new Date("2026-07-13T10:00:00.000Z"),
      description: "Original",
    })

    const updated = await updateBooking(db, {
      ...created,
      description: "Rescheduled job",
      address: "456 Oak Ave",
      workerIds: [1, 3],
    })

    expect(updated).not.toBeNull()
    expect(updated?.description).toBe("Rescheduled job")
    expect(updated?.address).toBe("456 Oak Ave")
    expect(updated?.workerIds).toEqual([1, 3])

    const fetched = await getBookingById(db, created.id)
    expect(fetched?.description).toBe("Rescheduled job")
    expect(fetched?.address).toBe("456 Oak Ave")
    expect(fetched?.workerIds).toEqual([1, 3])
  })

  test("soft delete hides booking from list getters", async () => {
    const created = await createBooking(db, {
      workerIds: [1],
      startDatetime: new Date("2026-07-13T09:00:00.000Z"),
      endDatetime: new Date("2026-07-13T10:00:00.000Z"),
      description: "To delete",
    })

    const before = Math.floor(Date.now() / 1000)
    const deleted = await deleteBooking(db, created.id)
    const after = Math.floor(Date.now() / 1000)

    expect(deleted?.deleteAt).toBeGreaterThanOrEqual(before)
    expect(deleted?.deleteAt).toBeLessThanOrEqual(after)
    expect(await getBookings(db)).toHaveLength(0)

    const fetched = await getBookingById(db, created.id)
    expect(fetched?.deleteAt).toBe(deleted?.deleteAt)
  })

  test("rescheduleBooking moves the slot, swaps workers, and stamps rescheduled_at", async () => {
    const created = await createBooking(db, {
      workerIds: [1],
      startDatetime: new Date("2026-07-13T09:00:00.000Z"),
      endDatetime: new Date("2026-07-13T10:00:00.000Z"),
      description: "To reschedule",
    })

    const before = Math.floor(Date.now() / 1000)
    const rescheduled = await rescheduleBooking(db, created.id, {
      startDatetime: new Date("2026-07-15T13:00:00.000Z"),
      endDatetime: new Date("2026-07-15T15:00:00.000Z"),
      workerIds: [2, 3],
    })
    const after = Math.floor(Date.now() / 1000)

    expect(rescheduled?.startDatetime.toISOString()).toBe(
      "2026-07-15T13:00:00.000Z",
    )
    expect(rescheduled?.endDatetime.toISOString()).toBe(
      "2026-07-15T15:00:00.000Z",
    )
    expect(rescheduled?.workerIds).toEqual([2, 3])
    expect(rescheduled?.rescheduledAt).toBeGreaterThanOrEqual(before)
    expect(rescheduled?.rescheduledAt).toBeLessThanOrEqual(after)

    expect(
      await rescheduleBooking(db, 999_999, {
        startDatetime: new Date("2026-07-15T13:00:00.000Z"),
        endDatetime: new Date("2026-07-15T15:00:00.000Z"),
        workerIds: [2],
      }),
    ).toBeNull()
  })

  test("cancelBooking stamps cancelled_at, is idempotent, and hides from list getters", async () => {
    const { message } = await createInboundMessage(db, {
      message: "Please cancel",
      channel: "email",
      address: "cancel@example.com",
    })
    const created = await createBooking(db, {
      workerIds: [1],
      startDatetime: new Date("2026-07-16T09:00:00.000Z"),
      endDatetime: new Date("2026-07-16T10:00:00.000Z"),
      description: "To cancel",
    })

    const before = Math.floor(Date.now() / 1000)
    const cancelled = await cancelBooking(db, created.id, message.id)
    const after = Math.floor(Date.now() / 1000)

    expect(cancelled?.cancelledAt).toBeGreaterThanOrEqual(before)
    expect(cancelled?.cancelledAt).toBeLessThanOrEqual(after)
    expect(cancelled?.cancelledByMessageId).toBe(message.id)
    expect((await getBookings(db)).some((b) => b.id === created.id)).toBe(false)

    const again = await cancelBooking(db, created.id, message.id)
    expect(again?.cancelledAt).toBe(cancelled?.cancelledAt)
    expect(await cancelBooking(db, 999_999)).toBeNull()
    expect(await getBookingByCancelledByMessageId(db, message.id)).toEqual(
      cancelled,
    )
  })

  test("getActiveBookingByConversationId returns the latest active booking for the sender", async () => {
    const customer = await createCustomer(db, {
      email: "active-booking@example.com",
      name: "Active Customer",
    })
    const other = await createCustomer(db, {
      email: "other-booking@example.com",
      name: "Other Customer",
    })
    const { message } = await createInboundMessage(db, {
      message: "Need service",
      channel: "email",
      address: "active-booking@example.com",
    })

    expect(
      await getActiveBookingByConversationId(db, message.conversationId),
    ).toBeNull()

    const older = await createBooking(db, {
      workerIds: [1],
      startDatetime: new Date("2026-07-20T09:00:00.000Z"),
      endDatetime: new Date("2026-07-20T10:00:00.000Z"),
      customerId: customer.id,
    })
    const newer = await createBooking(db, {
      workerIds: [1],
      startDatetime: new Date("2026-07-21T09:00:00.000Z"),
      endDatetime: new Date("2026-07-21T10:00:00.000Z"),
      customerId: customer.id,
    })
    await createBooking(db, {
      workerIds: [1],
      startDatetime: new Date("2026-07-22T09:00:00.000Z"),
      endDatetime: new Date("2026-07-22T10:00:00.000Z"),
      customerId: other.id,
    })

    const active = await getActiveBookingByConversationId(
      db,
      message.conversationId,
    )
    expect(active?.id).toBe(newer.id)

    await cancelBooking(db, newer.id)
    const afterCancel = await getActiveBookingByConversationId(
      db,
      message.conversationId,
    )
    expect(afterCancel?.id).toBe(older.id)
  })

  test("createBooking returns the existing row for the same messageId", async () => {
    const { message } = await createInboundMessage(db, {
      message: "Book me Friday",
      channel: "email",
      address: "source-msg@example.com",
    })

    const first = await createBooking(db, {
      workerIds: [1],
      startDatetime: new Date("2026-07-23T09:00:00.000Z"),
      endDatetime: new Date("2026-07-23T10:00:00.000Z"),
      messageId: message.id,
    })
    const second = await createBooking(db, {
      workerIds: [2],
      startDatetime: new Date("2026-07-24T09:00:00.000Z"),
      endDatetime: new Date("2026-07-24T10:00:00.000Z"),
      messageId: message.id,
    })

    expect(first.messageId).toBe(message.id)
    expect(second).toEqual(first)
    expect(await getBookingByMessageId(db, message.id)).toEqual(first)
    expect(await getBookingByMessageId(db, 999_999)).toBeNull()
  })

  test("getBookingByPublicId returns the booking by public id", async () => {
    const created = await createBooking(db, {
      workerIds: [1],
      startDatetime: new Date("2026-07-13T09:00:00.000Z"),
      endDatetime: new Date("2026-07-13T10:00:00.000Z"),
      description: "Public lookup",
    })

    expect(await getBookingByPublicId(db, created.publicId)).toEqual(created)
    expect(await getBookingByPublicId(db, "AAAAAAAAAAAAAAAA")).toBeNull()
  })
})

describe("bookings API", () => {
  test("creates, lists, and deletes a booking through the typed client", async () => {
    const createdOutcome = await testApiClient.createBooking({
      workerIds: [1, 2],
      startDatetime: "2026-07-13T09:00:00.000Z",
      endDatetime: "2026-07-13T10:00:00.000Z",
      description: "Fix sink",
      address: "123 Main St",
      estimatedPrice: 15000,
      customerId: 42,
    })

    const created = createdOutcome.booking
    expect(createdOutcome.sync).toBeNull()
    expect(createdOutcome.syncError).toBeNull()
    expect(created.id).toBeDefined()
    expect(created.createdAt).toBeDefined()
    expect(created.workerIds).toEqual([1, 2])
    expect(created.description).toBe("Fix sink")
    expect(created.address).toBe("123 Main St")
    expect(created.estimatedPrice).toBe(15000)
    expect(created.customerId).toBe(42)
    expect(created.startDatetime).toBe("2026-07-13T09:00:00.000Z")
    expect(created.endDatetime).toBe("2026-07-13T10:00:00.000Z")

    const listed = await testApiClient.listBookings()
    expect(listed).toHaveLength(1)
    expect(listed[0]).toEqual({ ...created, payment: null })

    const deleted = await testApiClient.deleteBooking(created.id)
    expect(deleted.booking.id).toBe(created.id)
    expect(deleted.booking.deleteAt).toBeDefined()
    expect(deleted.sync).toBeNull()

    const afterDelete = await testApiClient.listBookings()
    expect(afterDelete).toHaveLength(0)
  })
})
