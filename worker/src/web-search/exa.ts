import { z } from "zod"
import type { WebSearch, WebSearchRequest, WebSearchResponse } from "./types"

const ExaSearchResultSchema = z.object({
  title: z.string().nullish(),
  url: z.string(),
  publishedDate: z.string().nullish(),
  text: z.string().nullish(),
  highlights: z.array(z.string()).nullish(),
  summary: z.string().nullish(),
})

const ExaSearchResponseSchema = z.object({
  requestId: z.string(),
  results: z.array(ExaSearchResultSchema),
})

export type ExaSearchType =
  | "instant"
  | "fast"
  | "auto"
  | "deep-lite"
  | "deep"
  | "deep-reasoning"

export interface ExaWebSearchRequest extends WebSearchRequest<string> {
  type?: ExaSearchType
  category?: string
  includeDomains?: readonly string[]
  excludeDomains?: readonly string[]
  startPublishedDate?: string
  endPublishedDate?: string
  userLocation?: string
  moderation?: boolean
  additionalQueries?: readonly string[]
  content?: "highlights" | "full"
  maxCharacters?: number
  livecrawl?: "never" | "fallback" | "always" | "preferred"
}

export interface ExaWebSearchOptions {
  fetch?: typeof fetch
  baseUrl?: string
}

async function exaError(response: Response): Promise<Error> {
  const body = await response.text()
  let detail = body
  try {
    const parsed = z
      .object({ error: z.string().optional(), message: z.string().optional() })
      .parse(JSON.parse(body))
    detail = parsed.error ?? parsed.message ?? body
  } catch {
    // Keep the response text when Exa does not return JSON.
  }
  const suffix = detail === "" ? "" : `: ${detail}`
  return new Error(`Exa Search HTTP ${response.status}${suffix}`)
}

export class ExaWebSearch implements WebSearch<ExaWebSearchRequest> {
  private readonly apiKey: string
  private readonly fetcher: typeof fetch | undefined
  private readonly endpoint: URL

  constructor(apiKey: string, options: ExaWebSearchOptions = {}) {
    if (apiKey.trim() === "") {
      throw new Error("EXA_API_KEY is required")
    }
    this.apiKey = apiKey
    this.fetcher = options.fetch
    this.endpoint = new URL("/search", options.baseUrl ?? "https://api.exa.ai")
  }

  async search(request: ExaWebSearchRequest): Promise<WebSearchResponse> {
    const contentOptions = {
      livecrawl: request.livecrawl,
      ...(request.content === "full"
        ? {
            text:
              request.maxCharacters === undefined
                ? true
                : { maxCharacters: request.maxCharacters },
          }
        : {
            highlights:
              request.maxCharacters === undefined
                ? true
                : { maxCharacters: request.maxCharacters },
          }),
    }
    const body = JSON.stringify({
      query: request.query,
      numResults: request.maxResults,
      type: request.type,
      category: request.category,
      includeDomains:
        request.includeDomains === undefined
          ? undefined
          : [...request.includeDomains],
      excludeDomains:
        request.excludeDomains === undefined
          ? undefined
          : [...request.excludeDomains],
      startPublishedDate: request.startPublishedDate,
      endPublishedDate: request.endPublishedDate,
      userLocation: request.userLocation,
      moderation: request.moderation,
      additionalQueries:
        request.additionalQueries === undefined
          ? undefined
          : [...request.additionalQueries],
      contents: contentOptions,
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
    if (!response.ok) throw await exaError(response)

    const parsed = ExaSearchResponseSchema.parse(await response.json())
    return {
      id: parsed.requestId,
      serverTime: null,
      results: parsed.results.map((result) => ({
        title: result.title ?? result.url,
        url: result.url,
        snippet:
          result.highlights?.join("\n\n") ??
          result.text ??
          result.summary ??
          "",
        publishedAt: result.publishedDate ?? null,
        lastUpdatedAt: null,
      })),
    }
  }
}
