import { APIError } from "better-auth/api"
import type { D1Database } from "@cloudflare/workers-types"
import type { WorkerEnv } from "@infra/alchemy.run"
import { createAuth } from "./better-auth"

const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*"

function appendRandomCharacters(password: string, length: number): string {
  const limit = 256 - (256 % PASSWORD_ALPHABET.length)
  const random = new Uint8Array(length - password.length)
  crypto.getRandomValues(random)
  return (
    password +
    Array.from(random)
      .filter((value) => value < limit)
      .map((value) => PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length])
      .join("")
  )
}

export class WorkerAccountProvisionError extends Error {
  readonly code: "worker_not_found" | "account_exists" | "email_exists"

  constructor(
    code: "worker_not_found" | "account_exists" | "email_exists",
    message: string,
  ) {
    super(message)
    this.code = code
    this.name = "WorkerAccountProvisionError"
  }
}

export function generateTemporaryPassword(length = 24): string {
  if (!Number.isInteger(length) || length < 16) {
    throw new Error("Temporary passwords must contain at least 16 characters")
  }
  let password = ""
  while (password.length < length) {
    password = appendRandomCharacters(password, length)
  }
  return password
}

async function assertCanProvision(
  db: D1Database,
  workerId: number,
  email: string,
): Promise<{ name: string }> {
  const worker = await db
    .prepare("SELECT name, better_auth_user_id FROM workers WHERE id = ?")
    .bind(workerId)
    .first<{ name: string; better_auth_user_id: string | null }>()
  if (worker === null) {
    throw new WorkerAccountProvisionError(
      "worker_not_found",
      "Worker not found",
    )
  }
  if (worker.better_auth_user_id !== null) {
    throw new WorkerAccountProvisionError(
      "account_exists",
      "This worker already has an account",
    )
  }
  const existingEmail = await db
    .prepare('SELECT id FROM "user" WHERE lower(email) = lower(?) LIMIT 1')
    .bind(email)
    .first()
  if (existingEmail !== null) {
    throw new WorkerAccountProvisionError(
      "email_exists",
      "That email address already has an account",
    )
  }
  return { name: worker.name }
}

export async function provisionWorkerAccount(
  env: WorkerEnv,
  workerId: number,
  email: string,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<{ email: string; temporaryPassword: string }> {
  const normalizedEmail = email.trim().toLowerCase()
  const worker = await assertCanProvision(env.DB, workerId, normalizedEmail)
  const temporaryPassword = generateTemporaryPassword()
  const auth = createAuth(env, waitUntil)

  let created: Awaited<ReturnType<typeof auth.api.createUser>>
  try {
    created = await auth.api.createUser({
      body: {
        name: worker.name,
        email: normalizedEmail,
        password: temporaryPassword,
      },
    })
  } catch (error) {
    if (error instanceof APIError && error.status === "BAD_REQUEST") {
      throw new WorkerAccountProvisionError(
        "email_exists",
        "That email address already has an account",
      )
    }
    throw error
  }

  const linked = await env.DB.prepare(
    `UPDATE workers
     SET better_auth_user_id = ?, must_change_password = 1
     WHERE id = ? AND better_auth_user_id IS NULL`,
  )
    .bind(created.user.id, workerId)
    .run()
  if (linked.meta.changes !== 1) {
    throw new WorkerAccountProvisionError(
      "account_exists",
      "This worker already has an account",
    )
  }

  return {
    email: created.user.email,
    temporaryPassword,
  }
}
