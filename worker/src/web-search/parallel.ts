import { z } from "zod"
import type { WebSearch, WebSearchRequest, WebSearchResponse } from "./types"

const ParallelSearchResultSchema = z.object({
  url: z.string(),
  title: z.string().nullish(),
  publish_date: z.string().nullish(),
  excerpts: z.array(z.string()),
})

const ParallelSearchResponseSchema = z.object({
  search_id: z.string(),
  session_id: z.string(),
  results: z.array(ParallelSearchResultSchema),
})

export type ParallelSearchMode = "turbo" | "fast" | "basic" | "advanced"

export interface ParallelWebSearchRequest extends WebSearchRequest {
  objective?: string
  mode?: ParallelSearchMode
  maxCharactersTotal?: number
  maxCharactersPerResult?: number
  sessionId?: string
  clientModel?: string
  includeDomains?: readonly string[]
  excludeDomains?: readonly string[]
  afterDate?: string
  maxAgeSeconds?: number
  fetchTimeoutSeconds?: number
  disableCacheFallback?: boolean
}

export interface ParallelWebSearchOptions {
  fetch?: typeof fetch
  baseUrl?: string
}

async function parallelError(response: Response): Promise<Error> {
  const body = await response.text()
  let detail = body
  try {
    const parsed = z
      .object({
        error: z
          .union([z.string(), z.object({ message: z.string() })])
          .optional(),
        message: z.string().optional(),
      })
      .parse(JSON.parse(body))
    detail =
      (typeof parsed.error === "string"
        ? parsed.error
        : parsed.error?.message) ??
      parsed.message ??
      body
  } catch {
    // Keep the response text when Parallel does not return JSON.
  }
  const suffix = detail === "" ? "" : `: ${detail}`
  return new Error(`Parallel Search HTTP ${response.status}${suffix}`)
}

export class ParallelWebSearch implements WebSearch<ParallelWebSearchRequest> {
  private readonly apiKey: string
  private readonly fetcher: typeof fetch | undefined
  private readonly endpoint: URL

  constructor(apiKey: string, options: ParallelWebSearchOptions = {}) {
    if (apiKey.trim() === "") {
      throw new Error("PARALLEL_API_KEY is required")
    }
    this.apiKey = apiKey
    this.fetcher = options.fetch
    this.endpoint = new URL(
      "/v1/search",
      options.baseUrl ?? "https://api.parallel.ai",
    )
  }

  async search(request: ParallelWebSearchRequest): Promise<WebSearchResponse> {
    const sourcePolicy = {
      include_domains:
        request.includeDomains === undefined
          ? undefined
          : [...request.includeDomains],
      exclude_domains:
        request.excludeDomains === undefined
          ? undefined
          : [...request.excludeDomains],
      after_date: request.afterDate,
    }
    const fetchPolicy = {
      max_age_seconds: request.maxAgeSeconds,
      timeout_seconds: request.fetchTimeoutSeconds,
      disable_cache_fallback: request.disableCacheFallback,
    }
    const hasSourcePolicy = Object.values(sourcePolicy).some(
      (value) => value !== undefined,
    )
    const hasFetchPolicy = Object.values(fetchPolicy).some(
      (value) => value !== undefined,
    )
    const hasAdvancedSettings =
      request.maxResults !== undefined ||
      request.maxCharactersPerResult !== undefined ||
      hasSourcePolicy ||
      hasFetchPolicy
    const body = JSON.stringify({
      objective:
        request.objective ??
        (typeof request.query === "string" ? request.query : undefined),
      search_queries:
        typeof request.query === "string"
          ? [request.query]
          : [...request.query],
      mode: request.mode,
      max_chars_total: request.maxCharactersTotal,
      session_id: request.sessionId,
      client_model: request.clientModel,
      advanced_settings: hasAdvancedSettings
        ? {
            max_results: request.maxResults,
            source_policy: hasSourcePolicy ? sourcePolicy : undefined,
            fetch_policy: hasFetchPolicy ? fetchPolicy : undefined,
            excerpt_settings:
              request.maxCharactersPerResult === undefined
                ? undefined
                : {
                    max_chars_per_result: request.maxCharactersPerResult,
                  },
          }
        : undefined,
    })
    const init = {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "Content-Type": "application/json",
      },
      body,
    }
    const response =
      this.fetcher === undefined
        ? await fetch(this.endpoint, init)
        : await this.fetcher(this.endpoint, init)
    if (!response.ok) throw await parallelError(response)

    const parsed = ParallelSearchResponseSchema.parse(await response.json())
    return {
      id: parsed.search_id,
      serverTime: null,
      results: parsed.results.map((result) => ({
        title: result.title ?? result.url,
        url: result.url,
        snippet: result.excerpts.join("\n\n"),
        publishedAt: result.publish_date ?? null,
        lastUpdatedAt: null,
      })),
    }
  }
}
