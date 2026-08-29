import type { ApiClient } from "@worker/src/api-client"
import { listApiClientMethodNames } from "./methods"

export function parseCallArgs(json: string): unknown[] {
  if (json.trim() === "") {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error("--args must be valid JSON.")
  }

  if (Array.isArray(parsed)) {
    return parsed
  }

  return [parsed]
}

export function isApiClientMethodName(name: string): boolean {
  return listApiClientMethodNames().includes(name)
}

export async function callApiMethod(
  methodName: string,
  args: unknown[],
  client: ApiClient,
): Promise<unknown> {
  if (!isApiClientMethodName(methodName)) {
    throw new Error(
      `Unknown method: ${methodName}. Run \`bun api methods\` for the list.`,
    )
  }

  const method = client[methodName as keyof ApiClient]
  if (typeof method !== "function") {
    throw new Error(`Not a callable method: ${methodName}`)
  }

  return await (method as (...params: unknown[]) => Promise<unknown>).apply(
    client,
    args,
  )
}
