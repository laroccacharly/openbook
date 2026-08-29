import { z } from "zod"

export const BookingActionSchema = z.enum(["create", "reschedule", "cancel"])

export type BookingAction = z.infer<typeof BookingActionSchema>

// Keep every property required for strict structured-output providers. Nullable
// values represent details that were not present in the request.
export const FirstPassResultSchema = z
  .object({
    booking_action: BookingActionSchema.nullable().describe(
      "create, reschedule, cancel, or null if the message is not about booking",
    ),
    customer_questions: z
      .array(z.string())
      .describe("Questions asked by the customer in the message"),
    priority: z
      .number()
      .int()
      .min(1)
      .max(5)
      .describe(
        "How important or relevant the message is, from 1 (low) to 5 (high)",
      ),
  })
  .required()

export type FirstPassResult = z.infer<typeof FirstPassResultSchema>

export const PreferredDatetimeSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("Civil date in the business timezone, YYYY-MM-DD"),
    time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable()
      .describe("Clock time HH:mm when stated, otherwise null for date-only"),
  })
  .required()

export type PreferredDatetime = z.infer<typeof PreferredDatetimeSchema>

export const PreferredDatetimesSchema = z
  .object({
    preferred_datetimes: z
      .array(PreferredDatetimeSchema)
      .describe(
        "Civil datetimes proposed in the message, in the business timezone",
      ),
  })
  .required()

export type PreferredDatetimes = z.infer<typeof PreferredDatetimesSchema>

export const ExtractedCustomerInformationSchema = z
  .object({
    address: z
      .string()
      .nullable()
      .describe(
        "Complete service address with street name and street number, or null if missing or only a city/region",
      ),
    customer_name: z
      .string()
      .nullable()
      .describe("Customer name from the message, or null if missing"),
  })
  .required()

export type ExtractedCustomerInformation = z.infer<
  typeof ExtractedCustomerInformationSchema
>

export const JobDetailsSchema = z
  .object({
    description: z
      .string()
      .min(1)
      .describe("Short human-readable description of the requested job"),
    duration_minutes: z
      .number()
      .int()
      .positive()
      .describe("Job duration in minutes from the catalog"),
    estimated_price: z
      .number()
      .int()
      .nonnegative()
      .describe("Job price in cents from the catalog"),
    worker_count: z
      .number()
      .int()
      .positive()
      .describe("Number of workers required from the catalog"),
  })
  .required()

export type JobDetails = z.infer<typeof JobDetailsSchema>

export const ExtractJobResultSchema = z
  .object({
    job: JobDetailsSchema.nullable().describe(
      "Catalog job details, or null when the customer's requested service is not in the job catalog and cannot be served. Never invent a job that is not in the catalog.",
    ),
  })
  .required()

export type ExtractJobResult = z.infer<typeof ExtractJobResultSchema>

export const ComposeResponseResultSchema = z
  .object({
    body: z.string().min(1).describe("Outbound response draft to the customer"),
  })
  .required()

export type ComposeResponseResult = z.infer<typeof ComposeResponseResultSchema>

export const BusinessLocalContextSchema = z.object({
  timezone: z.string().min(1),
  nowLocal: z.string().min(1),
  weekday: z.string().min(1),
})

export type BusinessLocalContext = z.infer<typeof BusinessLocalContextSchema>
