import { Hono } from "hono"
import { validator } from "hono/validator"
import type { WorkerEnv } from "@infra/alchemy.run"
import { z } from "zod"
import {
  createCatalogJob,
  deleteCatalogJob,
  getCatalogJobById,
  getJobCatalog,
  updateCatalogJob,
} from "../db/job-catalog"
import {
  CatalogJobInputSchema,
  CatalogJobPatchSchema,
} from "../types/job-catalog"

function parseId(value: string): number | null {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export const jobCatalogRouter = new Hono<{ Bindings: WorkerEnv }>()
  .get("/job-catalog", async (c) => c.json(await getJobCatalog(c.env.DB)))
  .get("/job-catalog/:id", async (c) => {
    const id = parseId(c.req.param("id"))
    if (id === null) return c.json({ error: "Invalid job id" }, 400)
    const job = await getCatalogJobById(c.env.DB, id)
    return job === null ? c.json({ error: "Job not found" }, 404) : c.json(job)
  })
  .post(
    "/job-catalog",
    validator("json", (value, c) => {
      const parsed = CatalogJobInputSchema.safeParse(value)
      return parsed.success
        ? parsed.data
        : c.json({ error: z.flattenError(parsed.error) }, 400)
    }),
    async (c) =>
      c.json(await createCatalogJob(c.env.DB, c.req.valid("json")), 201),
  )
  .patch(
    "/job-catalog/:id",
    validator("json", (value, c) => {
      const parsed = CatalogJobPatchSchema.safeParse(value)
      return parsed.success
        ? parsed.data
        : c.json({ error: z.flattenError(parsed.error) }, 400)
    }),
    async (c) => {
      const id = parseId(c.req.param("id"))
      if (id === null) return c.json({ error: "Invalid job id" }, 400)
      const job = await updateCatalogJob(c.env.DB, id, c.req.valid("json"))
      return job === null
        ? c.json({ error: "Job not found" }, 404)
        : c.json(job)
    },
  )
  .delete("/job-catalog/:id", async (c) => {
    const id = parseId(c.req.param("id"))
    if (id === null) return c.json({ error: "Invalid job id" }, 400)
    const job = await deleteCatalogJob(c.env.DB, id)
    return job === null ? c.json({ error: "Job not found" }, 404) : c.json(job)
  })
