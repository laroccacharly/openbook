import { hc, parseResponse, type ClientRequestOptions } from "hono/client"
import type { ApiType } from "./app"
import type {
  CreateBookingInput,
  CreateWorkerTimeOffBodyInput,
  Customer,
  ConversationTimelineTurn,
  ContactMethodKey,
  ContactMethodSummary,
  FromMessageInput,
  LlmAssertInput,
  MessageInput,
  MessageResponse,
  ResponseDraft,
} from "./types"
import type { ConfigurationPatch } from "./db/configuration"
import type { ChatUIMessage } from "./chat/tools"
import type { SendEmailInput, SendEmailResult } from "./channels/email/types"
import type { CatalogJobInput, CatalogJobPatch } from "./types/job-catalog"

export type ApiClientOptions = ClientRequestOptions & {
  apiKey: string
}

export type ApiMessageResponse = Omit<MessageResponse, "proposedDatetime"> & {
  proposedDatetime: string | null
}

export type ApiResponseDraft = Omit<ResponseDraft, "proposedDatetime"> & {
  proposedDatetime: string | null
}

const createApiClientMethods = (
  baseUrl: string,
  options: ClientRequestOptions & { apiKey?: string },
) => {
  const { apiKey, headers, ...rest } = options
  const client = hc<ApiType>(baseUrl, {
    ...rest,
    headers: {
      ...(apiKey === undefined ? {} : { Authorization: `Bearer ${apiKey}` }),
      ...(headers as Record<string, string> | undefined),
    },
  })
  const api = client.api

  return {
    sendEmail: async (input: SendEmailInput): Promise<SendEmailResult> =>
      (await parseResponse(
        api.email.send.$post({ json: input }),
      )) as SendEmailResult,
    sendPrompt: (input: MessageInput) =>
      parseResponse(api.prompt.$post({ json: input })),
    generateBookingDescription: () =>
      parseResponse(api.prompt["booking-description"].$post()),
    generateCustomerEmail: () =>
      parseResponse(api.prompt["customer-email"].$post()),
    getConfiguration: () => parseResponse(api.config.$get()),
    getAdminChat: async (): Promise<{ messages: ChatUIMessage[] }> =>
      (await parseResponse(api.chat.$get())) as { messages: ChatUIMessage[] },
    resetAdminChat: async (): Promise<{ messages: ChatUIMessage[] }> =>
      (await parseResponse(api.chat.$delete())) as {
        messages: ChatUIMessage[]
      },
    getSmsChannel: () => parseResponse(api.channels.sms.$get()),
    listLanguageModels: () => parseResponse(api["language-models"].$get()),
    patchConfiguration: (input: ConfigurationPatch) =>
      parseResponse(api.config.$patch({ json: input })),
    listBookings: () => parseResponse(api.bookings.$get()),
    listJobCatalog: () => parseResponse(api["job-catalog"].$get()),
    getCatalogJob: (id: number) =>
      parseResponse(
        api["job-catalog"][":id"].$get({ param: { id: String(id) } }),
      ),
    createCatalogJob: (input: CatalogJobInput) =>
      parseResponse(api["job-catalog"].$post({ json: input })),
    updateCatalogJob: (id: number, input: CatalogJobPatch) =>
      parseResponse(
        api["job-catalog"][":id"].$patch({
          param: { id: String(id) },
          json: input,
        }),
      ),
    deleteCatalogJob: (id: number) =>
      parseResponse(
        api["job-catalog"][":id"].$delete({
          param: { id: String(id) },
        }),
      ),
    listMessages: () => parseResponse(api.messages.$get()),
    listWorkflows: () => parseResponse(api.workflows.$get()),
    getWorkflow: (recordName: string, recordId: number) =>
      parseResponse(
        api.workflows[":recordName"][":recordId"].$get({
          param: { recordName, recordId: String(recordId) },
        }),
      ),
    retryWorkflow: (recordName: string, recordId: number) =>
      parseResponse(
        api.workflows[":recordName"][":recordId"].retry.$post({
          param: { recordName, recordId: String(recordId) },
        }),
      ),
    getBooking: (id: number) =>
      parseResponse(api.bookings[":id"].$get({ param: { id: String(id) } })),
    enableBalanceDue: (id: number, input: { finalPrice: number }) =>
      parseResponse(
        api.bookings[":id"]["balance-due"].$post({
          param: { id: String(id) },
          json: input,
        }),
      ),
    listWorkers: () => parseResponse(api.workers.$get()),
    createFullTimeWorker: (input: { name: string }) =>
      parseResponse(api.workers["full-time"].$post({ json: input })),
    createWorkerAccount: (workerId: number, input: { email: string }) =>
      parseResponse(
        api.workers[":id"].account.$post({
          param: { id: String(workerId) },
          json: input,
        }),
      ),
    createWorkerDayOff: (
      workerId: number,
      input: CreateWorkerTimeOffBodyInput,
    ) =>
      parseResponse(
        api.workers[":id"].timeoff.$post({
          param: { id: String(workerId) },
          json: input,
        }),
      ),
    ingestCustomerMessage: (input: FromMessageInput) =>
      parseResponse(api.messages.inbound.$post({ json: input })),
    listCustomers: async (): Promise<Customer[]> =>
      (await parseResponse(api.customers.$get())) as Customer[],
    deleteCustomer: async (id: number): Promise<Customer> =>
      (await parseResponse(
        api.customers[":customerId"].$delete({
          param: { customerId: String(id) },
        }),
      )) as Customer,
    listContactMethods: async (): Promise<ContactMethodSummary[]> =>
      (await parseResponse(
        api["contact-methods"].$get(),
      )) as ContactMethodSummary[],
    createContactMethod: async (
      input: ContactMethodKey,
    ): Promise<ContactMethodSummary> =>
      (await parseResponse(
        api["contact-methods"].$post({ json: input }),
      )) as ContactMethodSummary,
    getCustomerByEmail: async (email: string): Promise<Customer> =>
      (await parseResponse(
        api.customers.$get({ query: { email } }),
      )) as Customer,
    getConversation: async (
      conversationId: number,
    ): Promise<ConversationTimelineTurn[]> =>
      (await parseResponse(
        api.conversations[":conversationId"].$get({
          param: { conversationId: String(conversationId) },
        }),
      )) as ConversationTimelineTurn[],
    listCustomerBookings: (customerId: number) =>
      parseResponse(
        api.customers[":customerId"].bookings.$get({
          param: { customerId: String(customerId) },
        }),
      ),
    listLlmTasks: (messageId: number) =>
      parseResponse(
        api.llm_tasks.$get({ query: { message_id: String(messageId) } }),
      ),
    listAllLlmTasks: () => parseResponse(api.llm_tasks.$get()),
    listMessageResponses: async (): Promise<ApiMessageResponse[]> =>
      (await parseResponse(
        api.message_responses.$get(),
      )) as ApiMessageResponse[],
    getMessageResponse: async (
      messageId: number,
    ): Promise<ApiMessageResponse> =>
      (await parseResponse(
        api.message_responses.$get({
          query: { message_id: String(messageId) },
        }),
      )) as ApiMessageResponse,
    getResponseDraft: async (messageId: number): Promise<ApiResponseDraft> =>
      (await parseResponse(
        api.response_drafts.$get({
          query: { message_id: String(messageId) },
        }),
      )) as ApiResponseDraft,
    updateResponseDraftBody: async (
      draftId: number,
      body: string,
      revision: number,
    ): Promise<ApiResponseDraft> =>
      (await parseResponse(
        api.response_drafts[":draftId"].edit.$post({
          param: { draftId: String(draftId) },
          json: { body, revision },
        }),
      )) as ApiResponseDraft,
    approveResponseDraft: async (
      draftId: number,
      revision: number,
    ): Promise<ApiMessageResponse> =>
      (await parseResponse(
        api.response_drafts[":draftId"].approve.$post({
          param: { draftId: String(draftId) },
          json: { revision },
        }),
      )) as ApiMessageResponse,
    llmAssert: (input: LlmAssertInput) =>
      parseResponse(api["llm-assert"].$post({ json: input })),
    createBooking: (input: CreateBookingInput) =>
      parseResponse(api.bookings.$post({ json: input })),
    deleteBooking: (id: number) =>
      parseResponse(api.bookings[":id"].$delete({ param: { id: String(id) } })),
    deleteWorker: (id: number) =>
      parseResponse(api.workers[":id"].$delete({ param: { id: String(id) } })),
    getGoogleCalendarSync: (id: number) =>
      parseResponse(
        api.bookings[":id"]["google-calendar"].$get({
          param: { id: String(id) },
        }),
      ),
    retryGoogleCalendarSync: (id: number) =>
      parseResponse(
        api.bookings[":id"]["google-calendar"].retry.$post({
          param: { id: String(id) },
        }),
      ),
    retryGoogleCalendarDeletion: (id: number) =>
      parseResponse(
        api.bookings[":id"]["google-calendar"]["delete-retry"].$post({
          param: { id: String(id) },
        }),
      ),
    connectGoogleCalendar: () => parseResponse(api.oauth.google.connect.$get()),
    getGoogleCalendarStatus: () =>
      parseResponse(api.oauth.google.status.$get()),
    getGoogleCalendarInfo: () =>
      parseResponse(api.oauth.google["calendar-info"].$get()),
  }
}

export type ApiClient = ReturnType<typeof createApiClientMethods>
export type ApiBooking = Awaited<ReturnType<ApiClient["listBookings"]>>[number]

export const createApiClient = (
  baseUrl: string,
  options: ApiClientOptions,
): ApiClient => createApiClientMethods(baseUrl, options)

export const createSessionApiClient = (
  baseUrl: string,
  options: ClientRequestOptions = {},
): ApiClient => createApiClientMethods(baseUrl, options)
