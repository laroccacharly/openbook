import { describe, expect, test, vi } from "vitest"
import type { WorkerEnv } from "@infra/alchemy.run"
import { createSmsWebhookRouter } from "@worker/src/channels/sms/twilio/webhook-router"
import { TWILIO_INBOUND_SMS_PATH } from "@worker/src/channels/sms/twilio/routes"

const authToken = "test-twilio-auth-token"
const phoneNumber = "+15145550100"
const origin = "https://stage.book.test"
const url = `${origin}${TWILIO_INBOUND_SMS_PATH}`

async function signature(params: Record<string, string>): Promise<string> {
  const encoder = new TextEncoder()
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => `${acc}${key}${params[key]}`, url)
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  )
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(data)),
  )
  return btoa(String.fromCharCode(...digest))
}

function bindings(): WorkerEnv {
  return {
    TWILIO_AUTH_TOKEN: authToken,
    TWILIO_PHONE_NUMBER: phoneNumber,
  } as WorkerEnv
}

async function request(
  params: Record<string, string>,
  presentedSignature?: string,
  env: WorkerEnv = bindings(),
) {
  const ingest = vi.fn().mockResolvedValue({ id: 1, created: true })
  const app = createSmsWebhookRouter(ingest)
  const response = await app.request(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": presentedSignature ?? (await signature(params)),
      },
      body: new URLSearchParams(params),
    },
    env,
  )
  return { response, ingest }
}

describe("Twilio inbound SMS webhook", () => {
  const validParams = {
    MessageSid: "SM123",
    From: "+15145550101",
    To: phoneNumber,
    Body: "Can I book tomorrow?",
  }

  test("validates, maps, ingests, and acknowledges a message", async () => {
    const { response, ingest } = await request(validParams)

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toContain("text/xml")
    expect(await response.text()).toContain("<Response></Response>")
    expect(ingest).toHaveBeenCalledWith(
      expect.objectContaining({ TWILIO_PHONE_NUMBER: phoneNumber }),
      {
        channel: "sms",
        address: validParams.From,
        message: validParams.Body,
        externalId: `sms:${validParams.MessageSid}`,
      },
    )
  })

  test("reports unavailable when SMS is not configured", async () => {
    const { response, ingest } = await request(
      validParams,
      undefined,
      {} as WorkerEnv,
    )

    expect(response.status).toBe(503)
    expect(await response.text()).toBe("SMS is not configured")
    expect(ingest).not.toHaveBeenCalled()
  })

  test("rejects an invalid signature before ingestion", async () => {
    const { response, ingest } = await request(validParams, "invalid")

    expect(response.status).toBe(403)
    expect(ingest).not.toHaveBeenCalled()
  })

  test("rejects messages sent to another number", async () => {
    const params = { ...validParams, To: "+15145550999" }
    const { response, ingest } = await request(params)

    expect(response.status).toBe(403)
    expect(ingest).not.toHaveBeenCalled()
  })

  test("rejects malformed signed payloads", async () => {
    const { Body: _body, ...params } = validParams
    const { response, ingest } = await request(params)

    expect(response.status).toBe(400)
    expect(ingest).not.toHaveBeenCalled()
  })
})
