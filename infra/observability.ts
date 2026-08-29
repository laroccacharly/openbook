import { z } from "zod"

const TelemetryMetadataSchema = z.looseObject({
  error: z.string().optional(),
  id: z.string().optional(),
  requestId: z.string().optional(),
  service: z.string().optional(),
  url: z.string().optional(),
})

const WorkersMetadataSchema = z.looseObject({
  outcome: z.string().optional(),
  requestId: z.string().optional(),
  scriptName: z.string().optional(),
})

const TelemetryEventSchema = z.looseObject({
  $metadata: TelemetryMetadataSchema.optional(),
  $workers: WorkersMetadataSchema.optional(),
  source: z.unknown().optional(),
  timestamp: z.number().optional(),
})

const ObservabilityResponseSchema = z.object({
  errors: z.array(z.looseObject({ message: z.string() })).default([]),
  result: z
    .object({
      events: z
        .object({
          count: z.number().optional(),
          events: z.array(TelemetryEventSchema).default([]),
        })
        .optional(),
    })
    .optional(),
  success: z.boolean(),
})

export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>

export interface UncaughtExceptionsOptions {
  accountId: string
  apiToken: string
  from: number
  limit: number
  to: number
  worker?: string
}

export async function queryUncaughtExceptions(
  options: UncaughtExceptionsOptions,
): Promise<TelemetryEvent[]> {
  const filters = [
    {
      key: "$workers.outcome",
      operation: "eq",
      type: "string",
      value: "exception",
    },
  ]
  if (options.worker !== undefined) {
    filters.push({
      key: "$metadata.service",
      operation: "eq",
      type: "string",
      value: options.worker,
    })
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}/workers/observability/telemetry/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        limit: options.limit,
        parameters: {
          filterCombination: "and",
          filters,
          view: "events",
        },
        queryId: "book-uncaught-exceptions",
        timeframe: {
          from: options.from,
          to: options.to,
        },
      }),
    },
  )
  if (!response.ok) {
    throw new Error(
      `Cloudflare Observability API returned ${response.status}: ${await response.text()}`,
    )
  }

  const result = ObservabilityResponseSchema.parse(await response.json())
  if (!result.success) {
    const messages = result.errors.map((error) => error.message).join("; ")
    throw new Error(messages || "Cloudflare Observability query failed")
  }
  return result.result?.events?.events ?? []
}

type ExceptionSource = {
  Exceptions?: unknown
  exceptions?: unknown
}

function sourceExceptionDetails(source: unknown): string | undefined {
  if (!isExceptionSource(source)) return undefined
  const exceptions = source.Exceptions ?? source.exceptions
  if (!Array.isArray(exceptions) || exceptions.length === 0) return undefined
  return exceptions.map(formatValue).join("\n")
}

function isExceptionSource(value: unknown): value is ExceptionSource {
  return typeof value === "object" && value !== null
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value
  const serialized: unknown = JSON.stringify(value)
  return typeof serialized === "string" ? serialized : String(value)
}

function exceptionMessage(event: TelemetryEvent): string {
  const metadataError = event["$metadata"]?.error
  if (metadataError !== undefined) return metadataError
  return sourceExceptionDetails(event.source) ?? "Uncaught exception"
}

function formatExceptionTimestamp(timestamp: number | undefined): string {
  if (timestamp === undefined) return "unknown-time"
  return new Date(timestamp).toISOString()
}

function metadataOrWorkersValue(
  metadataValue: string | undefined,
  workersValue: string | undefined,
): string {
  if (metadataValue !== undefined) return metadataValue
  if (workersValue !== undefined) return workersValue
  return "unknown"
}

function formatExceptionContext(event: TelemetryEvent): string {
  const metadata = event["$metadata"]
  const workers = event["$workers"]
  const parts = [
    `service=${metadataOrWorkersValue(metadata?.service, workers?.scriptName)}`,
    `request=${metadataOrWorkersValue(metadata?.requestId, workers?.requestId)}`,
  ]
  if (metadata?.url !== undefined) {
    parts.push(`url=${metadata.url}`)
  }
  return parts.join(" ")
}

export function uncaughtExceptionLines(event: TelemetryEvent): string[] {
  const timestamp = formatExceptionTimestamp(event.timestamp)
  return [
    `${timestamp} ${exceptionMessage(event)}`,
    `  ${formatExceptionContext(event)}`,
  ]
}
