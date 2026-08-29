import {
  TwilioErrorResponseSchema,
  TwilioIncomingPhoneNumberListSchema,
  TwilioIncomingPhoneNumberSchema,
} from "./schemas"

export type TwilioRestCredentials = {
  accountSid: string
  apiKey: string
  apiSecret: string
}

function basicAuth(credentials: TwilioRestCredentials): string {
  return btoa(`${credentials.apiKey}:${credentials.apiSecret}`)
}

async function twilioErrorMessage(response: Response): Promise<string> {
  const payload: unknown = await response.json().catch(() => null)
  const error = TwilioErrorResponseSchema.safeParse(payload)
  return error.success && error.data.message !== undefined
    ? error.data.message
    : `Twilio request failed (${response.status})`
}

/** Point an account phone number's inbound SMS webhook at webhookUrl using POST. */
export async function setupInboundSmsWebhook(
  credentials: TwilioRestCredentials,
  phoneNumber: string,
  webhookUrl: string,
): Promise<{
  sid: string
  phoneNumber: string
  smsUrl: string
  smsMethod: string
}> {
  const listUrl = new URL(
    `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/IncomingPhoneNumbers.json`,
  )
  listUrl.searchParams.set("PhoneNumber", phoneNumber)
  const listResponse = await fetch(listUrl, {
    headers: { Authorization: `Basic ${basicAuth(credentials)}` },
  })
  if (!listResponse.ok) throw new Error(await twilioErrorMessage(listResponse))

  const listed = TwilioIncomingPhoneNumberListSchema.safeParse(
    await listResponse.json(),
  )
  if (!listed.success) throw new Error("Unexpected Twilio list response")
  const match = listed.data.incoming_phone_numbers[0]
  if (match === undefined) {
    throw new Error(`No IncomingPhoneNumber found for ${phoneNumber}`)
  }

  const updateUrl = `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/IncomingPhoneNumbers/${match.sid}.json`
  const updateResponse = await fetch(updateUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(credentials)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ SmsUrl: webhookUrl, SmsMethod: "POST" }),
  })
  if (!updateResponse.ok) {
    throw new Error(await twilioErrorMessage(updateResponse))
  }

  const updated = TwilioIncomingPhoneNumberSchema.safeParse(
    await updateResponse.json(),
  )
  if (!updated.success) throw new Error("Unexpected Twilio update response")
  return {
    sid: updated.data.sid,
    phoneNumber: updated.data.phone_number,
    smsUrl: updated.data.sms_url ?? webhookUrl,
    smsMethod: updated.data.sms_method ?? "POST",
  }
}
