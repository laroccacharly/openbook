import { useEffect } from "react"
import type { ContactMethodSummary } from "../../lib/api/client"
import { selectFirstContactMethod } from "./use-conversation-data"

export function useAutoSelectFirstContactMethod(
  selectedContactMethodId: number | null,
  contactMethods: ContactMethodSummary[] | undefined,
  setSelectedContactMethodId: (contactMethodId: number | null) => void,
) {
  useEffect(() => {
    if (selectedContactMethodId !== null) {
      return
    }
    const firstContactMethodId = selectFirstContactMethod(contactMethods)
    if (firstContactMethodId === null) {
      return
    }
    setSelectedContactMethodId(firstContactMethodId)
  }, [selectedContactMethodId, contactMethods, setSelectedContactMethodId])
}

function isConversationBusy(input: {
  sendMessagePending: boolean
  isLoadingConversation: boolean
  createPending: boolean
  generatePending: boolean
  saveEditPending: boolean
  approvePending: boolean
}): boolean {
  return (
    input.sendMessagePending ||
    input.isLoadingConversation ||
    input.createPending ||
    input.generatePending ||
    input.saveEditPending ||
    input.approvePending
  )
}

export function useConversationBusyState(input: {
  sendMessagePending: boolean
  conversationPending: boolean
  hasConversationId: boolean
  createPending: boolean
  generatePending: boolean
  saveEditPending: boolean
  approvePending: boolean
}) {
  const isLoadingConversation =
    input.hasConversationId && input.conversationPending
  const isBusy = isConversationBusy({
    sendMessagePending: input.sendMessagePending,
    isLoadingConversation,
    createPending: input.createPending,
    generatePending: input.generatePending,
    saveEditPending: input.saveEditPending,
    approvePending: input.approvePending,
  })

  return { isLoadingConversation, isBusy }
}
