import type { D1Database } from "@cloudflare/workers-types"
import { isStepCount, ToolLoopAgent, type LanguageModel } from "ai"
import { getChatInstructions } from "./prompt"
import { dumpD1Schema } from "./sql"
import { createChatTools, type ChatTools } from "./tools"

export async function createAdminChatAgent(options: {
  model: LanguageModel
  db: D1Database
  timezone: string
  now: Date
}): Promise<ToolLoopAgent<never, ChatTools>> {
  const { now, timezone } = options
  const schema = await dumpD1Schema(options.db)
  return new ToolLoopAgent({
    model: options.model,
    instructions: getChatInstructions(now, timezone, schema),
    tools: createChatTools(options.db),
    stopWhen: isStepCount(5),
    temperature: 0.2,
  })
}
