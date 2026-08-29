import {
  createSessionApiClient as createRpcClient,
  type ApiClient as RpcClient,
} from "@worker/src/api-client"
import { apiFetch } from "./request"

type RpcMethod = (...args: never[]) => Promise<unknown>
type RpcResponse<T extends RpcMethod> = Awaited<ReturnType<T>>

export type Booking = RpcResponse<RpcClient["listBookings"]>[number]
export type Worker = RpcResponse<RpcClient["listWorkers"]>[number]
export type Customer = RpcResponse<RpcClient["listCustomers"]>[number]
export type ContactMethodSummary = RpcResponse<
  RpcClient["listContactMethods"]
>[number]
export type Message = RpcResponse<RpcClient["listMessages"]>[number]
export type Workflow = RpcResponse<RpcClient["listWorkflows"]>[number]
export type LlmTask = RpcResponse<RpcClient["listAllLlmTasks"]>[number]
export type MessageResponse = RpcResponse<
  RpcClient["listMessageResponses"]
>[number]
export type ResponseDraft = RpcResponse<RpcClient["getResponseDraft"]>
export type Configuration = RpcResponse<RpcClient["getConfiguration"]>
export type LanguageModel = RpcResponse<RpcClient["listLanguageModels"]>[number]
export type CatalogJob = RpcResponse<RpcClient["listJobCatalog"]>[number]
export type GoogleCalendarStatus = RpcResponse<
  RpcClient["getGoogleCalendarStatus"]
>

export function createSessionApiClient(
  baseUrl = window.location.origin,
): RpcClient {
  if (typeof baseUrl !== "string" || baseUrl === "") {
    throw new Error("Origin is unavailable")
  }
  return createRpcClient(baseUrl.replace(/\/$/, ""), {
    fetch: apiFetch,
    init: { credentials: "include" },
  })
}

export type ApiClient = ReturnType<typeof createSessionApiClient>
