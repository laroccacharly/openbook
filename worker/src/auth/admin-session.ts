import type { Context } from "hono"
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie"
import type { WorkerEnv } from "@infra/alchemy.run"

const ADMIN_COOKIE = "__Host-book-admin"
const ADMIN_SESSION_SECONDS = 8 * 60 * 60
const SIGNING_KEY_PURPOSE = "book:admin-session:v1"
const encoder = new TextEncoder()
const subtle = crypto.subtle as SubtleCrypto & {
  timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean
}

type AdminContext = Context<{ Bindings: WorkerEnv }>

function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encoder.encode(value))
}

async function signingKey(env: WorkerEnv): Promise<ArrayBuffer> {
  return sha256(
    `${SIGNING_KEY_PURPOSE}\0${env.BOOK_API_KEY}\0${env.ADMIN_PASSWORD}`,
  )
}

export async function adminPasswordMatches(
  presentedPassword: string,
  configuredPassword: string,
): Promise<boolean> {
  const [presentedDigest, configuredDigest] = await Promise.all([
    sha256(presentedPassword),
    sha256(configuredPassword),
  ])
  return subtle.timingSafeEqual(presentedDigest, configuredDigest)
}

export async function hasAdminSession(c: AdminContext): Promise<boolean> {
  const expiresAt = await getSignedCookie(
    c,
    await signingKey(c.env),
    ADMIN_COOKIE,
  )
  if (typeof expiresAt !== "string") {
    return false
  }

  const expirySeconds = Number(expiresAt)
  return (
    Number.isSafeInteger(expirySeconds) &&
    expirySeconds > Math.floor(Date.now() / 1000)
  )
}

export async function createAdminSession(c: AdminContext): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS
  await setSignedCookie(
    c,
    ADMIN_COOKIE,
    String(expiresAt),
    await signingKey(c.env),
    {
      httpOnly: true,
      maxAge: ADMIN_SESSION_SECONDS,
      path: "/",
      sameSite: "Strict",
      secure: true,
    },
  )
}

export function clearAdminSession(c: AdminContext): void {
  deleteCookie(c, ADMIN_COOKIE, {
    path: "/",
    secure: true,
  })
}
