import { z } from "zod"

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4"

const CloudflareEnvelopeSchema = z.object({
  success: z.boolean(),
  errors: z.array(z.looseObject({ message: z.string().optional() })).optional(),
  result: z.unknown(),
  result_info: z
    .looseObject({ total_pages: z.number().int().positive().optional() })
    .optional(),
})

const ZoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
})

const EmailRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullish(),
  enabled: z.boolean().nullish(),
  priority: z.number().nullish(),
  matchers: z.array(
    z.object({
      type: z.string(),
      field: z.string().nullish(),
      value: z.string().nullish(),
    }),
  ),
  actions: z.array(
    z.object({
      type: z.string(),
      value: z.array(z.string()).nullish(),
    }),
  ),
})

export type EmailRoutingCredentials = {
  apiToken: string
  accountId: string
}

export type EmailRoutingTarget = {
  zoneName: string
  address: string
  workerName: string
}

export type InboundEmailRoutingStatus = {
  zoneId: string
  zoneName: string
  address: string
  rule: z.infer<typeof EmailRuleSchema> | null
}

type Fetcher = typeof fetch

function apiHeaders(credentials: EmailRoutingCredentials): HeadersInit {
  return {
    Authorization: `Bearer ${credentials.apiToken}`,
    "Content-Type": "application/json",
  }
}

async function cloudflareRequest(
  fetcher: Fetcher,
  url: URL,
  init: RequestInit,
) {
  const response = await fetcher(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30_000),
  })
  const payload = CloudflareEnvelopeSchema.safeParse(await response.json())
  if (!payload.success) {
    throw new Error(`Unexpected Cloudflare response (${response.status})`)
  }
  if (!response.ok || !payload.data.success) {
    const detail = payload.data.errors
      ?.map((error) => error.message)
      .filter((message): message is string => message !== undefined)
      .join("; ")
    throw new Error(
      detail === undefined || detail === ""
        ? `Cloudflare request failed (${response.status})`
        : detail,
    )
  }
  return payload.data
}

async function resolveZoneId(
  credentials: EmailRoutingCredentials,
  zoneName: string,
  fetcher: Fetcher,
): Promise<string> {
  const url = new URL(`${CLOUDFLARE_API}/zones`)
  url.searchParams.set("name", zoneName)
  url.searchParams.set("account.id", credentials.accountId)
  const payload = await cloudflareRequest(fetcher, url, {
    headers: apiHeaders(credentials),
  })
  const zones = z.array(ZoneSchema).parse(payload.result)
  const exact = zones.filter((zone) => zone.name === zoneName)
  const zone = exact[0]
  if (exact.length !== 1 || zone === undefined) {
    throw new Error(`Expected one Cloudflare zone named ${zoneName}`)
  }
  return zone.id
}

async function listRules(
  credentials: EmailRoutingCredentials,
  zoneId: string,
  fetcher: Fetcher,
) {
  const rules: z.infer<typeof EmailRuleSchema>[] = []
  let page = 1
  let totalPages = 1
  do {
    const url = new URL(
      `${CLOUDFLARE_API}/zones/${encodeURIComponent(zoneId)}/email/routing/rules`,
    )
    url.searchParams.set("page", String(page))
    url.searchParams.set("per_page", "100")
    const payload = await cloudflareRequest(fetcher, url, {
      headers: apiHeaders(credentials),
    })
    rules.push(...z.array(EmailRuleSchema).parse(payload.result))
    totalPages = payload.result_info?.total_pages ?? 1
    page += 1
  } while (page <= totalPages)
  return rules
}

function matchesAddress(
  rule: z.infer<typeof EmailRuleSchema>,
  address: string,
): boolean {
  const normalized = address.toLowerCase()
  return rule.matchers.some(
    (matcher) =>
      matcher.type === "literal" &&
      matcher.field === "to" &&
      matcher.value?.toLowerCase() === normalized,
  )
}

export async function inspectInboundEmailRouting(
  credentials: EmailRoutingCredentials,
  target: Pick<EmailRoutingTarget, "zoneName" | "address">,
  fetcher: Fetcher = fetch,
): Promise<InboundEmailRoutingStatus> {
  const zoneId = await resolveZoneId(credentials, target.zoneName, fetcher)
  const matches = (await listRules(credentials, zoneId, fetcher)).filter(
    (rule) => matchesAddress(rule, target.address),
  )
  if (matches.length > 1) {
    throw new Error(
      `Found ${matches.length} routing rules for ${target.address}; remove duplicates before continuing`,
    )
  }
  return {
    zoneId,
    zoneName: target.zoneName,
    address: target.address,
    rule: matches[0] ?? null,
  }
}

export async function setupInboundEmailRouting(
  credentials: EmailRoutingCredentials,
  target: EmailRoutingTarget,
  fetcher: Fetcher = fetch,
): Promise<{
  action: "created" | "updated"
  ruleId: string
  address: string
  workerName: string
}> {
  const status = await inspectInboundEmailRouting(credentials, target, fetcher)
  const body = {
    name: "Book inbound email",
    enabled: true,
    priority: status.rule?.priority ?? 0,
    matchers: [{ type: "literal", field: "to", value: target.address }],
    actions: [{ type: "worker", value: [target.workerName] }],
  }
  const action = status.rule === null ? "created" : "updated"
  const path =
    status.rule === null
      ? `/zones/${encodeURIComponent(status.zoneId)}/email/routing/rules`
      : `/zones/${encodeURIComponent(status.zoneId)}/email/routing/rules/${encodeURIComponent(status.rule.id)}`
  const payload = await cloudflareRequest(
    fetcher,
    new URL(`${CLOUDFLARE_API}${path}`),
    {
      method: status.rule === null ? "POST" : "PUT",
      headers: apiHeaders(credentials),
      body: JSON.stringify(body),
    },
  )
  const rule = EmailRuleSchema.parse(payload.result)
  return {
    action,
    ruleId: rule.id,
    address: target.address,
    workerName: target.workerName,
  }
}
