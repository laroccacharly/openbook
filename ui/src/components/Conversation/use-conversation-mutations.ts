import { useMutation, type QueryClient } from "@tanstack/react-query"
import type { ApiClient, ContactMethodSummary } from "../../lib/api/client"
import { generateBookingDescription } from "../../lib/booking-description"
import {
  contactMethodsQueryKey,
  customerBookingsQueryKey,
} from "./conversation-query-keys"

type ConversationMutationsInput = {
  client: ApiClient
  queryClient: QueryClient
  selectedContactMethod: ContactMethodSummary | undefined
  onContactMethodCreated: (contactMethodId: number) => void
  onEditSaved: () => void
  onDraftApproved: () => void
  onDescriptionGenerated: (description: string) => void
}

export function useConversationMutations(input: ConversationMutationsInput) {
  const {
    client,
    queryClient,
    selectedContactMethod,
    onContactMethodCreated,
    onEditSaved,
    onDraftApproved,
    onDescriptionGenerated,
  } = input

  async function invalidateSelectedContactMethod() {
    if (selectedContactMethod === undefined) {
      return
    }
    const invalidations = [
      queryClient.invalidateQueries({ queryKey: contactMethodsQueryKey }),
      queryClient.invalidateQueries({ queryKey: ["conversation"] }),
    ]
    if (selectedContactMethod.customerId !== null) {
      invalidations.push(
        queryClient.invalidateQueries({
          queryKey: customerBookingsQueryKey(selectedContactMethod.customerId),
        }),
      )
    }
    await Promise.all(invalidations)
  }

  const createContactMethod = useMutation({
    mutationFn: (address: string) =>
      client.createContactMethod({ channel: "email", address }),
    onSuccess: async (contactMethod) => {
      onContactMethodCreated(contactMethod.id)
      await queryClient.invalidateQueries({ queryKey: contactMethodsQueryKey })
    },
  })

  const generateDescription = useMutation({
    mutationFn: () => generateBookingDescription(client),
    onSuccess: onDescriptionGenerated,
  })

  const sendMessage = useMutation({
    mutationFn: (messageInput: {
      message: string
      channel: "email" | "sms"
      address: string
      externalId: string
    }) =>
      client.ingestCustomerMessage({
        message: messageInput.message,
        channel: messageInput.channel,
        address: messageInput.address,
        externalId: messageInput.externalId,
      }),
    onSuccess: async () => {
      await invalidateSelectedContactMethod()
    },
  })

  const saveEdit = useMutation({
    mutationFn: (editInput: {
      draftId: number
      body: string
      revision: number
    }) =>
      client.updateResponseDraftBody(
        editInput.draftId,
        editInput.body,
        editInput.revision,
      ),
    onSuccess: async () => {
      onEditSaved()
      await invalidateSelectedContactMethod()
    },
  })

  const approve = useMutation({
    mutationFn: (approveInput: { draftId: number; revision: number }) =>
      client.approveResponseDraft(approveInput.draftId, approveInput.revision),
    onSuccess: async () => {
      onDraftApproved()
      await invalidateSelectedContactMethod()
    },
  })

  return {
    createContactMethod,
    generateDescription,
    sendMessage,
    saveEdit,
    approve,
  }
}
