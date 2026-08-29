import { ArrowUpIcon, WandSparklesIcon } from "lucide-react"
import type { SubmitEvent } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"

type ConversationComposerProps = {
  draft: string
  disabled: boolean
  canSubmit: boolean
  isGenerating: boolean
  error: string | null
  onDraftChange: (value: string) => void
  onGenerate: () => void
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void
}

export function ConversationComposer({
  draft,
  disabled,
  canSubmit,
  isGenerating,
  error,
  onDraftChange,
  onGenerate,
  onSubmit,
}: ConversationComposerProps) {
  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <form className="w-full" onSubmit={onSubmit}>
        <InputGroup className="h-auto">
          <InputGroupTextarea
            placeholder="Write as the customer…"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey) {
                return
              }
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }}
          />
          <InputGroupAddon align="block-end">
            <InputGroupButton
              type="button"
              size="icon-sm"
              variant="secondary"
              className="ml-auto border border-border text-foreground"
              disabled={disabled}
              onClick={onGenerate}
              aria-label={
                isGenerating
                  ? "Generating booking description"
                  : "Generate booking description"
              }
            >
              {isGenerating ? <Spinner /> : <WandSparklesIcon />}
            </InputGroupButton>
            <InputGroupButton
              type="submit"
              size="icon-sm"
              variant="default"
              disabled={!canSubmit}
              aria-label="Send customer message"
            >
              <ArrowUpIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  )
}
