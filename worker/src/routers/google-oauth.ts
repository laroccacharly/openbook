import { Hono } from "hono"
import type { WorkerEnv } from "@infra/alchemy.run"
import {
  GOOGLE_OAUTH_CALLBACK_PATH,
  paths,
  spaHashRedirect,
} from "@infra/routes"
import {
  completeGoogleOAuth,
  createGoogleConnectUrl,
  getGooglePrimaryCalendarInfo,
} from "../auth/google-oauth"
import { getGoogleCalendarConnection } from "../db/google-connections"

function callbackUri(requestUrl: string): string {
  return new URL(GOOGLE_OAUTH_CALLBACK_PATH, requestUrl).toString()
}

export const googleOAuthCallbackRouter = new Hono<{
  Bindings: WorkerEnv
}>().get(GOOGLE_OAUTH_CALLBACK_PATH, async (c) => {
  const url = new URL(c.req.url)
  const error = url.searchParams.get("error")
  if (error) {
    return c.text(`Google OAuth error: ${error}`, 400)
  }

  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  if (!code || !state) {
    return c.text("Missing OAuth code or state", 400)
  }

  const result = await completeGoogleOAuth(c.env.DB, {
    code,
    state,
    clientId: c.env.BOOK_GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: c.env.BOOK_GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: callbackUri(c.req.url),
  })
  if (!result.ok) {
    return c.redirect(
      spaHashRedirect(paths.admin.home, {
        google: "error",
        message: result.error,
      }),
    )
  }

  return c.redirect(spaHashRedirect(paths.admin.home, { google: "connected" }))
})

export const googleOAuthRouter = new Hono<{ Bindings: WorkerEnv }>()
  .get("/oauth/google/connect", async (c) => {
    const url = await createGoogleConnectUrl(
      c.env.DB,
      c.env.BOOK_GOOGLE_OAUTH_CLIENT_ID,
      callbackUri(c.req.url),
    )
    return c.json({ url })
  })
  .get("/oauth/google/status", async (c) => {
    const connection = await getGoogleCalendarConnection(c.env.DB)
    if (connection === null) {
      return c.json({ connected: false })
    }
    return c.json({
      connected: true,
      email: connection.email,
      connectedAt: connection.connectedAt,
    })
  })
  .get("/oauth/google/calendar-info", async (c) => {
    const result = await getGooglePrimaryCalendarInfo(
      c.env.DB,
      c.env.BOOK_GOOGLE_OAUTH_CLIENT_ID,
      c.env.BOOK_GOOGLE_OAUTH_CLIENT_SECRET,
    )
    if (!result.ok) {
      return c.json(
        { error: result.error },
        result.reason === "not_connected" ? 409 : 502,
      )
    }
    return c.json(result.calendar)
  })
