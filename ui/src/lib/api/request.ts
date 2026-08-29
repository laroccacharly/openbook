function parseErrorMessage(status: number, body: string): string {
  if (body === "") {
    return `HTTP ${status}`
  }
  try {
    const parsed = JSON.parse(body) as {
      error?: unknown
      message?: unknown
    }
    const message = parsed.error ?? parsed.message
    if (typeof message === "string" && message !== "") {
      return message
    }
  } catch {
    // Fall through to raw body.
  }
  return body
}

export const apiFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init)
  if (!response.ok) {
    const body = await response.text()
    throw new Error(parseErrorMessage(response.status, body))
  }
  return response
}
