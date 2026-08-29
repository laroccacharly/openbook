import type { CloudflareZone } from "./cloudflare-zone"
import { resolveCloudflareZone } from "./cloudflare-zone"
import { deploymentStage } from "./deployment"
import { resolveDeploymentId } from "./deployment-id"

export interface DeploymentContext {
  deploymentId: string
  stage: string
  zone: CloudflareZone
  domain: string
  origin: string
}

export function deploymentContext(
  deploymentId: string,
  zone: CloudflareZone,
  user: string = "unknown",
): DeploymentContext {
  const domain =
    deploymentId === "main"
      ? `book.${zone.domain}`
      : `${deploymentId}.book.${zone.domain}`
  return {
    deploymentId,
    stage: deploymentStage(deploymentId, user),
    zone,
    domain,
    origin: `https://${domain}`,
  }
}

export function resolveDeploymentContext(
  deploymentId: string = resolveDeploymentId(),
): DeploymentContext {
  return deploymentContext(
    deploymentId,
    resolveCloudflareZone(),
    process.env.USER ?? "unknown",
  )
}

export function resolveDeploymentOrigin(): string {
  return resolveDeploymentContext().origin
}
