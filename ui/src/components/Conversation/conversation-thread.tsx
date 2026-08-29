import { Marker, MarkerContent } from "@/components/ui/marker"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { conversationTurnKey } from "./conversation-turn-key"
import { TurnMessage } from "./turn-message"
import type { ConversationTurn } from "./types"

type ConversationThreadProps = {
  turns: ConversationTurn[]
  editingId: string | null
  editText: string
  disabled: boolean
  onEditTextChange: (value: string) => void
  onSaveEdit: (turn: ConversationTurn) => void
  onStartEdit: (turn: ConversationTurn) => void
  onApprove: (turn: ConversationTurn) => void
}

export function ConversationThread({
  turns,
  editingId,
  editText,
  disabled,
  onEditTextChange,
  onSaveEdit,
  onStartEdit,
  onApprove,
}: ConversationThreadProps) {
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent className="p-4">
            <MessageScrollerItem scrollAnchor={false}>
              <Marker variant="separator">
                <MarkerContent>Today</MarkerContent>
              </Marker>
            </MessageScrollerItem>
            {turns.map((turn) => (
              <TurnMessage
                key={conversationTurnKey(turn)}
                turn={turn}
                isEditing={editingId === turn.id}
                editText={editText}
                disabled={disabled}
                onEditTextChange={onEditTextChange}
                onSaveEdit={() => onSaveEdit(turn)}
                onStartEdit={() => onStartEdit(turn)}
                onApprove={() => onApprove(turn)}
              />
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
