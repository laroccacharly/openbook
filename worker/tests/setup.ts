import { env } from "cloudflare:workers"
import { applyD1Migrations, reset } from "cloudflare:test"
import { beforeEach } from "vitest"

beforeEach(async () => {
  await reset()
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
  // Production seed migration creates Seed Worker 1/2; unit tests need an empty roster.
  await env.DB.prepare(
    `DELETE FROM workers WHERE name IN ('Seed Worker 1', 'Seed Worker 2')`,
  ).run()
})
