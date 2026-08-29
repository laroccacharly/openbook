import type { ConversationTurn } from "./types"

/** Stable across draft → approved so the scroller does not remount the turn. */
export function conversationTurnKey(turn: ConversationTurn): string {
  if (turn.role === "inbound") {
    return turn.id
  }
  return `outbound-${turn.messageId}`
}
