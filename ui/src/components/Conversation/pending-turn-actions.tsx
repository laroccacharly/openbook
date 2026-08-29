import { CheckIcon, PencilIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

type PendingTurnActionsProps = {
  isEditing: boolean
  editText: string
  disabled: boolean
  onSaveEdit: () => void
  onStartEdit: () => void
  onApprove: () => void
}

export function PendingTurnActions({
  isEditing,
  editText,
  disabled,
  onSaveEdit,
  onStartEdit,
  onApprove,
}: PendingTurnActionsProps) {
  if (isEditing) {
    return (
      <Button
        type="button"
        size="xs"
        variant="secondary"
        disabled={editText.trim().length === 0}
        onClick={onSaveEdit}
      >
        Done
      </Button>
    )
  }

  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={disabled}
        onClick={onStartEdit}
      >
        <PencilIcon data-icon="inline-start" />
        Edit
      </Button>
      <Button
        type="button"
        size="xs"
        variant="default"
        disabled={disabled}
        onClick={onApprove}
      >
        <CheckIcon data-icon="inline-start" />
        Approve
      </Button>
    </>
  )
}
