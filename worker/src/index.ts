import type { WorkerEnv } from "@infra/alchemy.run"
import app, { type ApiType } from "./app"
import { handleInboundEmail } from "./channels/email"

const worker = {
  fetch: app.fetch,
  email: handleInboundEmail,
} satisfies ExportedHandler<WorkerEnv>

export default worker
export type { ApiType }
export { MessageWorkflow } from "./inbound-message-workflow/workflow"
export { MessageDeliveryWorkflow } from "./message-delivery/workflow"
