import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { formatDatetime } from "@/components/data-table/format-datetime"
import {
  Message,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@/components/ui/message"
import { MessageScrollerItem } from "@/components/ui/message-scroller"
import { conversationTurnKey } from "./conversation-turn-key"
import { LinkifyText } from "./linkify-text"
import { PendingTurnActions } from "./pending-turn-actions"
import type { ConversationTurn } from "./types"

type TurnMessageProps = {
  turn: ConversationTurn
  isEditing: boolean
  editText: string
  disabled: boolean
  onEditTextChange: (value: string) => void
  onSaveEdit: () => void
  onStartEdit: () => void
  onApprove: () => void
}

function TurnMessageTimestamp({ createdAt }: { createdAt: number }) {
  return (
    <time
      className="font-normal tabular-nums"
      dateTime={new Date(createdAt * 1000).toISOString()}
    >
      {formatDatetime(createdAt)}
    </time>
  )
}

function TurnMessageHeader({ turn }: { turn: ConversationTurn }) {
  const isOutbound = turn.role === "outbound"

  return (
    <MessageHeader className={isOutbound ? "gap-2" : "justify-end gap-2"}>
      <span>{isOutbound ? "Book" : "Customer"}</span>
      <TurnMessageTimestamp createdAt={turn.createdAt} />
    </MessageHeader>
  )
}

export function TurnMessage({
  turn,
  isEditing,
  editText,
  disabled,
  onEditTextChange,
  onSaveEdit,
  onStartEdit,
  onApprove,
}: TurnMessageProps) {
  const isOutbound = turn.role === "outbound"
  const isPending = isOutbound && turn.kind === "draft"

  return (
    <MessageScrollerItem
      messageId={conversationTurnKey(turn)}
      scrollAnchor={!isOutbound}
    >
      <Message align={isOutbound ? "start" : "end"}>
        <MessageContent>
          <TurnMessageHeader turn={turn} />
          <Bubble
            variant={isPending ? "outline" : isOutbound ? "muted" : "default"}
          >
            {isEditing ? (
              <BubbleContent className="w-full min-w-56 p-0">
                <textarea
                  className="field-sizing-content max-h-40 min-h-16 w-full resize-none bg-transparent px-3 py-2 text-sm outline-none"
                  value={editText}
                  onChange={(event) => onEditTextChange(event.target.value)}
                  autoFocus
                />
              </BubbleContent>
            ) : (
              <BubbleContent className="whitespace-pre-wrap">
                <LinkifyText text={turn.text} />
              </BubbleContent>
            )}
          </Bubble>
          {isPending ? (
            <MessageFooter className="gap-2">
              <PendingTurnActions
                isEditing={isEditing}
                editText={editText}
                disabled={disabled}
                onSaveEdit={onSaveEdit}
                onStartEdit={onStartEdit}
                onApprove={onApprove}
              />
            </MessageFooter>
          ) : isOutbound ? (
            <MessageFooter>Approved</MessageFooter>
          ) : null}
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  )
}
