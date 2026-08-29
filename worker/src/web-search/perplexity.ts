import Perplexity from "@perplexity-ai/perplexity_ai"
import type { WebSearch, WebSearchRequest, WebSearchResponse } from "./types"

export type WebSearchRecency = "hour" | "day" | "week" | "month" | "year"
export type WebSearchMode = "web" | "academic" | "sec"

export interface PerplexityWebSearchRequest extends WebSearchRequest {
  maxTokens?: number
  maxTokensPerPage?: number
  country?: string
  domains?: readonly string[]
  languages?: readonly string[]
  mode?: WebSearchMode
  recency?: WebSearchRecency
}

export interface PerplexityWebSearchOptions {
  fetch?: typeof fetch
}

export class PerplexityWebSearch implements WebSearch<PerplexityWebSearchRequest> {
  private readonly client: Perplexity

  constructor(apiKey: string, options: PerplexityWebSearchOptions = {}) {
    if (apiKey.trim() === "") {
      throw new Error("PERPLEXITY_API_KEY is required")
    }
    this.client = new Perplexity({ apiKey, fetch: options.fetch })
  }

  async search(
    request: PerplexityWebSearchRequest,
  ): Promise<WebSearchResponse> {
    const response = await this.client.search.create({
      query:
        typeof request.query === "string" ? request.query : [...request.query],
      max_results: request.maxResults,
      max_tokens: request.maxTokens,
      max_tokens_per_page: request.maxTokensPerPage,
      country: request.country,
      search_domain_filter:
        request.domains === undefined ? undefined : [...request.domains],
      search_language_filter:
        request.languages === undefined ? undefined : [...request.languages],
      search_mode: request.mode,
      search_recency_filter: request.recency,
    })

    return {
      id: response.id,
      results: response.results.map((result) => ({
        title: result.title,
        url: result.url,
        snippet: result.snippet,
        publishedAt: result.date ?? null,
        lastUpdatedAt: result.last_updated ?? null,
      })),
      serverTime: response.server_time ?? null,
    }
  }
}
