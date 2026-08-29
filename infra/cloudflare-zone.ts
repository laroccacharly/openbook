import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { dirname, resolve } from "node:path"
import { z } from "zod"

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4"

const CloudflareZoneSchema = z.object({
  zoneId: z.string().min(1),
  domain: z.string().min(1),
})

const CloudflareApiZoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
})

const CloudflareZonesResponseSchema = z.object({
  success: z.boolean(),
  errors: z
    .array(z.object({ message: z.string().optional() }))
    .optional()
    .default([]),
  result: z.array(CloudflareApiZoneSchema).optional().default([]),
  result_info: z
    .object({ total_pages: z.number().int().positive().optional() })
    .optional(),
})

export type CloudflareZone = z.infer<typeof CloudflareZoneSchema>

export const cloudflareZonePath = resolve(
  homedir(),
  ".book",
  "cloudflare-zone.json",
)

export function readCloudflareZone(
  path: string = cloudflareZonePath,
): CloudflareZone | undefined {
  if (!existsSync(path)) return undefined
  try {
    return CloudflareZoneSchema.parse(JSON.parse(readFileSync(path, "utf8")))
  } catch (cause) {
    throw new Error(
      `Invalid Cloudflare zone configuration in ${path}. Run \`bun infra zone set <zone>\` to replace it.`,
      { cause },
    )
  }
}

export function resolveCloudflareZone(
  path: string = cloudflareZonePath,
): CloudflareZone {
  const zone = readCloudflareZone(path)
  if (zone !== undefined) return zone
  throw new Error(
    `No Cloudflare zone is configured. Run \`bun infra zone list\`, then \`bun infra zone set <zone>\`.`,
  )
}

export function storeCloudflareZone(
  zone: CloudflareZone,
  path: string = cloudflareZonePath,
): CloudflareZone {
  const validated = CloudflareZoneSchema.parse(zone)
  mkdirSync(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${process.pid}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, {
    mode: 0o600,
  })
  renameSync(temporaryPath, path)
  return validated
}

export async function listCloudflareZones(
  credentials: { accountId: string; apiToken: string },
  fetcher: typeof fetch = fetch,
): Promise<CloudflareZone[]> {
  const zones: CloudflareZone[] = []
  for (let page = 1; ; page += 1) {
    const url = new URL(`${CLOUDFLARE_API}/zones`)
    url.searchParams.set("account.id", credentials.accountId)
    url.searchParams.set("page", String(page))
    url.searchParams.set("per_page", "50")
    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${credentials.apiToken}` },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) {
      throw new Error(`Failed to list Cloudflare zones (${response.status})`)
    }
    const payload = CloudflareZonesResponseSchema.parse(await response.json())
    if (!payload.success) {
      throw new Error(
        payload.errors
          .map((error) => error.message)
          .filter(Boolean)
          .join(", ") || "Failed to list Cloudflare zones",
      )
    }
    zones.push(
      ...payload.result.map((zone) => ({
        zoneId: zone.id,
        domain: zone.name,
      })),
    )
    if (page >= (payload.result_info?.total_pages ?? page)) break
  }
  return zones.sort((left, right) => left.domain.localeCompare(right.domain))
}

export function selectCloudflareZone(
  zones: readonly CloudflareZone[],
  value: string,
): CloudflareZone {
  const selection = value.trim().toLowerCase()
  const matches = zones.filter(
    (zone) =>
      zone.zoneId.toLowerCase() === selection ||
      zone.domain.toLowerCase() === selection,
  )
  const zone = matches[0]
  if (matches.length !== 1 || zone === undefined) {
    throw new Error(
      `Expected exactly one Cloudflare zone matching ${JSON.stringify(value)}. Run \`bun infra zone list\` to see available zones.`,
    )
  }
  return zone
}
