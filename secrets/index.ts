import {
  DEPLOYMENT_SECRET_NAMES,
  EMAIL_SECRET_NAMES,
  SECRET_NAMES,
  SMS_SECRET_NAMES,
  type SecretName,
} from "./catalog"

export {
  DEPLOYMENT_SECRET_NAMES,
  EMAIL_SECRET_NAMES,
  SECRET_NAMES,
  SMS_SECRET_NAMES,
  type SecretName,
}

const secretNames = new Set<string>(SECRET_NAMES)

export function isSecretName(name: string): name is SecretName {
  return secretNames.has(name)
}

function missingSecretMessage(name: SecretName): string {
  return `Missing required environment variable ${name}.`
}

export function requireEnv(name: SecretName): string {
  const value = process.env[name]
  if (value === undefined || value === "") {
    throw new Error(missingSecretMessage(name))
  }
  return value
}

export function requireSecrets<const Names extends readonly SecretName[]>(
  names: Names,
): { [Name in Names[number]]: string } {
  const resolved = {} as Record<SecretName, string>
  for (const name of names) resolved[name] = requireEnv(name)
  return resolved as { [Name in Names[number]]: string }
}

export function generateSecret(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "base64url",
  )
}
