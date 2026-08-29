import { z } from "zod"
import type { WebSearch, WebSearchRequest, WebSearchResponse } from "./types"

const FirecrawlSearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  description: z.string().nullish(),
  markdown: z.string().nullish(),
  metadata: z
    .object({
      publishedTime: z.string().nullish(),
      modifiedTime: z.string().nullish(),
    })
    .nullish(),
})

const FirecrawlSearchResponseSchema = z.object({
  success: z.literal(true),
  id: z.string(),
  data: z.object({
    web: z.array(FirecrawlSearchResultSchema),
  }),
})

export interface FirecrawlWebSearchRequest extends WebSearchRequest<string> {
  country?: string
  location?: string
  includeDomains?: readonly string[]
  excludeDomains?: readonly string[]
  recency?: "hour" | "day" | "week" | "month" | "year"
  content?: "relevant" | "full"
  timeoutMs?: number
}

export interface FirecrawlWebSearchOptions {
  fetch?: typeof fetch
  baseUrl?: string
}

const recencyFilter = {
  hour: "qdr:h",
  day: "qdr:d",
  week: "qdr:w",
  month: "qdr:m",
  year: "qdr:y",
} as const

async function firecrawlError(response: Response): Promise<Error> {
  const body = await response.text()
  let detail = body
  try {
    const parsed = z
      .object({ error: z.string().optional(), message: z.string().optional() })
      .parse(JSON.parse(body))
    detail = parsed.error ?? parsed.message ?? body
  } catch {
    // Keep the response text when Firecrawl does not return JSON.
  }
  const suffix = detail === "" ? "" : `: ${detail}`
  return new Error(`Firecrawl Search HTTP ${response.status}${suffix}`)
}

export class FirecrawlWebSearch implements WebSearch<FirecrawlWebSearchRequest> {
  private readonly apiKey: string
  private readonly fetcher: typeof fetch | undefined
  private readonly endpoint: URL

  constructor(apiKey: string, options: FirecrawlWebSearchOptions = {}) {
    if (apiKey.trim() === "") {
      throw new Error("FIRECRAWL_API_KEY is required")
    }
    this.apiKey = apiKey
    this.fetcher = options.fetch
    this.endpoint = new URL(
      "/v2/search",
      options.baseUrl ?? "https://api.firecrawl.dev",
    )
  }

  async search(request: FirecrawlWebSearchRequest): Promise<WebSearchResponse> {
    const body = JSON.stringify({
      query: request.query,
      limit: request.maxResults,
      sources: ["web"],
      country: request.country,
      location: request.location,
      includeDomains:
        request.includeDomains === undefined
          ? undefined
          : [...request.includeDomains],
      excludeDomains:
        request.excludeDomains === undefined
          ? undefined
          : [...request.excludeDomains],
      tbs:
        request.recency === undefined
          ? undefined
          : recencyFilter[request.recency],
      timeout: request.timeoutMs,
      scrapeOptions:
        request.content === "full"
          ? { formats: [{ type: "markdown" }] }
          : undefined,
    })
    const init = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body,
    }
    const response =
      this.fetcher === undefined
        ? await fetch(this.endpoint, init)
        : await this.fetcher(this.endpoint, init)
    if (!response.ok) throw await firecrawlError(response)

    const parsed = FirecrawlSearchResponseSchema.parse(await response.json())
    return {
      id: parsed.id,
      serverTime: null,
      results: parsed.data.web.map((result) => ({
        title: result.title,
        url: result.url,
        snippet: result.markdown ?? result.description ?? "",
        publishedAt: result.metadata?.publishedTime ?? null,
        lastUpdatedAt: result.metadata?.modifiedTime ?? null,
      })),
    }
  }
}
