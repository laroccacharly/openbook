export function firstErrorMessage(
  ...errors: readonly (Error | null | undefined)[]
): string | null {
  for (const error of errors) {
    if (error instanceof Error) {
      return error.message
    }
  }
  return null
}
