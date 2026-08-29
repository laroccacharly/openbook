import { z } from "zod"
import { requireEnv } from "@book/secrets"

const WORKERS_AI_MODELS_URL =
  "https://developers.cloudflare.com/workers-ai/models/"
const AI_MODELS_URL = "https://developers.cloudflare.com/ai/models/"
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"

const AiModelSchema = z.object({
  name: z.string().min(1),
  id: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  task: z
    .union([z.string(), z.object({ name: z.string().optional().nullable() })])
    .optional()
    .nullable(),
  tags: z.array(z.string()).optional().default([]),
  source: z.number().optional().nullable(),
  hosted: z.boolean().optional().default(true),
  openrouterId: z.string().optional(),
  created: z.number().int().optional().nullable(),
  intelligenceIndex: z.number().optional().nullable(),
  matchScore: z.number().optional(),
})

export type AiModel = z.infer<typeof AiModelSchema>
export type ModelSort = "newest" | "score"

const OpenRouterModelSchema = z.object({
  id: z.string().min(1),
  created: z.number().int().optional().nullable(),
  benchmarks: z
    .object({
      artificial_analysis: z
        .record(z.string(), z.unknown())
        .optional()
        .nullable(),
    })
    .optional()
    .nullable(),
})
type OpenRouterModel = z.infer<typeof OpenRouterModelSchema>

const aliases: Record<string, string> = {
  "zai-org": "z-ai",
  "z-ai": "zai-org",
  meta: "meta-llama",
  "meta-llama": "meta",
  mistralai: "mistral",
  mistral: "mistralai",
  xai: "x-ai",
  "x-ai": "xai",
  "deepseek-ai": "deepseek",
  deepseek: "deepseek-ai",
}

function normalize(id: string): string {
  const normalized = id
    .trim()
    .toLowerCase()
    .replace(/^@(cf|hf)\//, "")
  const colon = normalized.indexOf(":")
  return colon < 0 ? normalized : normalized.slice(0, colon)
}

function split(id: string): [string | undefined, string] {
  const normalized = normalize(id)
  const slash = normalized.indexOf("/")
  return slash < 0
    ? [undefined, normalized]
    : [normalized.slice(0, slash), normalized.slice(slash + 1)]
}

function compatible(left?: string, right?: string): boolean {
  return (
    left === undefined ||
    right === undefined ||
    left === right ||
    aliases[left] === right
  )
}

function buildLevenshteinRow(
  left: string,
  right: string,
  rowIndex: number,
  previous: number[],
): number[] {
  const current = [rowIndex]
  for (let columnIndex = 1; columnIndex <= right.length; columnIndex += 1) {
    const substitution = left[rowIndex - 1] === right[columnIndex - 1] ? 0 : 1
    current[columnIndex] = Math.min(
      numberAt(current, columnIndex - 1) + 1,
      numberAt(previous, columnIndex) + 1,
      numberAt(previous, columnIndex - 1) + substitution,
    )
  }
  return current
}

function numberAt(values: number[], index: number): number {
  const value = values[index]
  if (value === undefined)
    throw new Error(`Missing numeric value at index ${index}`)
  return value
}

function similarity(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let rowIndex = 1; rowIndex <= left.length; rowIndex += 1) {
    const current = buildLevenshteinRow(left, right, rowIndex, previous)
    previous.splice(0, previous.length, ...current)
  }
  return (
    1 -
    numberAt(previous, right.length) / Math.max(left.length, right.length, 1)
  )
}

function matchScore(cloudflareId: string, openrouterId: string): number {
  const [cfAuthor, cfSlug] = split(cloudflareId)
  const [orAuthor, orSlug] = split(openrouterId)
  if (normalize(cloudflareId) === normalize(openrouterId)) return 1
  if (cfSlug === orSlug) {
    if (cfAuthor === orAuthor) return 0.98
    return compatible(cfAuthor, orAuthor) ? 0.95 : 0.85
  }
  if (!compatible(cfAuthor, orAuthor)) return 0
  const leftTokens = new Set(cfSlug.split("-").filter(Boolean))
  const rightTokens = new Set(orSlug.split("-").filter(Boolean))
  const intersection = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  ).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  const jaccard = union === 0 ? 0 : intersection / union
  if (jaccard >= 0.75) return Math.round((0.7 + 0.25 * jaccard) * 1000) / 1000
  const ratio = similarity(normalize(cloudflareId), normalize(openrouterId))
  return ratio >= 0.96 ? Math.round(ratio * 1000) / 1000 : 0
}

function intelligence(model: OpenRouterModel): number | undefined {
  const value = model.benchmarks?.artificial_analysis?.intelligence_index
  return typeof value === "number" ? value : undefined
}

async function openRouterModels(): Promise<OpenRouterModel[]> {
  const response = await fetch(`${OPENROUTER_MODELS_URL}?sort=newest`, {
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok)
    throw new Error(`OpenRouter models fetch failed (${response.status})`)
  const payload = (await response.json()) as { data?: unknown }
  return z.array(OpenRouterModelSchema).parse(payload.data)
}

async function enrich(models: AiModel[]): Promise<AiModel[]> {
  const candidates = await openRouterModels()
  return models.map((model) => {
    let best: { candidate: OpenRouterModel; score: number } | undefined
    for (const candidate of candidates) {
      const score = matchScore(model.name, candidate.id)
      if (score >= 0.9 && (best === undefined || score > best.score)) {
        best = { candidate, score }
      }
    }
    return best === undefined
      ? model
      : {
          ...model,
          openrouterId: best.candidate.id,
          created: best.candidate.created,
          intelligenceIndex: intelligence(best.candidate),
          matchScore: best.score,
        }
  })
}

async function modelsFromDocs(includeThirdParty: boolean): Promise<AiModel[]> {
  const response = await fetch(
    includeThirdParty ? AI_MODELS_URL : WORKERS_AI_MODELS_URL,
    {
      signal: AbortSignal.timeout(30_000),
    },
  )
  if (!response.ok)
    throw new Error(`Failed to fetch model catalog (${response.status})`)
  const html = await response.text()
  const pattern = includeThirdParty
    ? /href="\/ai\/models\/((?:@(?:cf|hf)\/)?[^"/]+\/[^"/]+)\/?"/g
    : /@(?:cf|hf)\/[A-Za-z0-9._/-]+/g
  const names = [...html.matchAll(pattern)].map((match) => {
    const encodedName = includeThirdParty ? match[1] : match[0]
    if (encodedName === undefined)
      throw new Error("Model catalog contained an invalid link")
    return decodeURIComponent(encodedName.replace(/\/$/, ""))
  })
  return [...new Set(names)]
    .filter(
      (name) =>
        includeThirdParty || name.startsWith("@cf/") || name.startsWith("@hf/"),
    )
    .map((name) =>
      AiModelSchema.parse({ name, hosted: /^@(cf|hf)\//.test(name) }),
    )
}

async function modelsFromApi(search?: string): Promise<AiModel[]> {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID")
  const token = requireEnv("CLOUDFLARE_API_TOKEN")
  const result: AiModel[] = []
  for (let page = 1; ; page += 1) {
    const url = new URL(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search`,
    )
    url.searchParams.set("page", String(page))
    url.searchParams.set("per_page", "100")
    if (search !== undefined) url.searchParams.set("search", search)
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    })
    if (response.status === 403) {
      throw new Error(
        "Cloudflare API returned 403 for ai/models/search. Grant Workers AI Read on CLOUDFLARE_API_TOKEN.",
      )
    }
    if (!response.ok)
      throw new Error(`Workers AI models search failed (${response.status})`)
    const payload = (await response.json()) as {
      success?: boolean
      result?: unknown
      result_info?: { total_pages?: number }
    }
    if (!payload.success)
      throw new Error("Workers AI models search was unsuccessful")
    const pageModels = z.array(AiModelSchema).parse(payload.result)
    result.push(...pageModels)
    if (
      page >=
      (payload.result_info?.total_pages ??
        (pageModels.length < 100 ? page : page + 1))
    )
      break
  }
  return result
}

export interface ListModelsOptions {
  api: boolean
  search?: string
  includeThirdParty: boolean
  sort: ModelSort
  limit: number
}

export async function listAiModels(
  options: ListModelsOptions,
): Promise<AiModel[]> {
  if (options.api && options.includeThirdParty) {
    throw new Error(
      "--third-party is only supported with the docs catalog (omit --api).",
    )
  }
  let models = options.api
    ? await modelsFromApi(options.search)
    : await modelsFromDocs(options.includeThirdParty)
  if (!options.api && options.search !== undefined) {
    const needle = options.search.toLowerCase()
    models = models.filter((model) => model.name.toLowerCase().includes(needle))
  }
  models = await enrich(models)
  models.sort((left, right) => {
    if (options.sort === "score") {
      const score =
        (right.intelligenceIndex ?? -1) - (left.intelligenceIndex ?? -1)
      if (score !== 0) return score
    }
    const created = (right.created ?? -1) - (left.created ?? -1)
    return created !== 0 ? created : left.name.localeCompare(right.name)
  })
  return options.limit > 0 ? models.slice(0, options.limit) : models
}

export function modelDisplayLine(model: AiModel): string {
  const date =
    model.created === undefined || model.created === null
      ? "????-??-??"
      : new Date(model.created * 1000).toISOString().slice(0, 10)
  const score =
    model.intelligenceIndex === undefined || model.intelligenceIndex === null
      ? "score=?"
      : `score=${model.intelligenceIndex}`
  const match =
    model.openrouterId !== undefined && model.openrouterId !== model.name
      ? ` ~${model.openrouterId}`
      : ""
  return `${date} ${score} ${model.name}${match}${model.hosted ? "" : " (third-party)"}`
}
