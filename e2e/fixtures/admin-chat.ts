import { randomUUID } from "node:crypto"
import { test as base } from "vitest"
import { DefaultChatTransport, readUIMessageStream } from "ai"
import { resolveDeploymentOrigin } from "@infra/deployment-context"
import type { ChatUIMessage } from "@worker/src/chat/tools"
import { createCloudflareDnsFetch } from "../cloudflare-dns-fetch"
import { testApiClient } from "./api-client"

export type AdminChatConversation = {
  send: (text: string) => Promise<string>
}

class TransportAdminChatConversation implements AdminChatConversation {
  private readonly messages: ChatUIMessage[] = []

  constructor(
    private readonly transport: DefaultChatTransport<ChatUIMessage>,
  ) {}

  async send(text: string): Promise<string> {
    const userMessage: ChatUIMessage = {
      id: randomUUID(),
      role: "user",
      parts: [{ type: "text", text }],
    }
    this.messages.push(userMessage)

    const stream = await this.transport.sendMessages({
      trigger: "submit-message",
      chatId: "admin",
      messageId: undefined,
      messages: this.messages,
      abortSignal: undefined,
    })
    let response: ChatUIMessage | undefined
    for await (const message of readUIMessageStream<ChatUIMessage>({
      stream,
    })) {
      response = message
    }
    if (response === undefined) {
      throw new Error("Admin chat returned no response")
    }
    this.messages.push(response)

    return response.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
  }
}

export const test = base.extend<{
  adminChat: AdminChatConversation
}>({
  adminChat: async ({ onTestFinished }, use) => {
    const apiKey = process.env.BOOK_API_KEY
    if (apiKey === undefined || apiKey === "") {
      throw new Error("BOOK_API_KEY is required")
    }

    const origin = resolveDeploymentOrigin()
    const cloudflareDns = await createCloudflareDnsFetch(
      new URL(origin).hostname,
    )
    const transport = new DefaultChatTransport<ChatUIMessage>({
      api: `${origin}/api/chat`,
      headers: { Authorization: `Bearer ${apiKey}` },
      fetch: cloudflareDns.fetch,
    })

    await testApiClient.resetAdminChat()
    onTestFinished(async () => {
      await testApiClient.resetAdminChat()
      await cloudflareDns.close()
    })
    await use(new TransportAdminChatConversation(transport))
  },
})
