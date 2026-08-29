import type { ApiClient } from "./api/client"
import type { ConversationTurn } from "../components/Conversation/types"

export async function loadConversationTurns(
  client: ApiClient,
  conversationId: number,
): Promise<ConversationTurn[]> {
  return client.getConversation(conversationId)
}
