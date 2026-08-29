import { betterAuth } from "better-auth"
import { admin } from "better-auth/plugins"

// Keep this Bun-only import dynamic so Worker/DOM typechecks do not merge
// Bun's global fetch definitions into the Cloudflare runtime program.
const bunSqliteModule: string = "bun:sqlite"
const { Database } = await import(bunSqliteModule)

export const auth = betterAuth({
  database: new Database(":memory:"),
  secret: "development-only-better-auth-schema-secret",
  baseURL: "http://localhost:8787",
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: false,
  },
  plugins: [admin()],
})
