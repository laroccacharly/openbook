const deploymentIdPattern = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/

export function validateDeploymentId(value: string): string {
  const id = value.trim()
  if (!deploymentIdPattern.test(id)) {
    throw new Error(
      "Deployment ID must be 1-32 characters using lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.",
    )
  }
  return id
}

const MAIN_DEPLOYMENT_ID = "main"

export function deploymentStage(id: string, user: string = "unknown"): string {
  if (id === MAIN_DEPLOYMENT_ID) {
    return `dev_${user}`
  }
  return `dev_${id}`
}
