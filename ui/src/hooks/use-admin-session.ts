import { useMemo } from "react"
import {
  hashKey,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { createAdminClient, type AdminSession } from "../lib/api/admin-client"

const ADMIN_SESSION_QUERY_KEY = ["admin", "session"] as const
const ADMIN_SESSION_QUERY_HASH = hashKey(ADMIN_SESSION_QUERY_KEY)

export type AdminSessionStatus = "loading" | "authenticated" | "anonymous"

function adminSessionStatus(
  isPending: boolean,
  session: AdminSession | undefined,
): AdminSessionStatus {
  if (isPending) {
    return "loading"
  }
  if (session?.authenticated === true) {
    return "authenticated"
  }
  return "anonymous"
}

export function useAdminSession() {
  const client = useMemo(() => createAdminClient(), [])
  const query = useQuery({
    queryKey: ADMIN_SESSION_QUERY_KEY,
    queryFn: client.adminSession,
    retry: false,
  })

  return {
    ...query,
    session: adminSessionStatus(query.isPending, query.data),
  }
}

export function useAdminLogin() {
  const client = useMemo(() => createAdminClient(), [])
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: client.adminLogin,
    onSuccess: (session) => {
      queryClient.setQueryData(ADMIN_SESSION_QUERY_KEY, session)
    },
  })
}

export function useAdminLogout() {
  const client = useMemo(() => createAdminClient(), [])
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: client.adminLogout,
    onSuccess: async (session) => {
      await queryClient.cancelQueries({ queryKey: ADMIN_SESSION_QUERY_KEY })
      queryClient.setQueryData(ADMIN_SESSION_QUERY_KEY, session)
      queryClient.removeQueries({
        predicate: ({ queryHash }) => queryHash !== ADMIN_SESSION_QUERY_HASH,
      })
    },
  })
}
