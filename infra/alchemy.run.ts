import * as Alchemy from "alchemy"
import * as Command from "alchemy/Command"
import * as Cloudflare from "alchemy/Cloudflare"
import * as State from "alchemy/State"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import { cast } from "effect/Function"
import { ADMIN_LOGIN_RATE_LIMIT, GLOBAL_RATE_LIMIT } from "./rate-limit"
import { WORKER_FIRST_PATHS } from "./routes"
import { EmailBindings } from "./email/module"
import { SmsBindings } from "./sms/module"

const workerDir = "../worker"
const repoDir = ".."

/** Transport contract for MESSAGE_WORKFLOW.create({ params }). */
export interface MessageWorkflowParams {
  messageId: number
  languageModelId: string
  now?: string
}

export interface MessageDeliveryWorkflowParams {
  messageResponseId: number
}

export const Database = Cloudflare.D1.Database("Database", {
  primaryLocationHint: "enam",
  migrations: `${workerDir}/migrations`,
})

// Build from the repository root because the UI imports the Worker's typed API
// client; including cross-workspace inputs prevents Alchemy from reusing a stale build.
export const UiBuild = Command.Build("UiBuild", {
  cwd: repoDir,
  command: "bun run --cwd ui build",
  outdir: "ui/dist",
})

export const Worker = Effect.gen(function* () {
  const build = yield* UiBuild
  const deploymentDomain = yield* Config.string("BOOK_DEPLOYMENT_DOMAIN")
  const deploymentOrigin = yield* Config.string("BOOK_DEPLOYMENT_ORIGIN")
  const emailAddress = yield* Config.string("BOOK_EMAIL_ADDRESS")
  const emailBindings = yield* EmailBindings(emailAddress)
  const smsBindings = yield* SmsBindings

  return yield* Cloudflare.Worker("Worker", {
    main: `${workerDir}/src/index.ts`,
    assets: cast({
      directory: build.outdir,
      hash: build.hash.output,
      runWorkerFirst: [...WORKER_FIRST_PATHS],
      notFoundHandling: "single-page-application",
    }),
    compatibility: {
      date: "2026-07-26",
      flags: ["nodejs_compat"],
    },
    observability: {
      enabled: true,
      logs: {
        enabled: true,
        invocationLogs: true,
        headSamplingRate: 1,
        persist: true,
      },
    },
    placement: { region: "aws:ca-central-1" },
    domain: deploymentDomain,
    env: {
      DB: Database,
      AI: Cloudflare.Workers.AI(),
      MESSAGE_WORKFLOW: Cloudflare.Workflow<MessageWorkflowParams>(
        "MessageWorkflow",
        {
          className: "MessageWorkflow",
        },
      ),
      MESSAGE_DELIVERY_WORKFLOW:
        Cloudflare.Workflow<MessageDeliveryWorkflowParams>(
          "MessageDeliveryWorkflow",
          { className: "MessageDeliveryWorkflow" },
        ),
      GLOBAL_RATE_LIMITER: Cloudflare.RateLimit("GLOBAL_RATE_LIMITER", {
        namespaceId: GLOBAL_RATE_LIMIT.namespaceId,
        simple: {
          limit: GLOBAL_RATE_LIMIT.limit,
          period: GLOBAL_RATE_LIMIT.period,
        },
      }),
      ADMIN_LOGIN_RATE_LIMITER: Cloudflare.RateLimit(
        "ADMIN_LOGIN_RATE_LIMITER",
        {
          namespaceId: ADMIN_LOGIN_RATE_LIMIT.namespaceId,
          simple: {
            limit: ADMIN_LOGIN_RATE_LIMIT.limit,
            period: ADMIN_LOGIN_RATE_LIMIT.period,
          },
        },
      ),
      BOOK_API_KEY: Config.redacted("BOOK_API_KEY"),
      BOOK_EMAIL_ADDRESS: emailAddress,
      BOOK_PUBLIC_ORIGIN: deploymentOrigin,
      ADMIN_PASSWORD: Config.redacted("ADMIN_PASSWORD"),
      BETTER_AUTH_SECRET: Config.redacted("BETTER_AUTH_SECRET"),
      BETTER_AUTH_URL: deploymentOrigin,
      BOOK_GOOGLE_OAUTH_CLIENT_ID: Config.redacted(
        "BOOK_GOOGLE_OAUTH_CLIENT_ID",
      ),
      BOOK_GOOGLE_OAUTH_CLIENT_SECRET: Config.redacted(
        "BOOK_GOOGLE_OAUTH_CLIENT_SECRET",
      ),
      OPENROUTER_API_KEY: Config.redacted("OPENROUTER_API_KEY"),
      GOOGLE_MAPS_API_KEY: Config.redacted("GOOGLE_MAPS_API_KEY"),
      STRIPE_SECRET_KEY: Config.redacted("STRIPE_TEST_SECRET_KEY"),
      STRIPE_WEBHOOK_SECRET: Config.redacted("BOOK_STRIPE_TEST_WEBHOOK_SECRET"),
      ...emailBindings,
      ...smsBindings,
    },
  })
})

export type WorkerEnv = Cloudflare.InferEnv<typeof Worker>

export default Alchemy.Stack(
  "Book",
  {
    providers: Cloudflare.providers(),
    state: State.localState(),
  },
  Effect.gen(function* () {
    const database = yield* Database
    const worker = yield* Worker

    return {
      databaseName: database.databaseName,
      url: worker.url,
    }
  }),
)
