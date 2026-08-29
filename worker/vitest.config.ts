import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers"
import { defineConfig } from "vitest/config"
import {
  ADMIN_LOGIN_RATE_LIMIT,
  GLOBAL_RATE_LIMIT,
} from "../infra/rate-limit.ts"
import { TEST_BOOK_API_KEY } from "./tests/fixtures/api-key.ts"

const workerDirectory = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  cacheDir: resolve(workerDirectory, "../node_modules/.vite/worker"),
  resolve: {
    alias: {
      "@infra": resolve(workerDirectory, "../infra"),
      "@worker": workerDirectory,
    },
  },
  plugins: [
    {
      name: "silence-missing-sourcemap-warnings",
      configResolved(config) {
        const warnOnce = config.logger.warnOnce.bind(config.logger)
        config.logger.warnOnce = (msg, options) => {
          if (
            msg.includes("Sourcemap for") &&
            msg.includes("missing source files")
          ) {
            return
          }
          warnOnce(msg, options)
        }
      },
    },
    cloudflareTest(async () => ({
      main: resolve(workerDirectory, "src/index.ts"),
      miniflare: {
        compatibilityDate: "2026-07-26",
        d1Databases: ["DB"],
        assets: {
          directory: resolve(workerDirectory, "../ui/dist"),
          binding: "ASSETS",
        },
        bindings: {
          BOOK_API_KEY: TEST_BOOK_API_KEY,
          BOOK_EMAIL_ADDRESS: "agent@example.com",
          BOOK_PUBLIC_ORIGIN: "https://stage.book.test",
          ADMIN_PASSWORD: "test-admin-password",
          BETTER_AUTH_SECRET: "test-better-auth-secret-at-least-32-characters",
          BETTER_AUTH_URL: "https://stage.book.test",
          BOOK_GOOGLE_OAUTH_CLIENT_ID: "test-google-oauth-client-id",
          BOOK_GOOGLE_OAUTH_CLIENT_SECRET: "test-google-oauth-client-secret",
          OPENROUTER_API_KEY: "test-openrouter-api-key",
          GOOGLE_MAPS_API_KEY: "test-google-maps-api-key",
          STRIPE_SECRET_KEY: "sk_test_book_unit_tests",
          STRIPE_WEBHOOK_SECRET: "whsec_book_unit_tests",
          TWILIO_ACCOUNT_SID: "ACtest",
          TWILIO_API_KEY: "SKtest",
          TWILIO_API_SECRET: "test-twilio-api-secret",
          TWILIO_AUTH_TOKEN: "test-twilio-auth-token",
          TWILIO_PHONE_NUMBER: "+15145550100",
          TEST_MIGRATIONS: await readD1Migrations(
            resolve(workerDirectory, "migrations"),
          ),
        },
        ratelimits: {
          GLOBAL_RATE_LIMITER: {
            namespace_id: GLOBAL_RATE_LIMIT.namespaceId,
            simple: {
              limit: GLOBAL_RATE_LIMIT.limit,
              period: GLOBAL_RATE_LIMIT.period,
            },
          },
          ADMIN_LOGIN_RATE_LIMITER: {
            namespace_id: ADMIN_LOGIN_RATE_LIMIT.namespaceId,
            simple: {
              limit: ADMIN_LOGIN_RATE_LIMIT.limit,
              period: ADMIN_LOGIN_RATE_LIMIT.period,
            },
          },
        },
        workflows: {
          MESSAGE_WORKFLOW: {
            name: "MessageWorkflow",
            className: "MessageWorkflow",
          },
          MESSAGE_DELIVERY_WORKFLOW: {
            name: "MESSAGE_DELIVERY_WORKFLOW",
            className: "MessageDeliveryWorkflow",
          },
        },
      },
    })),
  ],
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "istanbul",
      include: ["src/db/**", "src/scheduler/**"],
      reporter: ["text", "text-summary"],
      thresholds: {
        functions: 100,
      },
    },
  },
})
