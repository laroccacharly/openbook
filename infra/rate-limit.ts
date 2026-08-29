export const GLOBAL_RATE_LIMIT = {
  namespaceId: "26072701",
  limit: 1_200,
  period: 60,
} as const

export const ADMIN_LOGIN_RATE_LIMIT = {
  namespaceId: "26072702",
  limit: 5,
  period: 60,
} as const
