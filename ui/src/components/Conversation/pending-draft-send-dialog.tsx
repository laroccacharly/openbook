import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type PendingDraftSendDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApprove: () => void
  onForce: () => void
}

export function PendingDraftSendDialog({
  open,
  onOpenChange,
  onApprove,
  onForce,
}: PendingDraftSendDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unapproved reply</AlertDialogTitle>
          <AlertDialogDescription>
            Approve sends the draft first, then your message. Force skips the
            draft.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-between">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <AlertDialogAction variant="destructive" onClick={onForce}>
              Force
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:border-emerald-600 focus-visible:ring-emerald-600/30"
              onClick={onApprove}
            >
              Approve
            </AlertDialogAction>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
