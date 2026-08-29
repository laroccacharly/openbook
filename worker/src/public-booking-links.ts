import { z } from "zod"

export const PublicBookingIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16}$/)

export function createPublicBookingId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return PublicBookingIdSchema.parse(
    btoa(binary).replaceAll("+", "-").replaceAll("/", "_"),
  )
}

export function publicBookingIdFromShortToken(token: string): string | null {
  const parsed = PublicBookingIdSchema.safeParse(token)
  return parsed.success ? parsed.data : null
}

export function publicBookingShortUrl(
  publicOrigin: string,
  publicId: string,
): string {
  return new URL(
    `/b/${PublicBookingIdSchema.parse(publicId)}`,
    publicOrigin,
  ).toString()
}
