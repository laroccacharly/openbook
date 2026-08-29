import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { resolveDeploymentOrigin } from "./deployment-context"

function contentHash(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12)
}

async function fetchUi(url: string): Promise<Uint8Array | string> {
  try {
    const response = await fetch(`${url}?t=${Date.now()}`, {
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return new Uint8Array(await response.arrayBuffer())
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

export async function waitForUiFresh(
  infraDirectory: string,
  timeoutMilliseconds = 300_000,
): Promise<void> {
  const path = resolve(infraDirectory, "../ui/dist/index.html")
  const file = Bun.file(path)
  if (!(await file.exists()))
    throw new Error(`UI build output is missing: ${path}`)

  const expected = new Uint8Array(await file.arrayBuffer())
  const expectedHash = contentHash(expected)
  const url = `${resolveDeploymentOrigin()}/`
  console.log(`Waiting for UI freshness at ${url} (index=${expectedHash})`)

  const started = performance.now()
  let attempt = 0
  let deployedHash: string | undefined
  while (performance.now() - started <= timeoutMilliseconds) {
    attempt += 1
    const elapsed = performance.now() - started
    const deployed = await fetchUi(url)
    if (typeof deployed === "string") {
      console.log(
        `  attempt ${attempt}: fetch error after ${(elapsed / 1000).toFixed(1)}s — ${deployed}`,
      )
      await Bun.sleep(2_000)
      continue
    }
    deployedHash = contentHash(deployed)
    if (Buffer.from(deployed).equals(Buffer.from(expected))) {
      console.log(
        `  attempt ${attempt}: UI fresh after ${(elapsed / 1000).toFixed(1)}s (index=${expectedHash})`,
      )
      return
    }
    console.log(
      `  attempt ${attempt}: not yet (elapsed ${(elapsed / 1000).toFixed(1)}s, deployed=${deployedHash}, expected=${expectedHash})`,
    )
    await Bun.sleep(2_000)
  }
  throw new Error(
    `UI not fresh after ${(timeoutMilliseconds / 1000).toFixed(0)}s (expected index ${expectedHash}, last saw ${deployedHash} at ${url})`,
  )
}
