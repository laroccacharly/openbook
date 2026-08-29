import { exports } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import { API_PREFIX, GOOGLE_OAUTH_CALLBACK_PATH } from "@infra/routes"
import { TWILIO_INBOUND_SMS_PATH } from "@worker/src/channels/sms/twilio/routes"
import { TEST_BOOK_API_KEY } from "./fixtures/api-key"

const fetchWorker = (path: string, init?: RequestInit) =>
  exports.default.fetch(new Request(`https://stage.book.test${path}`, init))

describe("routing boundaries", () => {
  test.each([
    ["missing authorization", undefined, 401, "Unauthorized"],
    ["wrong key", "Bearer wrong-key", 401, "Unauthorized"],
    ["wrong scheme", `Basic ${TEST_BOOK_API_KEY}`, 400, "Bad Request"],
    [
      "extra bearer text",
      `Bearer ${TEST_BOOK_API_KEY} extra`,
      400,
      "Bad Request",
    ],
  ])("rejects %s", async (_name, authorization, status, body) => {
    const response = await fetchWorker(`${API_PREFIX}/bookings`, {
      headers: authorization ? { Authorization: authorization } : undefined,
    })

    expect(response.status).toBe(status)
    expect(await response.text()).toBe(body)
  })

  test("protects known and unknown API routes by construction", async () => {
    const known = await fetchWorker(`${API_PREFIX}/bookings`)
    expect(known.status).toBe(401)

    const unknown = await fetchWorker(`${API_PREFIX}/not-a-route`)
    expect(unknown.status).toBe(401)

    const authenticatedUnknown = await fetchWorker(
      `${API_PREFIX}/not-a-route`,
      {
        headers: { Authorization: `Bearer ${TEST_BOOK_API_KEY}` },
      },
    )
    expect(authenticatedUnknown.status).toBe(404)
    expect(await authenticatedUnknown.json()).toEqual({ error: "not_found" })
  })

  test("protects the integrated email send route", async () => {
    const response = await fetchWorker(`${API_PREFIX}/email/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: "customer@example.com",
        subject: "Hello",
        text: "Welcome",
      }),
    })

    expect(response.status).toBe(401)
  })

  test("uses the channel-neutral inbound message route", async () => {
    const headers = {
      Authorization: `Bearer ${TEST_BOOK_API_KEY}`,
      "Content-Type": "application/json",
    }
    const current = await fetchWorker(`${API_PREFIX}/messages/inbound`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    })
    expect(current.status).toBe(400)

    const retired = await fetchWorker(`${API_PREFIX}/bookings/from-message`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    })
    expect(retired.status).toBe(404)
  })

  test("lists supported language models", async () => {
    const response = await fetchWorker(`${API_PREFIX}/language-models`, {
      headers: { Authorization: `Bearer ${TEST_BOOK_API_KEY}` },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      { id: "openai/gpt-5.6-luna", label: "GPT-5.6 Luna" },
      { id: "openai/gpt-5.6-sol", label: "GPT-5.6 Sol" },
      { id: "@cf/openai/gpt-oss-120b", label: "GPT-OSS 120B" },
      { id: "@cf/zai-org/glm-5.2", label: "GLM 5.2" },
      {
        id: "deepseek/deepseek-v4-flash-0731",
        label: "DeepSeek V4 Flash",
      },
    ])
  })

  test("keeps the OAuth callback public", async () => {
    const response = await fetchWorker(GOOGLE_OAUTH_CALLBACK_PATH)
    expect(response.status).toBe(400)
    expect(await response.text()).toBe("Missing OAuth code or state")
  })

  test("keeps the Twilio webhook public but provider-authenticated", async () => {
    const response = await fetchWorker(TWILIO_INBOUND_SMS_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        MessageSid: "SM123",
        From: "+15145550101",
        To: "+15145550100",
        Body: "Hello",
      }),
    })

    expect(response.status).toBe(403)
    expect(await response.text()).toBe("Forbidden")
  })

  test("builds OAuth URLs from the request origin with required scopes", async () => {
    const response = await fetchWorker(`${API_PREFIX}/oauth/google/connect`, {
      headers: { Authorization: `Bearer ${TEST_BOOK_API_KEY}` },
    })
    expect(response.status).toBe(200)

    const { url } = (await response.json()) as { url: string }
    const authorizationUrl = new URL(url)
    const scopes = authorizationUrl.searchParams.get("scope")?.split(" ")

    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      `https://stage.book.test${GOOGLE_OAUTH_CALLBACK_PATH}`,
    )
    expect(scopes).toEqual(
      expect.arrayContaining([
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/userinfo.email",
      ]),
    )
  })

  test("reports when live calendar info is requested before connecting", async () => {
    const response = await fetchWorker(
      `${API_PREFIX}/oauth/google/calendar-info`,
      {
        headers: { Authorization: `Bearer ${TEST_BOOK_API_KEY}` },
      },
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: "Google Calendar is not connected",
    })
  })
})
