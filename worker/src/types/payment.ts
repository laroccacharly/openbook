import { z } from "zod"

export const AmountDueKindSchema = z.enum(["deposit", "balance"])
export type AmountDueKind = z.infer<typeof AmountDueKindSchema>

export const BookingAmountDueSchema = z.object({
  id: z.number().int(),
  bookingId: z.number().int(),
  kind: AmountDueKindSchema,
  amount: z.number().int().positive(),
  collectible: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})
export type BookingAmountDue = z.infer<typeof BookingAmountDueSchema>

export const PaymentStatusSchema = z.enum([
  "paid",
  "partially_refunded",
  "refunded",
])
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>

export const BookingPaymentSchema = z.object({
  amountDueId: z.number().int(),
  bookingId: z.number().int(),
  status: PaymentStatusSchema,
  checkoutSessionId: z.string(),
  paymentIntentId: z.string(),
  chargedAmount: z.number().int().positive(),
  refundedAmount: z.number().int().nonnegative(),
  currency: z.literal("cad"),
  payerEmail: z.string().nullable(),
  stripeCreatedAt: z.number().int(),
  paidAt: z.number().int(),
  updatedAt: z.number().int(),
})
export type BookingPayment = z.infer<typeof BookingPaymentSchema>

export type BookingPaymentSummary = Pick<
  BookingPayment,
  "status" | "chargedAmount" | "refundedAmount" | "currency"
>

export const EnableBalanceDueInputSchema = z.object({
  finalPrice: z.number().int().positive(),
})
export type EnableBalanceDueInput = z.infer<typeof EnableBalanceDueInputSchema>
