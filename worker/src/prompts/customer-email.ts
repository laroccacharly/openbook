export function buildCustomerEmailPrompt(): string {
  return (
    "Generate one creative but plausible personal email address for a fictional customer.\n" +
    "Use a realistic given name and surname in the local part, with a common free email domain.\n" +
    "Vary style occasionally (middle initial, nickname, or a digit) so repeats feel different.\n" +
    "Return only the email address, with no angle brackets, quotes, or explanation."
  )
}
