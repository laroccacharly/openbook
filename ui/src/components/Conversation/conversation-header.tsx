import type { SubmitEvent } from "react"
import { CardHeader, CardTitle } from "@/components/ui/card"
import type { ContactMethodSummary } from "@/lib/api/client"
import { CustomerPicker } from "./customer-picker"
import { InboundPhoneNumber } from "./inbound-phone-number"

type ConversationHeaderProps = {
  createEmail: string
  selectedContactMethodId: number | null
  contactMethods: ContactMethodSummary[]
  contactMethodsLoading: boolean
  createPending: boolean
  disabled: boolean
  onCreateEmailChange: (value: string) => void
  onCreate: (event: SubmitEvent<HTMLFormElement>) => void
  onSelectContactMethodId: (contactMethodId: number) => void
}

export function ConversationHeader({
  createEmail,
  selectedContactMethodId,
  contactMethods,
  contactMethodsLoading,
  createPending,
  disabled,
  onCreateEmailChange,
  onCreate,
  onSelectContactMethodId,
}: ConversationHeaderProps) {
  return (
    <CardHeader className="border-b py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <CardTitle>Conversation</CardTitle>
        <InboundPhoneNumber />
      </div>
      <CustomerPicker
        createEmail={createEmail}
        selectedContactMethodId={selectedContactMethodId}
        contactMethods={contactMethods}
        contactMethodsLoading={contactMethodsLoading}
        createPending={createPending}
        disabled={disabled}
        onCreateEmailChange={onCreateEmailChange}
        onCreate={onCreate}
        onSelectContactMethodId={onSelectContactMethodId}
      />
    </CardHeader>
  )
}
