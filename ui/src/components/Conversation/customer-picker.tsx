import type { SubmitEvent } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import type { ContactMethodSummary } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { conversationContactLabel } from "./customer-contact"
import { GenerateCustomerEmailButton } from "./generate-customer-email-button"

type CustomerPickerProps = {
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

export function CustomerPicker({
  createEmail,
  selectedContactMethodId,
  contactMethods,
  contactMethodsLoading,
  createPending,
  disabled,
  onCreateEmailChange,
  onCreate,
  onSelectContactMethodId,
}: CustomerPickerProps) {
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2 md:items-end">
      <ContactMethodSelect
        selectedContactMethodId={selectedContactMethodId}
        contactMethods={contactMethods}
        contactMethodsLoading={contactMethodsLoading}
        disabled={disabled}
        onSelectContactMethodId={onSelectContactMethodId}
      />
      <CreateContactMethodForm
        createEmail={createEmail}
        createPending={createPending}
        disabled={disabled}
        onCreateEmailChange={onCreateEmailChange}
        onCreate={onCreate}
      />
    </div>
  )
}

function ContactMethodSelect({
  selectedContactMethodId,
  contactMethods,
  contactMethodsLoading,
  disabled,
  onSelectContactMethodId,
}: {
  selectedContactMethodId: number | null
  contactMethods: ContactMethodSummary[]
  contactMethodsLoading: boolean
  disabled: boolean
  onSelectContactMethodId: (contactMethodId: number) => void
}) {
  const selectDisabled =
    disabled || contactMethodsLoading || contactMethods.length === 0

  return (
    <Field>
      <FieldLabel htmlFor="conversation-customer-select">
        Contact method
      </FieldLabel>
      <select
        id="conversation-customer-select"
        value={selectedContactMethodId ?? ""}
        onChange={(event) => {
          const contactMethodId = Number(event.target.value)
          if (!Number.isInteger(contactMethodId) || contactMethodId <= 0) {
            return
          }
          onSelectContactMethodId(contactMethodId)
        }}
        disabled={selectDisabled}
        required
        className={cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80",
        )}
      >
        <ContactMethodOptions
          contactMethods={contactMethods}
          contactMethodsLoading={contactMethodsLoading}
        />
      </select>
    </Field>
  )
}

function ContactMethodOptions({
  contactMethods,
  contactMethodsLoading,
}: {
  contactMethods: ContactMethodSummary[]
  contactMethodsLoading: boolean
}) {
  if (contactMethodsLoading) {
    return <option value="">Loading contact methods…</option>
  }

  if (contactMethods.length === 0) {
    return <option value="">No contact methods yet</option>
  }

  return (
    <>
      <option value="" disabled>
        Select a contact method
      </option>
      {contactMethods.map((contactMethod) => (
        <option key={contactMethod.id} value={contactMethod.id}>
          {conversationContactLabel(contactMethod)}
        </option>
      ))}
    </>
  )
}

function CreateContactMethodForm({
  createEmail,
  createPending,
  disabled,
  onCreateEmailChange,
  onCreate,
}: {
  createEmail: string
  createPending: boolean
  disabled: boolean
  onCreateEmailChange: (value: string) => void
  onCreate: (event: SubmitEvent<HTMLFormElement>) => void
}) {
  const createDisabled = disabled || createPending || createEmail.trim() === ""

  return (
    <form className="min-w-0" onSubmit={onCreate}>
      <Field>
        <FieldLabel htmlFor="conversation-create-contact-email">
          Create contact method
        </FieldLabel>
        <div className="flex min-w-0 gap-2">
          <Input
            id="conversation-create-contact-email"
            type="email"
            value={createEmail}
            onChange={(event) => onCreateEmailChange(event.target.value)}
            disabled={disabled || createPending}
            autoComplete="email"
            placeholder="customer@example.com"
            required
          />
          <GenerateCustomerEmailButton
            disabled={disabled || createPending}
            onEmail={onCreateEmailChange}
          />
          <Button type="submit" disabled={createDisabled}>
            {createPending ? <Spinner data-icon="inline-start" /> : null}
            {createPending ? "Creating…" : "Create"}
          </Button>
        </div>
      </Field>
    </form>
  )
}
