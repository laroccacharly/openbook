/** Secrets required for every Book deployment. */
export const DEPLOYMENT_SECRET_NAMES = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "BOOK_API_KEY",
  "ADMIN_PASSWORD",
  "BETTER_AUTH_SECRET",
  "BOOK_GOOGLE_OAUTH_CLIENT_ID",
  "BOOK_GOOGLE_OAUTH_CLIENT_SECRET",
  "OPENROUTER_API_KEY",
  "GOOGLE_MAPS_API_KEY",
  "STRIPE_TEST_SECRET_KEY",
  "BOOK_STRIPE_TEST_WEBHOOK_SECRET",
] as const

/** SMS channel secrets (Twilio + local CLI helpers). */
export const SMS_SECRET_NAMES = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_API_KEY",
  "TWILIO_API_SECRET",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "USER_PHONE_NUMBER",
] as const

/** Email channel secrets used by local CLI helpers. */
export const EMAIL_SECRET_NAMES = ["USER_EMAIL"] as const

export const SECRET_NAMES = [
  ...DEPLOYMENT_SECRET_NAMES,
  ...SMS_SECRET_NAMES,
  ...EMAIL_SECRET_NAMES,
] as const

export type SecretName = (typeof SECRET_NAMES)[number]
