import type { D1Database } from "@cloudflare/workers-types"
import type { WorkerEnv } from "@infra/alchemy.run"
import type { LanguageModel } from "ai"
import type { AddressGeocoder } from "../maps/google-geocoder"
import type { ServiceArea } from "../maps/service-area"
import { type Clock, systemClock } from "../time"
import type { ContactMethodKey } from "../types/contact-method"
import type { ConversationTurn } from "../types/conversation"
import type { Message } from "../types/message"
import type { ResponseDraft } from "../types/response-draft"
import { getContactMethodKey } from "../db/conversations"
import { getResponseDraftForConversation } from "../db/response-drafts"
import { getJobCatalog } from "../db/job-catalog"
import type { CatalogJob } from "../types/job-catalog"
import { loadConversation } from "./conversation"

export type SetMessageWorkflowStage = (stage: string) => Promise<void>

const ignoreStage: SetMessageWorkflowStage = () => Promise.resolve()

export type CreatePipelineContextInput = {
  message: Message
  languageModelId: string
  languageModel: LanguageModel
  masterSystemPrompt: string
  timezone: string
  addressGeocoder: AddressGeocoder
  serviceArea: ServiceArea
  autoApproveDrafts: boolean
  clock?: Clock
  setStage?: SetMessageWorkflowStage
  messageDeliveryWorkflow: WorkerEnv["MESSAGE_DELIVERY_WORKFLOW"]
}

export type PipelineContext = {
  db: D1Database
  message: Message
  messageId: number
  conversationId: number
  contactMethodKey: ContactMethodKey
  languageModelId: string
  languageModel: LanguageModel
  clock: Clock
  masterSystemPrompt: string
  timezone: string
  addressGeocoder: AddressGeocoder
  serviceArea: ServiceArea
  autoApproveDrafts: boolean
  conversation: ConversationTurn[]
  pendingDraft: ResponseDraft | null
  jobCatalog: CatalogJob[]
  setStage: SetMessageWorkflowStage
  messageDeliveryWorkflow: WorkerEnv["MESSAGE_DELIVERY_WORKFLOW"]
}

export async function createPipelineContext(
  db: D1Database,
  input: CreatePipelineContextInput,
): Promise<PipelineContext> {
  const [conversation, pendingDraft, contactMethodKey, jobCatalog] =
    await Promise.all([
      loadConversation(db, input.message),
      getResponseDraftForConversation(db, input.message.conversationId),
      getContactMethodKey(db, input.message.conversationId),
      getJobCatalog(db),
    ])
  return {
    db,
    message: input.message,
    messageId: input.message.id,
    conversationId: input.message.conversationId,
    contactMethodKey,
    languageModelId: input.languageModelId,
    languageModel: input.languageModel,
    clock: input.clock ?? systemClock,
    masterSystemPrompt: input.masterSystemPrompt,
    timezone: input.timezone,
    addressGeocoder: input.addressGeocoder,
    serviceArea: input.serviceArea,
    autoApproveDrafts: input.autoApproveDrafts,
    conversation,
    pendingDraft,
    jobCatalog,
    setStage: input.setStage ?? ignoreStage,
    messageDeliveryWorkflow: input.messageDeliveryWorkflow,
  }
}
