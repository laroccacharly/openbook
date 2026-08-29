import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Message, MessageContent } from "@/components/ui/message"
import type { ChatMessagePart, ChatUIMessage } from "@worker/src/chat/tools"

function toolStateLabel(state: string): string {
  if (state === "output-available") {
    return "Done"
  }
  if (state === "output-error") {
    return "Failed"
  }
  return "Running"
}

function formatToolInput(input: unknown): string | null {
  if (input === undefined) {
    return null
  }
  if (typeof input === "string") {
    return input
  }
  return JSON.stringify(input, null, 2)
}

function querySqlLabel(
  part: Extract<ChatMessagePart, { type: "tool-querySql" }>,
): string {
  if (part.state !== "output-available") {
    return `querySql · ${toolStateLabel(part.state)}`
  }
  if ("error" in part.output) {
    return `querySql · ${part.output.error}`
  }
  const { rowCount, truncated } = part.output
  if (truncated) {
    return `querySql · ${rowCount}+ rows`
  }
  return `querySql · ${rowCount} row${rowCount === 1 ? "" : "s"}`
}

function querySqlInput(
  part: Extract<ChatMessagePart, { type: "tool-querySql" }>,
): unknown {
  if (part.input === undefined) {
    return undefined
  }
  if (typeof part.input.sql === "string") {
    return part.input.sql
  }
  return part.input
}

function writeSqlLabel(
  part: Extract<ChatMessagePart, { type: "tool-writeSql" }>,
): string {
  if (part.state !== "output-available") {
    return `writeSql · ${toolStateLabel(part.state)}`
  }
  if ("error" in part.output) {
    return `writeSql · ${part.output.error}`
  }
  const { changes } = part.output
  return `writeSql · ${changes} change${changes === 1 ? "" : "s"}`
}

function writeSqlInput(
  part: Extract<ChatMessagePart, { type: "tool-writeSql" }>,
): unknown {
  if (part.input === undefined) {
    return undefined
  }
  if (typeof part.input.sql === "string") {
    return part.input.sql
  }
  return part.input
}

function ToolCall({
  label,
  input,
  errorText,
}: {
  label: string
  input: unknown
  errorText?: string
}) {
  const args = formatToolInput(input)
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {args === null ? null : (
        <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-foreground">
          {args}
        </pre>
      )}
      {errorText === undefined ? null : (
        <div className="text-xs text-destructive">{errorText}</div>
      )}
    </div>
  )
}

function AssistantPart({ part }: { part: ChatMessagePart }) {
  if (part.type === "text") {
    if (part.text.trim() === "") {
      return null
    }
    return (
      <div className="whitespace-pre-wrap px-1.5 text-sm leading-relaxed">
        {part.text}
      </div>
    )
  }
  if (part.type === "tool-querySql") {
    return (
      <ToolCall
        label={querySqlLabel(part)}
        input={querySqlInput(part)}
        errorText={part.state === "output-error" ? part.errorText : undefined}
      />
    )
  }
  if (part.type === "tool-writeSql") {
    return (
      <ToolCall
        label={writeSqlLabel(part)}
        input={writeSqlInput(part)}
        errorText={part.state === "output-error" ? part.errorText : undefined}
      />
    )
  }
  return null
}

export function ChatMessage({
  message,
  isStreaming = false,
}: {
  message: ChatUIMessage
  isStreaming?: boolean
}) {
  if (message.role === "user") {
    return (
      <Message align="end">
        <MessageContent>
          <Bubble align="end" variant="muted">
            <BubbleContent>
              {message.parts
                .filter((part) => part.type === "text")
                .map((part) => part.text)
                .join("")}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    )
  }

  return (
    <Message align="start">
      <MessageContent>
        {message.parts.map((part, index) => (
          <AssistantPart key={index} part={part} />
        ))}
        {isStreaming ? (
          <div className="px-1.5 text-sm text-muted-foreground">…</div>
        ) : null}
      </MessageContent>
    </Message>
  )
}
