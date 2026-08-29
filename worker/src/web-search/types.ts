export interface WebSearchRequest<
  Query extends string | readonly string[] = string | readonly string[],
> {
  query: Query
  maxResults?: number
}

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  publishedAt: string | null
  lastUpdatedAt: string | null
}

export interface WebSearchResponse {
  id: string
  results: WebSearchResult[]
  serverTime: string | null
}

export interface WebSearch<
  Request extends WebSearchRequest = WebSearchRequest,
> {
  search(request: Request): Promise<WebSearchResponse>
}
