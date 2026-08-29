import {
  hashKey,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { authClient } from "./client"
import { changeWorkerPassword, getWorkerSession } from "./requests"

export const WORKER_SESSION_QUERY_KEY = ["worker", "session"] as const
const WORKER_SESSION_QUERY_HASH = hashKey(WORKER_SESSION_QUERY_KEY)

export function useWorkerSession() {
  const query = useQuery({
    queryKey: WORKER_SESSION_QUERY_KEY,
    queryFn: getWorkerSession,
    retry: false,
  })
  return {
    ...query,
    status: query.isPending
      ? ("loading" as const)
      : query.data?.authenticated === true
        ? ("authenticated" as const)
        : ("anonymous" as const),
  }
}

export function useWorkerSignIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const result = await authClient.signIn.email(input)
      if (result.error !== null) {
        throw new Error(result.error.message ?? "Unable to sign in")
      }
      return result.data
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: WORKER_SESSION_QUERY_KEY }),
  })
}

export function useWorkerChangePassword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: changeWorkerPassword,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: WORKER_SESSION_QUERY_KEY }),
  })
}

export function useWorkerSignOut() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const result = await authClient.signOut()
      if (result.error !== null) {
        throw new Error(result.error.message ?? "Unable to sign out")
      }
    },
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: WORKER_SESSION_QUERY_KEY })
      queryClient.setQueryData(WORKER_SESSION_QUERY_KEY, {
        authenticated: false,
        mustChangePassword: false,
      })
      queryClient.removeQueries({
        predicate: ({ queryHash }) => queryHash !== WORKER_SESSION_QUERY_HASH,
      })
    },
  })
}
