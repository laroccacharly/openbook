import { afterEach, describe, expect, test, vi } from "vitest"
import { sendSms } from "@worker/src/channels/sms/outbound"
import { setupInboundSmsWebhook } from "@worker/src/channels/sms/twilio/setup-webhook"

afterEach(() => vi.unstubAllGlobals())

const credentials = {
  TWILIO_ACCOUNT_SID: "AC123",
  TWILIO_API_KEY: "SK123",
  TWILIO_API_SECRET: "secret",
  TWILIO_PHONE_NUMBER: "+15145550100",
}

describe("Twilio client", () => {
  test("sends an SMS with the configured credentials and number", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          sid: "SM123",
          status: "queued",
          to: "+15145550101",
          from: credentials.TWILIO_PHONE_NUMBER,
        },
        { status: 201 },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      sendSms(credentials, { to: "+15145550101", body: "Hello" }),
    ).resolves.toEqual({
      ok: true,
      sid: "SM123",
      status: "queued",
      to: "+15145550101",
      from: credentials.TWILIO_PHONE_NUMBER,
    })

    const [requestUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(requestUrl).toContain("/Accounts/AC123/Messages.json")
    expect(init.headers).toMatchObject({
      Authorization: `Basic ${btoa("SK123:secret")}`,
    })
    expect((init.body as URLSearchParams).toString()).toBe(
      "To=%2B15145550101&From=%2B15145550100&Body=Hello",
    )
  })

  test("returns Twilio API errors without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { code: 21211, message: "Invalid number" },
            { status: 400 },
          ),
        ),
    )

    await expect(
      sendSms(credentials, { to: "+15145550101", body: "Hello" }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      code: 21211,
      error: "Invalid number",
    })
  })

  test("configures the inbound webhook on the matching Twilio number", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          incoming_phone_numbers: [
            { sid: "PN123", phone_number: "+15145550100" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          sid: "PN123",
          phone_number: "+15145550100",
          sms_url: "https://stage.book.test/webhooks/twilio/sms",
          sms_method: "POST",
        }),
      )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      setupInboundSmsWebhook(
        { accountSid: "AC123", apiKey: "SK123", apiSecret: "secret" },
        "+15145550100",
        "https://stage.book.test/webhooks/twilio/sms",
      ),
    ).resolves.toEqual({
      sid: "PN123",
      phoneNumber: "+15145550100",
      smsUrl: "https://stage.book.test/webhooks/twilio/sms",
      smsMethod: "POST",
    })

    const update = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(update[0]).toContain("IncomingPhoneNumbers/PN123.json")
    expect((update[1].body as URLSearchParams).toString()).toBe(
      "SmsUrl=https%3A%2F%2Fstage.book.test%2Fwebhooks%2Ftwilio%2Fsms&SmsMethod=POST",
    )
  })
})
