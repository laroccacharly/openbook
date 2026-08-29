export type WorkerSession =
  | { authenticated: false; mustChangePassword: false }
  | { authenticated: true; mustChangePassword: boolean }

export type WorkerMe = {
  email: string
  createdAt: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body !== undefined) headers.set("Content-Type", "application/json")
  const response = await fetch(`/api/worker${path}`, {
    ...init,
    credentials: "include",
    headers,
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: unknown
      error?: unknown
    } | null
    const message = body?.message ?? body?.error
    throw new Error(
      typeof message === "string" ? message : `HTTP ${response.status}`,
    )
  }
  return (await response.json()) as T
}

export async function getWorkerSession(): Promise<WorkerSession> {
  const response = await fetch("/api/worker/session", {
    credentials: "include",
  })
  if (response.status === 401) {
    return { authenticated: false, mustChangePassword: false }
  }
  if (!response.ok) {
    throw new Error(`Unable to check worker session (HTTP ${response.status})`)
  }
  return (await response.json()) as WorkerSession
}

export function getWorkerMe(): Promise<WorkerMe> {
  return request("/me")
}

export function getWorkerBookings() {
  return request<import("@/lib/api/client").Booking[]>("/bookings")
}

export function changeWorkerPassword(input: {
  currentPassword: string
  newPassword: string
}) {
  return request<{ changed: true }>("/change-password", {
    method: "POST",
    body: JSON.stringify(input),
  })
}
