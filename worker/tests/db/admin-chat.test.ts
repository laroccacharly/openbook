import { env } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import {
  getAdminChatMessages,
  saveAdminChatMessages,
} from "@worker/src/db/admin-chat"
import type { ChatUIMessage } from "@worker/src/chat/tools"
import { testApiClient } from "../fixtures/api-client"

const userMessage: ChatUIMessage = {
  id: "msg_user_1",
  role: "user",
  parts: [{ type: "text", text: "How many bookings?" }],
}

describe("admin chat persistence", () => {
  test("seeds an empty transcript", async () => {
    await expect(getAdminChatMessages(env.DB)).resolves.toEqual([])
  })

  test("saves and loads messages", async () => {
    await saveAdminChatMessages(env.DB, [userMessage])
    await expect(getAdminChatMessages(env.DB)).resolves.toEqual([userMessage])
  })

  test("rejects invalid stored JSON", async () => {
    await env.DB.prepare(
      `UPDATE admin_chat SET messages = 'not-json' WHERE id = 1`,
    ).run()

    await expect(getAdminChatMessages(env.DB)).rejects.toThrow()
  })

  test("rejects stored messages that fail the schema", async () => {
    await env.DB.prepare(
      `UPDATE admin_chat SET messages = '[{}]' WHERE id = 1`,
    ).run()

    await expect(getAdminChatMessages(env.DB)).rejects.toThrow()
  })

  test("throws when the singleton row is missing", async () => {
    await env.DB.prepare(`DELETE FROM admin_chat`).run()

    await expect(getAdminChatMessages(env.DB)).rejects.toThrow(
      "Admin chat row is missing",
    )
    await expect(saveAdminChatMessages(env.DB, [userMessage])).rejects.toThrow(
      "Admin chat row is missing",
    )
  })
})

describe("admin chat API", () => {
  test("returns the stored transcript", async () => {
    await expect(testApiClient.getAdminChat()).resolves.toEqual({
      messages: [],
    })

    await saveAdminChatMessages(env.DB, [userMessage])
    await expect(testApiClient.getAdminChat()).resolves.toEqual({
      messages: [userMessage],
    })
  })

  test("clears the stored transcript", async () => {
    await saveAdminChatMessages(env.DB, [userMessage])
    await expect(testApiClient.resetAdminChat()).resolves.toEqual({
      messages: [],
    })
    await expect(testApiClient.getAdminChat()).resolves.toEqual({
      messages: [],
    })
  })
})
