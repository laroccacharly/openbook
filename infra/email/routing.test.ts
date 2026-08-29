import { describe, expect, test } from "bun:test"
import { inspectInboundEmailRouting, setupInboundEmailRouting } from "./routing"

const credentials = { apiToken: "token", accountId: "account" }
const target = {
  zoneName: "example.com",
  address: "agent@example.com",
  workerName: "book-worker",
}

function requestUrl(input: URL | RequestInfo): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

function response(result: unknown, resultInfo?: { total_pages: number }) {
  return new Response(
    JSON.stringify({
      success: true,
      errors: [],
      result,
      ...(resultInfo === undefined ? {} : { result_info: resultInfo }),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
}

const existingRule = {
  id: "rule-1",
  name: "cmail-worker-route",
  enabled: true,
  priority: 7,
  matchers: [{ type: "literal", field: "to", value: "agent@example.com" }],
  actions: [{ type: "worker", value: ["cmail-worker"] }],
}

describe("inbound email routing", () => {
  test("updates an existing rule in place for cutover", async () => {
    const requests: { url: string; init?: RequestInit }[] = []
    const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = requestUrl(input)
      requests.push({ url, init })
      if (url.includes("/zones?")) {
        return response([{ id: "zone-1", name: "example.com" }])
      }
      if (init?.method === "PUT") {
        return response({
          ...existingRule,
          name: "Book inbound email",
          actions: [{ type: "worker", value: ["book-worker"] }],
        })
      }
      return response([existingRule], { total_pages: 1 })
    }) as typeof fetch

    expect(
      setupInboundEmailRouting(credentials, target, fetcher),
    ).resolves.toEqual({
      action: "updated",
      ruleId: "rule-1",
      address: target.address,
      workerName: target.workerName,
    })
    const update = requests.find((request) => request.init?.method === "PUT")
    expect(update?.url).toEndWith("/email/routing/rules/rule-1")
    const body = update?.init?.body
    if (typeof body !== "string") {
      throw new Error(`expected string body, got ${typeof body}`)
    }
    expect(JSON.parse(body)).toEqual({
      name: "Book inbound email",
      enabled: true,
      priority: 7,
      matchers: [{ type: "literal", field: "to", value: "agent@example.com" }],
      actions: [{ type: "worker", value: ["book-worker"] }],
    })
  })

  test("creates a rule when the address is not configured", async () => {
    const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = requestUrl(input)
      if (url.includes("/zones?")) {
        return response([{ id: "zone-1", name: "example.com" }])
      }
      if (init?.method === "POST") {
        return response({ ...existingRule, id: "new-rule" })
      }
      return response([], { total_pages: 1 })
    }) as typeof fetch

    expect(
      setupInboundEmailRouting(credentials, target, fetcher),
    ).resolves.toMatchObject({
      action: "created",
      ruleId: "new-rule",
    })
  })

  test("refuses ambiguous duplicate routes", async () => {
    const fetcher = (async (input: URL | RequestInfo) =>
      requestUrl(input).includes("/zones?")
        ? response([{ id: "zone-1", name: "example.com" }])
        : response([existingRule, { ...existingRule, id: "rule-2" }], {
            total_pages: 1,
          })) as typeof fetch

    expect(
      inspectInboundEmailRouting(credentials, target, fetcher),
    ).rejects.toThrow("Found 2 routing rules")
  })
})
