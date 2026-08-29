import { apiFetch } from "./request"
import { paths } from "@infra/routes"

export type AdminSession = {
  authenticated: boolean
}

async function parseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

export function createAdminClient(baseUrl = window.location.origin): {
  adminSession: () => Promise<AdminSession>
  adminLogin: (password: string) => Promise<AdminSession>
  adminLogout: () => Promise<AdminSession>
} {
  if (typeof baseUrl !== "string" || baseUrl === "") {
    throw new Error("Origin is unavailable")
  }

  const origin = baseUrl.replace(/\/$/, "")
  const request = (path: string, init?: RequestInit) =>
    apiFetch(`${origin}${paths.admin.root}${path}`, {
      ...init,
      credentials: "include",
    })

  return {
    adminSession: async () =>
      parseJson<AdminSession>(await request("/session")),
    adminLogin: async (password) =>
      parseJson<AdminSession>(
        await request("/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        }),
      ),
    adminLogout: async () =>
      parseJson<AdminSession>(await request("/logout", { method: "POST" })),
  }
}
