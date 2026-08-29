import type { SubmitEvent } from "react"
import { createId } from "./create-id"
import { isValidEmail } from "./is-valid-email"
import type { ConversationTurn } from "./types"

type PendingDraft = Extract<
  ConversationTurn,
  { role: "outbound"; kind: "draft" }
> | null

type SendTarget = {
  channel: "email" | "sms"
  address: string
}

type MutationHandle<TInput> = {
  mutate: (input: TInput) => void
}

type AsyncMutationHandle<TInput> = MutationHandle<TInput> & {
  mutateAsync: (input: TInput) => Promise<unknown>
}

type ConversationHandlersInput = {
  draft: string
  createEmail: string
  editText: string
  isBusy: boolean
  sendTarget: SendTarget | null
  pendingDraft: PendingDraft
  selectedContactMethodId: number | null
  setDraft: (value: string) => void
  setEditingId: (value: string | null) => void
  setEditText: (value: string) => void
  setPendingSendOpen: (value: boolean) => void
  setSelectedContactMethodId: (contactMethodId: number | null) => void
  createContactMethod: MutationHandle<string>
  sendMessage: MutationHandle<{
    message: string
    channel: "email" | "sms"
    address: string
    externalId: string
  }>
  saveEdit: MutationHandle<{
    draftId: number
    body: string
    revision: number
  }>
  approve: AsyncMutationHandle<{
    draftId: number
    revision: number
  }>
}

export function useConversationHandlers(input: ConversationHandlersInput) {
  const {
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
    createContactMethod,
    sendMessage,
    saveEdit,
    approve,
  } = input

  function selectContactMethodId(contactMethodId: number) {
    if (contactMethodId === selectedContactMethodId) {
      return
    }
    setSelectedContactMethodId(contactMethodId)
    setDraft("")
    setEditingId(null)
    setEditText("")
  }

  function submitCreateContactMethod(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = createEmail.trim()
    if (email.length === 0 || !isValidEmail(email) || isBusy) {
      return
    }
    createContactMethod.mutate(email)
  }

  function approveTurn(turn: ConversationTurn) {
    if (turn.role !== "outbound" || turn.kind !== "draft") {
      return
    }
    approve.mutate({ draftId: turn.draftId, revision: turn.revision })
  }

  function startEdit(turn: ConversationTurn) {
    if (turn.role !== "outbound" || turn.kind !== "draft") {
      return
    }
    setEditingId(turn.id)
    setEditText(turn.text)
  }

  function saveEditTurn(turn: ConversationTurn) {
    const text = editText.trim()
    if (
      text.length === 0 ||
      turn.role !== "outbound" ||
      turn.kind !== "draft"
    ) {
      return
    }
    saveEdit.mutate({
      draftId: turn.draftId,
      body: text,
      revision: turn.revision,
    })
  }

  function sendCustomerMessage(message: string, target: SendTarget) {
    setDraft("")
    setPendingSendOpen(false)
    sendMessage.mutate({
      message,
      channel: target.channel,
      address: target.address,
      externalId: createId("conversation"),
    })
  }

  function submitCustomerMessage(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (text.length === 0 || isBusy || sendTarget === null) {
      return
    }

    if (pendingDraft !== null) {
      setPendingSendOpen(true)
      return
    }

    sendCustomerMessage(text, sendTarget)
  }

  function forcePendingSend() {
    const text = draft.trim()
    if (text.length === 0 || isBusy || sendTarget === null) {
      return
    }
    sendCustomerMessage(text, sendTarget)
  }

  async function approvePendingSend() {
    const text = draft.trim()
    if (
      pendingDraft === null ||
      text.length === 0 ||
      isBusy ||
      sendTarget === null
    ) {
      return
    }

    setPendingSendOpen(false)
    await approve.mutateAsync({
      draftId: pendingDraft.draftId,
      revision: pendingDraft.revision,
    })
    sendCustomerMessage(text, sendTarget)
  }

  return {
    selectContactMethodId,
    submitCreateContactMethod,
    approveTurn,
    startEdit,
    saveEditTurn,
    submitCustomerMessage,
    forcePendingSend,
    approvePendingSend,
  }
}
