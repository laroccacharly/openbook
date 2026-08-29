import type { D1Database } from "@cloudflare/workers-types"
import { z } from "zod"
import type { ChatUIMessage } from "../chat/tools"

const StoredChatMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["system", "user", "assistant"]),
  parts: z.array(z.unknown()),
  metadata: z.unknown().optional(),
})

const StoredChatMessagesSchema = z.array(StoredChatMessageSchema)

function parseStoredMessages(raw: string): ChatUIMessage[] {
  return StoredChatMessagesSchema.parse(JSON.parse(raw)) as ChatUIMessage[]
}

export async function getAdminChatMessages(
  db: D1Database,
): Promise<ChatUIMessage[]> {
  const result = await db
    .prepare(`SELECT messages FROM admin_chat WHERE id = 1`)
    .first<{ messages: string }>()

  if (result === null) {
    throw new Error("Admin chat row is missing")
  }

  return parseStoredMessages(result.messages)
}

export async function saveAdminChatMessages(
  db: D1Database,
  messages: ChatUIMessage[],
): Promise<void> {
  const payload = JSON.stringify(StoredChatMessagesSchema.parse(messages))
  const result = await db
    .prepare(
      `UPDATE admin_chat
       SET messages = ?, updated_at = unixepoch()
       WHERE id = 1`,
    )
    .bind(payload)
    .run()

  if (result.meta.changes === 0) {
    throw new Error("Admin chat row is missing")
  }
}
