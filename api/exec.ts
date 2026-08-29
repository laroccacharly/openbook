import { readFile } from "node:fs/promises"
import type { ApiClient } from "@worker/src/api-client"

type AsyncFunctionConstructor = new (
  ...args: string[]
) => (api: ApiClient) => Promise<unknown>

const AsyncFunction = Object.getPrototypeOf(async function () {})
  .constructor as AsyncFunctionConstructor

export async function readExecCode(
  code: string | undefined,
  filePath: string | undefined,
): Promise<string> {
  if (filePath !== undefined) {
    return await readFile(filePath, "utf8")
  }

  if (code === undefined || code === "") {
    throw new Error(
      "Code is required. Pass it as an argument, or use --file <path>.",
    )
  }

  if (code === "-") {
    return await Bun.stdin.text()
  }

  return code
}

export function compileExecCode(
  code: string,
): (api: ApiClient) => Promise<unknown> {
  const trimmed = code.trim()
  if (trimmed === "") {
    throw new Error("Code is required.")
  }

  const source = trimmed.startsWith("async")
    ? trimmed
    : `async (api) => (${trimmed})`

  return new AsyncFunction("api", `const fn = ${source}; return fn(api);`)
}

export async function runExecCode(
  code: string,
  api: ApiClient,
): Promise<unknown> {
  const fn = compileExecCode(code)
  return await fn(api)
}
