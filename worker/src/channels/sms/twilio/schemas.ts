import { z } from "zod"
import { E164PhoneSchema } from "../../../types/contact-method"

export const TwilioSendEnvironmentSchema = z.object({
  TWILIO_ACCOUNT_SID: z.string(),
  TWILIO_API_KEY: z.string(),
  TWILIO_API_SECRET: z.string(),
  TWILIO_PHONE_NUMBER: z.string(),
})

export type TwilioSendEnvironment = z.infer<typeof TwilioSendEnvironmentSchema>

export const TwilioInboundSmsSchema = z.object({
  MessageSid: z.string().min(1),
  From: E164PhoneSchema,
  To: E164PhoneSchema,
  Body: z.string().min(1),
})

export const TwilioMessageResponseSchema = z.object({
  sid: z.string(),
  status: z.string(),
  to: z.string(),
  from: z.string(),
})

export const TwilioErrorResponseSchema = z.object({
  code: z.number().optional(),
  message: z.string().optional(),
})

export const TwilioIncomingPhoneNumberSchema = z.object({
  sid: z.string(),
  phone_number: z.string(),
  sms_url: z.string().nullable().optional(),
  sms_method: z.string().nullable().optional(),
})

export const TwilioIncomingPhoneNumberListSchema = z.object({
  incoming_phone_numbers: z.array(TwilioIncomingPhoneNumberSchema),
})
