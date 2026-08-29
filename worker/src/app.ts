import { Hono } from "hono"
import type { WorkerEnv } from "@infra/alchemy.run"
import { API_PREFIX, paths } from "@infra/routes"
import { requireApiKeyOrAdminSession } from "./auth/api-key"
import { adminRouter } from "./routers/admin"
import { authRouter } from "./routers/auth"
import { workerRouter } from "./routers/worker"
import { bookingRouter } from "./routers/booking"
import { configurationRouter } from "./routers/configuration"
import { customersRouter } from "./routers/customers"
import { conversationsRouter } from "./routers/conversations"
import { contactMethodsRouter } from "./routers/contact-methods"
import {
  googleOAuthCallbackRouter,
  googleOAuthRouter,
} from "./routers/google-oauth"
import { llmAssertRouter } from "./routers/llm-assert"
import { languageModelsRouter } from "./routers/language-models"
import { messageResponsesRouter } from "./routers/message-responses"
import { messagesRouter } from "./routers/messages"
import { promptRouter } from "./routers/prompt"
import { responseDraftsRouter } from "./routers/response-drafts"
import { workersRouter } from "./routers/workers"
import { workflowsRouter } from "./routers/workflows"
import { publicBookingRouter } from "./routers/public-booking"
import { globalRateLimit } from "./rate-limit"
import { emailChannelRouter } from "./channels/email"
import { smsChannelRouter, smsWebhookRouter } from "./channels/sms"
import { stripePaymentRouter, stripeWebhookRouter } from "./routers/stripe"
import { chatRouter } from "./routers/chat"
import { jobCatalogRouter } from "./routers/job-catalog"

const api = new Hono<{ Bindings: WorkerEnv }>()
  .use("*", requireApiKeyOrAdminSession)
  .route("/", configurationRouter)
  .route("/", emailChannelRouter)
  .route("/", smsChannelRouter)
  .route("/", googleOAuthRouter)
  .route("/", bookingRouter)
  .route("/", workflowsRouter)
  .route("/", customersRouter)
  .route("/", conversationsRouter)
  .route("/", contactMethodsRouter)
  .route("/", workersRouter)
  .route("/", languageModelsRouter)
  .route("/", llmAssertRouter)
  .route("/", messageResponsesRouter)
  .route("/", responseDraftsRouter)
  .route("/", messagesRouter)
  .route("/", promptRouter)
  .route("/", chatRouter)
  .route("/", jobCatalogRouter)

const app = new Hono<{ Bindings: WorkerEnv }>()
  // Provider-authenticated webhooks are intentionally outside the generic
  // IP limiter because Twilio delivery traffic may share source addresses.
  .route("/", smsWebhookRouter)
  .route("/", stripeWebhookRouter)
  .use("*", globalRateLimit)
  .route("/", publicBookingRouter)
  .route("/", stripePaymentRouter)
  .route(paths.admin.root, adminRouter)
  .route("/", googleOAuthCallbackRouter)
  .route(`${API_PREFIX}/auth`, authRouter)
  .route(`${API_PREFIX}/worker`, workerRouter)
  .route(API_PREFIX, api)
  .notFound((c) => c.json({ error: "not_found" }, 404))

export type ApiType = typeof app
export default app
