export function requireAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD
  if (!password) {
    throw new Error("ADMIN_PASSWORD is required. Run via `bun run test ui`.")
  }
  return password
}
