import { Hono } from "hono"
import type { WorkerEnv } from "@infra/alchemy.run"

export const supportedLanguageModels = [
  { id: "openai/gpt-5.6-luna", label: "GPT-5.6 Luna" },
  { id: "openai/gpt-5.6-sol", label: "GPT-5.6 Sol" },
  { id: "@cf/openai/gpt-oss-120b", label: "GPT-OSS 120B" },
  { id: "@cf/zai-org/glm-5.2", label: "GLM 5.2" },
  { id: "deepseek/deepseek-v4-flash-0731", label: "DeepSeek V4 Flash" },
] as const

export const languageModelsRouter = new Hono<{ Bindings: WorkerEnv }>().get(
  "/language-models",
  (c) => c.json(supportedLanguageModels),
)
