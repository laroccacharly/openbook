import { Hono } from "hono"
import type { WorkerEnv } from "@infra/alchemy.run"
import { getWorkflow, getWorkflows } from "../db/workflows"
import { WorkflowRetryError, retryWorkflow } from "../workflows/retry"

function parseRecordId(raw: string): number | null {
  if (raw === "") {
    return null
  }
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    return null
  }
  return id
}

function retryErrorStatus(error: WorkflowRetryError): 404 | 409 {
  switch (error.reason) {
    case "not_found":
      return 404
    case "unsupported_record":
    case "ineligible_state":
      return 409
    default: {
      const exhaustive: never = error.reason
      return exhaustive
    }
  }
}

export const workflowsRouter = new Hono<{ Bindings: WorkerEnv }>()
  .get("/workflows", async (c) => {
    return c.json(await getWorkflows(c.env.DB))
  })
  .post("/workflows/:recordName/:recordId/retry", async (c) => {
    const recordId = parseRecordId(c.req.param("recordId"))
    if (recordId === null) {
      return c.json({ error: "Invalid record id" }, 400)
    }

    const recordName = c.req.param("recordName")
    if (recordName === "") {
      return c.json({ error: "Invalid record name" }, 400)
    }

    try {
      const outcome = await retryWorkflow(c.env.DB, c.env, {
        recordName,
        recordId,
      })
      if (outcome === "restarted") {
        return c.json({ outcome }, 202)
      }
      return c.json({ outcome })
    } catch (error) {
      if (error instanceof WorkflowRetryError) {
        return c.json({ error: error.message }, retryErrorStatus(error))
      }
      throw error
    }
  })
  .get("/workflows/:recordName/:recordId", async (c) => {
    const recordId = parseRecordId(c.req.param("recordId"))
    if (recordId === null) {
      return c.json({ error: "Invalid record id" }, 400)
    }
    const workflow = await getWorkflow(c.env.DB, {
      recordName: c.req.param("recordName"),
      recordId,
    })
    if (workflow === null) {
      return c.json({ error: "Workflow not found" }, 404)
    }
    return c.json(workflow)
  })
