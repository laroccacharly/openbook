export const API_PREFIX = "/api" as const

export const GOOGLE_OAUTH_CALLBACK_PATH = "/oauth/google/callback" as const

const adminHome = "/admin/conversation" as const

export const paths = {
  root: "/",
  worker: {
    root: "/worker",
    signIn: "/worker/sign-in",
    changePassword: "/worker/change-password",
    home: "/worker/dashboard",
    dashboard: "/worker/dashboard",
    bookings: "/worker/bookings",
  },
  admin: {
    root: "/admin",
    login: "/admin/login",
    /** Default authenticated landing page. Currently Conversation. */
    home: adminHome,
    conversation: adminHome,
    bookings: "/admin/bookings",
    settings: "/admin/settings",
    workers: "/admin/workers",
    logs: "/admin/logs",
    chat: "/admin/chat",
    jobCatalog: "/admin/job-catalog",
  },
} as const

export const WORKER_FIRST_PATHS = [
  API_PREFIX,
  `${API_PREFIX}/*`,
  "/webhooks",
  "/webhooks/*",
  paths.admin.root,
  `${paths.admin.root}/*`,
  paths.worker.root,
  `${paths.worker.root}/*`,
  GOOGLE_OAUTH_CALLBACK_PATH,
  "/b/*",
  "/bookings/*",
  "/stripe/webhook",
] as const

export function spaHashRedirect(
  path: string,
  query?: Record<string, string>,
): string {
  const search =
    query === undefined ? "" : `?${new URLSearchParams(query).toString()}`
  return `/#${path}${search}`
}
