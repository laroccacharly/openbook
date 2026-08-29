import { useQuery } from "@tanstack/react-query"
import type { ApiClient } from "../../lib/api/client"
import { loadConversationTurns } from "../../lib/load-conversation-turns"
import {
  contactMethodsQueryKey,
  conversationQueryKey,
  customerBookingsQueryKey,
} from "./conversation-query-keys"
import { contactMethodSendTarget } from "./customer-contact"
import type { ContactMethodSummary } from "../../lib/api/client"

type UseConversationDataInput = {
  client: ApiClient
  selectedContactMethodId: number | null
}

export function useConversationData({
  client,
  selectedContactMethodId,
}: UseConversationDataInput) {
  const contactMethods = useQuery({
    queryKey: contactMethodsQueryKey,
    queryFn: () => client.listContactMethods(),
    retry: false,
  })

  const selectedContactMethod = contactMethods.data?.find(
    (contactMethod) => contactMethod.id === selectedContactMethodId,
  )
  const sendTarget =
    selectedContactMethod === undefined
      ? null
      : contactMethodSendTarget(selectedContactMethod)

  const conversation = useQuery({
    queryKey: conversationQueryKey(selectedContactMethod?.conversationId ?? 0),
    queryFn: () => {
      const conversationId = selectedContactMethod?.conversationId
      if (conversationId == null) {
        throw new Error("Conversation ID is required")
      }
      return loadConversationTurns(client, conversationId)
    },
    enabled: selectedContactMethod?.conversationId != null,
    refetchInterval: 1_000,
    retry: false,
  })

  const bookings = useQuery({
    queryKey: customerBookingsQueryKey(selectedContactMethod?.customerId ?? 0),
    queryFn: () => {
      const customerId = selectedContactMethod?.customerId
      if (customerId == null) {
        throw new Error("Customer ID is required")
      }
      return client.listCustomerBookings(customerId)
    },
    enabled: selectedContactMethod?.customerId != null,
    retry: false,
  })

  return {
    contactMethods,
    selectedContactMethod,
    sendTarget,
    canSendAsCustomer: sendTarget !== null,
    conversation,
    bookings,
  }
}

export function selectFirstContactMethod(
  contactMethods: ContactMethodSummary[] | undefined,
): number | null {
  const first = contactMethods?.[0]
  if (first === undefined) {
    return null
  }
  return first.id
}
