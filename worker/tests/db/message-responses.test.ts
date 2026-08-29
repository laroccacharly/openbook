import { env } from "cloudflare:workers"
import { introspectWorkflow } from "cloudflare:test"
import { describe, expect, test } from "vitest"
import {
  getMessageResponseByMessageId,
  getMessageResponses,
  listMessageResponsesByMessageIds,
} from "@worker/src/db/message-responses"
import { getWorkflow } from "@worker/src/db/workflows"
import { patchConfiguration } from "@worker/src/db/configuration"
import { createInboundMessage } from "@worker/tests/fixtures/messages"
import {
  approveResponseDraft,
  getResponseDraftById,
  getResponseDraftByMessageId,
  getResponseDraftForConversation,
  updateResponseDraftBody,
  upsertResponseDraft,
  persistResponseDraft,
} from "@worker/src/db/response-drafts"
import { testApiClient } from "../fixtures/api-client"

describe("message responses", () => {
  const db = env.DB

  test("promotes drafts into immutable responses and lists them", async () => {
    const { message: first } = await createInboundMessage(db, {
      message: "First inbound",
      channel: "email",
      address: "responses-first@example.com",
    })
    const { message: second } = await createInboundMessage(db, {
      message: "Second inbound",
      channel: "email",
      address: "responses-second@example.com",
    })
    const firstDraft = await upsertResponseDraft(
      db,
      first,
      { messageId: first.id, body: "Reply one" },
      null,
    )
    const secondDraft = await upsertResponseDraft(
      db,
      second,
      {
        messageId: second.id,
        body: "Reply two",
        proposedDatetime: new Date("2026-07-31T13:00:00.000Z"),
        pipelineState: '{"proposedDatetime":"2026-07-31T13:00:00.000Z"}',
      },
      null,
    )
    const firstResponse = await approveResponseDraft(
      db,
      firstDraft!.id,
      firstDraft!.revision,
    )
    const secondResponse = await approveResponseDraft(
      db,
      secondDraft!.id,
      secondDraft!.revision,
    )

    expect(firstResponse?.proposedDatetime).toBeNull()
    expect(firstResponse?.pipelineState).toBeNull()
    expect(secondResponse?.proposedDatetime?.toISOString()).toBe(
      "2026-07-31T13:00:00.000Z",
    )
    expect(secondResponse?.pipelineState).toBe(
      '{"proposedDatetime":"2026-07-31T13:00:00.000Z"}',
    )
    expect(await getMessageResponseByMessageId(db, first.id)).toEqual(
      firstResponse,
    )
    expect(await getMessageResponseByMessageId(db, 999_999)).toBeNull()
    expect(
      await listMessageResponsesByMessageIds(db, [first.id, second.id]),
    ).toHaveLength(2)
    expect(await getMessageResponses(db)).toEqual([
      secondResponse,
      firstResponse,
    ])
    await expect(testApiClient.listMessageResponses()).resolves.toEqual([
      {
        ...secondResponse,
        proposedDatetime: secondResponse?.proposedDatetime?.toISOString(),
      },
      firstResponse,
    ])
    expect(await listMessageResponsesByMessageIds(db, [])).toEqual([])
  })

  test("deletes exactly the promoted draft", async () => {
    const { message } = await createInboundMessage(db, {
      message: "Inbound",
      channel: "email",
      address: "message-response@example.com",
    })
    const draft = await upsertResponseDraft(
      db,
      message,
      { messageId: message.id, body: "Approved reply" },
      null,
    )

    const response = await approveResponseDraft(db, draft!.id, draft!.revision)

    expect(response).toMatchObject({
      messageId: message.id,
      body: "Approved reply",
      createdAt: expect.any(Number),
    })
    await expect(getResponseDraftById(db, draft!.id)).resolves.toBeNull()
    await expect(
      approveResponseDraft(db, draft!.id, draft!.revision),
    ).resolves.toBeNull()
  })

  test("automatically promotes a persisted draft when enabled", async () => {
    const { message } = await createInboundMessage(db, {
      message: "Auto-approve this response",
      channel: "email",
      address: "auto-approve@example.com",
    })

    await persistResponseDraft(db, {
      target: message,
      input: { messageId: message.id, body: "Automatically approved reply" },
      expectedRevision: null,
      autoApprove: true,
    })

    await expect(
      getResponseDraftByMessageId(db, message.id),
    ).resolves.toBeNull()
    await expect(
      getMessageResponseByMessageId(db, message.id),
    ).resolves.toMatchObject({
      messageId: message.id,
      body: "Automatically approved reply",
    })
  })

  test("leaves a persisted draft pending when auto-approval is disabled", async () => {
    const { message } = await createInboundMessage(db, {
      message: "Keep this response pending",
      channel: "email",
      address: "manual-approval@example.com",
    })

    await persistResponseDraft(db, {
      target: message,
      input: { messageId: message.id, body: "Pending reply" },
      expectedRevision: null,
      autoApprove: false,
    })

    await expect(
      getResponseDraftByMessageId(db, message.id),
    ).resolves.toMatchObject({
      messageId: message.id,
      body: "Pending reply",
    })
    await expect(
      getMessageResponseByMessageId(db, message.id),
    ).resolves.toBeNull()
  })

  test("edits and approves a draft through the API", async () => {
    await using deliveryWorkflow = await introspectWorkflow(
      env.MESSAGE_DELIVERY_WORKFLOW,
    )
    await deliveryWorkflow.modifyAll(async (modifier) => {
      await modifier.disableRetryDelays()
      await modifier.mockStepResult(
        { name: "deliver-message" },
        { messageResponseId: 1, providerMessageId: "SM123" },
      )
    })
    await patchConfiguration(db, { enableMessageDelivery: true })
    const { message } = await createInboundMessage(db, {
      message: "API inbound",
      channel: "sms",
      address: "+15145550103",
    })
    const draft = await upsertResponseDraft(
      db,
      message,
      {
        messageId: message.id,
        body: "Generated body",
        proposedDatetime: new Date("2026-08-07T14:00:00.000Z"),
      },
      null,
    )

    await expect(
      testApiClient.getResponseDraft(message.id),
    ).resolves.toMatchObject({
      id: draft!.id,
      proposedDatetime: "2026-08-07T14:00:00.000Z",
    })
    const edited = await testApiClient.updateResponseDraftBody(
      draft!.id,
      "Human-edited body",
      draft!.revision,
    )
    expect(edited).toMatchObject({
      body: "Human-edited body",
      revision: draft!.revision + 1,
    })
    const approved = await testApiClient.approveResponseDraft(
      edited.id,
      edited.revision,
    )
    expect(approved).toMatchObject({
      messageId: message.id,
      body: "Human-edited body",
      createdAt: expect.any(Number),
    })
    await expect(testApiClient.getResponseDraft(message.id)).rejects.toThrow()
    await expect(testApiClient.getMessageResponse(message.id)).resolves.toEqual(
      approved,
    )
    await expect(
      getWorkflow(db, {
        recordName: "message_response",
        recordId: approved.id,
      }),
    ).resolves.toMatchObject({
      recordName: "message_response",
      recordId: approved.id,
    })
    for (const instance of await deliveryWorkflow.get()) {
      await instance.waitForStatus("complete")
    }
  })

  test("does not queue delivery when message delivery is disabled", async () => {
    await patchConfiguration(db, { enableMessageDelivery: false })
    const { message } = await createInboundMessage(db, {
      message: "No delivery inbound",
      channel: "sms",
      address: "+15145550104",
    })
    const draft = await upsertResponseDraft(
      db,
      message,
      { messageId: message.id, body: "Queued only on approval" },
      null,
    )
    const approved = await testApiClient.approveResponseDraft(
      draft!.id,
      draft!.revision,
    )
    await expect(
      getWorkflow(db, {
        recordName: "message_response",
        recordId: approved.id,
      }),
    ).resolves.toBeNull()
  })

  test("keeps one draft per conversation and refreshes it for the latest message", async () => {
    const address = "pending@example.com"
    const { message: first } = await createInboundMessage(db, {
      message: "Can you come Wednesday?",
      channel: "email",
      address,
    })
    const draft = await upsertResponseDraft(
      db,
      first,
      { messageId: first.id, body: "Wednesday works." },
      null,
    )
    const edited = await updateResponseDraftBody(
      db,
      draft!.id,
      "Human-edited reply",
      draft!.revision,
    )
    const { message: second } = await createInboundMessage(db, {
      message: "Actually, can you come Thursday?",
      channel: "email",
      address,
    })

    await expect(getResponseDraftByMessageId(db, first.id)).resolves.toEqual(
      edited,
    )
    await expect(getResponseDraftByMessageId(db, second.id)).resolves.toBeNull()
    const updated = await upsertResponseDraft(
      db,
      second,
      {
        messageId: second.id,
        body: "Thursday works.",
        proposedDatetime: new Date("2026-08-06T13:00:00.000Z"),
        pipelineState: '{"action":"reschedule"}',
      },
      edited!.revision,
    )

    expect(updated).toMatchObject({
      id: draft!.id,
      messageId: second.id,
      body: "Thursday works.",
      pipelineState: '{"action":"reschedule"}',
    })
    expect(updated?.proposedDatetime?.toISOString()).toBe(
      "2026-08-06T13:00:00.000Z",
    )
    await expect(
      getResponseDraftForConversation(db, second.conversationId),
    ).resolves.toEqual(updated)
  })

  test("creates a new draft after the prior reply is approved", async () => {
    const address = "approved@example.com"
    const { message: first } = await createInboundMessage(db, {
      message: "First request",
      channel: "email",
      address,
    })
    const firstDraft = await upsertResponseDraft(
      db,
      first,
      { messageId: first.id, body: "Approved reply" },
      null,
    )
    const approved = await approveResponseDraft(
      db,
      firstDraft!.id,
      firstDraft!.revision,
    )
    const { message: second } = await createInboundMessage(db, {
      message: "Follow-up request",
      channel: "email",
      address,
    })

    const pending = await upsertResponseDraft(
      db,
      second,
      { messageId: second.id, body: "New pending reply" },
      null,
    )

    expect(pending?.id).not.toBe(firstDraft!.id)
    expect(await getMessageResponseByMessageId(db, first.id)).toEqual(approved)
  })

  test("discards an older workflow result when a newer inbound exists", async () => {
    const address = "latest-wins@example.com"
    const { message: first } = await createInboundMessage(db, {
      message: "Wednesday?",
      channel: "email",
      address,
    })
    const { message: second } = await createInboundMessage(db, {
      message: "Actually Thursday?",
      channel: "email",
      address,
    })

    await expect(
      upsertResponseDraft(
        db,
        first,
        { messageId: first.id, body: "Stale Wednesday reply" },
        null,
      ),
    ).resolves.toBeNull()
    await expect(
      upsertResponseDraft(
        db,
        second,
        { messageId: second.id, body: "Thursday works" },
        null,
      ),
    ).resolves.toMatchObject({ messageId: second.id })
  })

  test("rejects stale edits, approvals, and workflow revisions", async () => {
    const address = "client-race@example.com"
    const { message: first } = await createInboundMessage(db, {
      message: "First request",
      channel: "email",
      address,
    })
    const pending = await upsertResponseDraft(
      db,
      first,
      { messageId: first.id, body: "First draft" },
      null,
    )
    const { message: second } = await createInboundMessage(db, {
      message: "New information",
      channel: "email",
      address,
    })
    await expect(
      updateResponseDraftBody(
        db,
        pending!.id,
        "Outdated edit",
        pending!.revision,
      ),
    ).resolves.toBeNull()
    await expect(
      approveResponseDraft(db, pending!.id, pending!.revision),
    ).resolves.toBeNull()

    const current = await upsertResponseDraft(
      db,
      second,
      { messageId: second.id, body: "Current draft" },
      pending!.revision,
    )
    const edited = await updateResponseDraftBody(
      db,
      current!.id,
      "Human rewrite",
      current!.revision,
    )
    expect(edited?.body).toBe("Human rewrite")
    await expect(
      upsertResponseDraft(
        db,
        second,
        { messageId: second.id, body: "Stale workflow result" },
        current!.revision,
      ),
    ).resolves.toBeNull()
    await expect(
      approveResponseDraft(db, current!.id, current!.revision),
    ).resolves.toBeNull()
    await expect(
      approveResponseDraft(db, edited!.id, edited!.revision),
    ).resolves.toMatchObject({ createdAt: expect.any(Number) })
  })
})
