const EMAIL_LOCAL_PART = "agent"

/** Build the Book email address for the configured Cloudflare zone. */
export function emailAddressForDomain(domain: string): string {
  return `${EMAIL_LOCAL_PART}@${domain}`
}
