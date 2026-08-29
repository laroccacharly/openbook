import {
  queryUncaughtExceptions,
  uncaughtExceptionLines,
} from "./observability"
import { requireEnv } from "@book/secrets"

export interface ErrorsOptions {
  json: boolean
  limit: string
  since?: string
  worker?: string
}

function parseSince(
  value: string | undefined,
  now: number = Date.now(),
): number {
  if (value === undefined) return now - 24 * 60 * 60 * 1_000

  const duration = /^(\d+)([smhdw])$/.exec(value)
  if (duration !== null) {
    const units: Record<string, number> = {
      d: 24 * 60 * 60 * 1_000,
      h: 60 * 60 * 1_000,
      m: 60 * 1_000,
      s: 1_000,
      w: 7 * 24 * 60 * 60 * 1_000,
    }
    const amount = duration[1]
    const unit = duration[2]
    const multiplier = unit === undefined ? undefined : units[unit]
    if (amount === undefined || multiplier === undefined) {
      throw new Error(`Invalid duration: ${value}`)
    }
    return now - Number.parseInt(amount, 10) * multiplier
  }

  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    throw new Error(
      "--since must be a duration such as 15m, 2h, or 7d, or an ISO timestamp",
    )
  }
  return timestamp
}

export async function runErrors(options: ErrorsOptions): Promise<number> {
  const limit = Number.parseInt(options.limit, 10)
  if (!Number.isInteger(limit) || limit < 1 || limit > 2_000) {
    throw new Error("--limit must be an integer between 1 and 2000")
  }

  const apiToken = requireEnv("CLOUDFLARE_API_TOKEN")
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID")

  const to = Date.now()
  const events = await queryUncaughtExceptions({
    accountId,
    apiToken,
    from: parseSince(options.since, to),
    limit,
    to,
    worker: options.worker,
  })
  if (options.json) {
    console.log(JSON.stringify(events, null, 2))
  } else {
    for (const line of events.flatMap(uncaughtExceptionLines)) console.log(line)
  }
  console.error(`${events.length} uncaught exception(s)`)
  return 0
}
