import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { deploymentStage, validateDeploymentId } from "./deployment"

export const deploymentIdPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  ".alchemy",
  "deployment-id",
)

export function readDeploymentId(): string | undefined {
  if (!existsSync(deploymentIdPath)) return undefined
  return validateDeploymentId(readFileSync(deploymentIdPath, "utf8"))
}

export function setDeploymentId(
  value: string,
  options: { overwrite?: boolean } = {},
): string {
  const id = validateDeploymentId(value)

  if (!options.overwrite && existsSync(deploymentIdPath)) {
    const existing = validateDeploymentId(
      readFileSync(deploymentIdPath, "utf8"),
    )
    throw new Error(
      `Deployment ID is already set to ${JSON.stringify(existing)}. Pass --force to replace it.`,
    )
  }

  mkdirSync(dirname(deploymentIdPath), { recursive: true })
  writeFileSync(deploymentIdPath, `${id}\n`)
  return id
}

export function resolveDeploymentId(): string {
  const existing = readDeploymentId()
  if (existing !== undefined) return existing
  throw new Error(
    "No deployment ID is configured. Run `bun infra set-deployment-id <id>`.",
  )
}

export function resolveDeploymentStage(): string {
  return deploymentStage(resolveDeploymentId(), process.env.USER ?? "unknown")
}
