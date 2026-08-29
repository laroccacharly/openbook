import { Hono } from "hono"
import { validator } from "hono/validator"
import { z } from "zod"
import type { WorkerEnv } from "@infra/alchemy.run"
import {
  getResponseDraftByMessageId,
  updateResponseDraftBody,
} from "../db/response-drafts"
import { approveResponseDraftAndStartDelivery } from "../message-delivery/approve-response"
import { ApproveResponseDraftSchema, UpdateResponseDraftSchema } from "../types"

function parseId(raw: string): number | null {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export const responseDraftsRouter = new Hono<{ Bindings: WorkerEnv }>()
  .get("/response_drafts", async (c) => {
    const messageId = parseId(c.req.query("message_id") ?? "")
    if (messageId === null) {
      return c.json({ error: "Invalid message_id" }, 400)
    }
    const draft = await getResponseDraftByMessageId(c.env.DB, messageId)
    return draft === null
      ? c.json({ error: "Response draft not found" }, 404)
      : c.json(draft)
  })
  .post(
    "/response_drafts/:draftId/edit",
    validator("json", (value, c) => {
      const parsed = UpdateResponseDraftSchema.safeParse(value)
      return parsed.success
        ? parsed.data
        : c.json({ error: z.flattenError(parsed.error) }, 400)
    }),
    async (c) => {
      const draftId = parseId(c.req.param("draftId"))
      if (draftId === null) {
        return c.json({ error: "Invalid draft id" }, 400)
      }
      const input = c.req.valid("json")
      const draft = await updateResponseDraftBody(
        c.env.DB,
        draftId,
        input.body,
        input.revision,
      )
      return draft === null
        ? c.json({ error: "Conversation or draft has changed" }, 409)
        : c.json(draft)
    },
  )
  .post(
    "/response_drafts/:draftId/approve",
    validator("json", (value, c) => {
      const parsed = ApproveResponseDraftSchema.safeParse(value)
      return parsed.success
        ? parsed.data
        : c.json({ error: z.flattenError(parsed.error) }, 400)
    }),
    async (c) => {
      const draftId = parseId(c.req.param("draftId"))
      if (draftId === null) {
        return c.json({ error: "Invalid draft id" }, 400)
      }
      const response = await approveResponseDraftAndStartDelivery(
        c.env,
        draftId,
        c.req.valid("json").revision,
      )
      return response === null
        ? c.json({ error: "Conversation or draft has changed" }, 409)
        : c.json(response)
    },
  )
