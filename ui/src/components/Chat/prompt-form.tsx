import { useState, type KeyboardEvent, type SubmitEvent } from "react"
import { ArrowUpIcon, SquareIcon } from "lucide-react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"

export function PromptForm({
  isBusy,
  onSubmit,
  onStop,
}: {
  isBusy: boolean
  onSubmit: (text: string) => void
  onStop: () => void
}) {
  const [input, setInput] = useState("")

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if (text === "" || isBusy) {
      return
    }
    onSubmit(text)
    setInput("")
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return
    }
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <form onSubmit={handleSubmit}>
      <InputGroup className="h-auto">
        <InputGroupTextarea
          placeholder="Ask about bookings…"
          className="p-3.5"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <InputGroupAddon align="block-end">
          {isBusy ? (
            <InputGroupButton
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Stop generating"
              className="ml-auto"
              onClick={onStop}
            >
              <SquareIcon />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              type="submit"
              size="icon-sm"
              variant="default"
              aria-label="Send message"
              className="ml-auto"
              disabled={input.trim() === ""}
            >
              <ArrowUpIcon />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
