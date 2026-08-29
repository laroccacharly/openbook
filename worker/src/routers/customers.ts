import { Hono } from "hono"
import type { WorkerEnv } from "@infra/alchemy.run"
import { getBookingsByCustomerId } from "../db/bookings"
import { getBookingPaymentSummaries } from "../db/payments"
import {
  CustomerDeleteError,
  deleteCustomer,
  getCustomerByEmail,
  getCustomerById,
  getCustomers,
} from "../db/customers"

function parseCustomerId(raw: string): number | null {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export const customersRouter = new Hono<{ Bindings: WorkerEnv }>()
  .get("/customers/:customerId/bookings", async (c) => {
    const customerId = parseCustomerId(c.req.param("customerId"))
    if (customerId === null) {
      return c.json({ error: "Invalid customer id" }, 400)
    }

    const customer = await getCustomerById(c.env.DB, customerId)
    if (customer === null) {
      return c.json({ error: "Customer not found" }, 404)
    }

    const bookings = await getBookingsByCustomerId(c.env.DB, customerId)
    const payments = await getBookingPaymentSummaries(
      c.env.DB,
      bookings.map((booking) => booking.id),
    )
    return c.json(
      bookings.map((booking) => ({
        ...booking,
        payment: payments.get(booking.id) ?? null,
      })),
    )
  })
  .delete("/customers/:customerId", async (c) => {
    const customerId = parseCustomerId(c.req.param("customerId"))
    if (customerId === null) {
      return c.json({ error: "Invalid customer id" }, 400)
    }

    try {
      const customer = await deleteCustomer(c.env.DB, customerId)
      if (customer === null) {
        return c.json({ error: "Customer not found" }, 404)
      }
      return c.json(customer)
    } catch (error) {
      if (error instanceof CustomerDeleteError) {
        return c.json({ error: error.code, message: error.message }, 409)
      }
      throw error
    }
  })
  .get("/customers", async (c) => {
    const email = c.req.query("email")
    if (email === undefined) {
      return c.json(await getCustomers(c.env.DB))
    }
    if (email === "") {
      return c.json({ error: "email is required" }, 400)
    }

    const customer = await getCustomerByEmail(c.env.DB, email)
    if (customer === null) {
      return c.json({ error: "Customer not found" }, 404)
    }
    return c.json(customer)
  })
