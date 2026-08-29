/** Resolve the configured Twilio inbound number, or null when unset. */
export function resolveTwilioInboundPhoneNumber(env: {
  TWILIO_PHONE_NUMBER?: string
}): string | null {
  const value = env.TWILIO_PHONE_NUMBER
  if (typeof value !== "string" || value === "") {
    return null
  }
  return value
}
