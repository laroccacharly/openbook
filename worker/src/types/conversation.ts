export type ConversationTurn = {
  role: "customer" | "business"
  body: string
  createdAt: number
}

export type ConversationTimelineTurn =
  | {
      id: string
      role: "inbound"
      text: string
      messageId: number
      createdAt: number
    }
  | {
      id: string
      role: "outbound"
      kind: "response"
      text: string
      messageId: number
      createdAt: number
    }
  | {
      id: string
      role: "outbound"
      kind: "draft"
      draftId: number
      text: string
      messageId: number
      revision: number
      createdAt: number
    }

/** Render a transcript for LLM prompts. The last customer turn is the message to act on. */
export function formatConversationTranscript(
  turns: ConversationTurn[],
): string {
  return turns
    .map((turn) =>
      turn.role === "customer"
        ? `Customer: ${turn.body}`
        : `Business: ${turn.body}`,
    )
    .join("\n\n")
}
