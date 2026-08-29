import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { ConversationComposer } from "./conversation-composer"
import { ConversationHeader } from "./conversation-header"
import { ConversationThread } from "./conversation-thread"
import { CustomerBookings } from "@/components/Bookings"
import { PendingDraftSendDialog } from "./pending-draft-send-dialog"
import { useConversation } from "./use-conversation"

export function Conversation() {
  const conversation = useConversation()

  return (
    <div className="flex flex-col gap-8">
      <Card className="flex h-[min(80rem,calc(100svh-8rem))] flex-col gap-0 py-0">
        <ConversationHeader
          createEmail={conversation.createEmail}
          selectedContactMethodId={conversation.selectedContactMethodId}
          contactMethods={conversation.contactMethods}
          contactMethodsLoading={conversation.contactMethodsLoading}
          createPending={conversation.createPending}
          disabled={conversation.isBusy}
          onCreateEmailChange={conversation.setCreateEmail}
          onCreate={conversation.submitCreateContactMethod}
          onSelectContactMethodId={conversation.selectContactMethodId}
        />
        <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
          <ConversationThread
            turns={conversation.turns}
            editingId={conversation.editingId}
            editText={conversation.editText}
            disabled={conversation.isBusy}
            onEditTextChange={conversation.setEditText}
            onSaveEdit={conversation.saveEdit}
            onStartEdit={conversation.startEdit}
            onApprove={conversation.approveTurn}
          />
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3">
          <ConversationComposer
            draft={conversation.draft}
            disabled={conversation.isBusy}
            canSubmit={
              conversation.draft.trim().length > 0 &&
              !conversation.isBusy &&
              conversation.canSendAsCustomer
            }
            isGenerating={conversation.isGenerating}
            error={conversation.error}
            onDraftChange={conversation.setDraft}
            onGenerate={conversation.generateDescription}
            onSubmit={conversation.submitCustomerMessage}
          />
        </CardFooter>
      </Card>
      <PendingDraftSendDialog
        open={conversation.pendingSendOpen}
        onOpenChange={conversation.setPendingSendOpen}
        onApprove={() => {
          void conversation.approvePendingSend()
        }}
        onForce={conversation.forcePendingSend}
      />
      <CustomerBookings
        bookings={conversation.bookings}
        loading={conversation.bookingsLoading}
        error={conversation.bookingsError}
        hasCustomer={conversation.hasSelectedCustomer}
      />
    </div>
  )
}
