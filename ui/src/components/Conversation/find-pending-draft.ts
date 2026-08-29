import type { ConversationTurn } from "./types"

export function findPendingDraft(
  turns: ConversationTurn[],
): Extract<ConversationTurn, { role: "outbound"; kind: "draft" }> | null {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]
    if (turn === undefined) continue
    if (turn.role === "outbound" && turn.kind === "draft") {
      return turn
    }
  }
  return null
}
