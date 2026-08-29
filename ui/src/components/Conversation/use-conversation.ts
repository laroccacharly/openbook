import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { createSessionApiClient } from "../../lib/api/client"
import { firstErrorMessage } from "./first-error-message"
import { findPendingDraft } from "./find-pending-draft"
import { useConversationData } from "./use-conversation-data"
import { useConversationHandlers } from "./use-conversation-handlers"
import { useConversationMutations } from "./use-conversation-mutations"
import {
  useAutoSelectFirstContactMethod,
  useConversationBusyState,
} from "./use-conversation-state"

let cachedContactMethodId: number | null = null

function onContactMethodCreated(
  contactMethodId: number,
  setters: {
    setCreateEmail: (value: string) => void
    setDraft: (value: string) => void
    setEditingId: (value: string | null) => void
    setEditText: (value: string) => void
    setSelectedContactMethodId: (contactMethodId: number | null) => void
  },
) {
  setters.setCreateEmail("")
  setters.setDraft("")
  setters.setEditingId(null)
  setters.setEditText("")
  setters.setSelectedContactMethodId(contactMethodId)
}

export function useConversation() {
  const client = useMemo(() => createSessionApiClient(), [])
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState("")
  const [createEmail, setCreateEmail] = useState("")
  const [selectedContactMethodId, setSelectedContactMethodIdState] = useState<
    number | null
  >(cachedContactMethodId)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [pendingSendOpen, setPendingSendOpen] = useState(false)

  function setSelectedContactMethodId(contactMethodId: number | null) {
    cachedContactMethodId = contactMethodId
    setSelectedContactMethodIdState(contactMethodId)
  }

  const {
    contactMethods,
    selectedContactMethod,
    sendTarget,
    canSendAsCustomer,
    conversation,
    bookings,
  } = useConversationData({ client, selectedContactMethodId })

  useAutoSelectFirstContactMethod(
    selectedContactMethodId,
    contactMethods.data,
    setSelectedContactMethodId,
  )

  const mutations = useConversationMutations({
    client,
    queryClient,
    selectedContactMethod,
    onContactMethodCreated: (contactMethodId) =>
      onContactMethodCreated(contactMethodId, {
        setCreateEmail,
        setDraft,
        setEditingId,
        setEditText,
        setSelectedContactMethodId,
      }),
    onEditSaved: () => {
      setEditingId(null)
      setEditText("")
    },
    onDraftApproved: () => {
      setEditingId(null)
      setEditText("")
    },
    onDescriptionGenerated: setDraft,
  })

  const turns = conversation.data ?? []
  const pendingDraft = findPendingDraft(turns)
  const { isBusy } = useConversationBusyState({
    sendMessagePending: mutations.sendMessage.isPending,
    conversationPending: conversation.isPending,
    hasConversationId: selectedContactMethod?.conversationId != null,
    createPending: mutations.createContactMethod.isPending,
    generatePending: mutations.generateDescription.isPending,
    saveEditPending: mutations.saveEdit.isPending,
    approvePending: mutations.approve.isPending,
  })

  const handlers = useConversationHandlers({
    draft,
    createEmail,
    editText,
    isBusy,
    sendTarget,
    pendingDraft,
    selectedContactMethodId,
    setDraft,
    setEditingId,
    setEditText,
    setPendingSendOpen,
    setSelectedContactMethodId,
    createContactMethod: mutations.createContactMethod,
    sendMessage: mutations.sendMessage,
    saveEdit: mutations.saveEdit,
    approve: mutations.approve,
  })

  const error = firstErrorMessage(
    mutations.createContactMethod.error,
    contactMethods.error,
    conversation.error,
    mutations.sendMessage.error,
    mutations.saveEdit.error,
    mutations.approve.error,
    mutations.generateDescription.error,
  )
  const bookingsError = firstErrorMessage(bookings.error)

  return {
    turns,
    draft,
    setDraft,
    createEmail,
    setCreateEmail,
    selectedContactMethodId,
    selectContactMethodId: handlers.selectContactMethodId,
    contactMethods: contactMethods.data ?? [],
    contactMethodsLoading: contactMethods.isPending,
    createPending: mutations.createContactMethod.isPending,
    submitCreateContactMethod: handlers.submitCreateContactMethod,
    canSendAsCustomer,
    editingId,
    editText,
    setEditText,
    isBusy,
    error,
    isGenerating: mutations.generateDescription.isPending,
    generateDescription: () => mutations.generateDescription.mutate(),
    approveTurn: handlers.approveTurn,
    startEdit: handlers.startEdit,
    saveEdit: handlers.saveEditTurn,
    submitCustomerMessage: handlers.submitCustomerMessage,
    pendingSendOpen,
    setPendingSendOpen,
    forcePendingSend: handlers.forcePendingSend,
    approvePendingSend: handlers.approvePendingSend,
    bookings: bookings.data ?? [],
    bookingsLoading:
      selectedContactMethod?.customerId != null && bookings.isPending,
    bookingsError,
    hasSelectedCustomer: selectedContactMethod?.customerId != null,
  }
}
