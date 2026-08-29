import type { D1Database } from "@cloudflare/workers-types"

const DEFAULT_LEASE_DURATION_MS = 10_000
const DEFAULT_ACQUIRE_TIMEOUT_MS = 2_000
const DEFAULT_RETRY_DELAY_MS = 25

export type BookingLockLease = {
  owner: string
  fencingToken: number
  expiresAtMs: number
}

export type BookingLockOptions = {
  owner?: string
  leaseDurationMs?: number
  acquireTimeoutMs?: number
  retryDelayMs?: number
  now?: () => number
  sleep?: (durationMs: number) => Promise<void>
}

export class BookingLockTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Timed out acquiring booking lock after ${timeoutMs}ms`)
    this.name = "BookingLockTimeoutError"
  }
}

export async function tryAcquireBookingLock(
  db: D1Database,
  input: {
    owner: string
    nowMs: number
    leaseDurationMs: number
  },
): Promise<BookingLockLease | null> {
  const expiresAtMs = input.nowMs + input.leaseDurationMs
  const result = await db
    .prepare(
      `UPDATE booking_lock
       SET owner = ?,
           expires_at_ms = ?,
           fencing_token = fencing_token + 1
       WHERE id = 1
         AND (owner IS NULL OR expires_at_ms <= ?)
       RETURNING owner, expires_at_ms, fencing_token`,
    )
    .bind(input.owner, expiresAtMs, input.nowMs)
    .first<{
      owner: string
      expires_at_ms: number
      fencing_token: number
    }>()

  if (result === null) {
    return null
  }
  return {
    owner: result.owner,
    expiresAtMs: result.expires_at_ms,
    fencingToken: result.fencing_token,
  }
}

export async function releaseBookingLock(
  db: D1Database,
  lease: BookingLockLease,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE booking_lock
       SET owner = NULL, expires_at_ms = 0
       WHERE id = 1
         AND owner = ?
         AND fencing_token = ?
       RETURNING id`,
    )
    .bind(lease.owner, lease.fencingToken)
    .first()
  return result !== null
}

export async function withBookingLock<T>(
  db: D1Database,
  callback: (lease: BookingLockLease) => Promise<T>,
  options: BookingLockOptions = {},
): Promise<T> {
  const lease = await acquireBookingLock(db, options)
  return runWithBookingLease(db, lease, callback)
}

async function acquireBookingLock(
  db: D1Database,
  options: BookingLockOptions,
): Promise<BookingLockLease> {
  const owner = options.owner ?? crypto.randomUUID()
  const leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS
  const acquireTimeoutMs =
    options.acquireTimeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const now = options.now ?? Date.now
  const sleep =
    options.sleep ??
    ((durationMs: number) =>
      new Promise((resolve) => setTimeout(resolve, durationMs)))
  const deadlineMs = now() + acquireTimeoutMs

  for (;;) {
    const attemptNowMs = now()
    const lease = await tryAcquireBookingLock(db, {
      owner,
      nowMs: attemptNowMs,
      leaseDurationMs,
    })
    if (lease !== null) {
      return lease
    }

    const remainingMs = deadlineMs - now()
    if (remainingMs <= 0) {
      throw new BookingLockTimeoutError(acquireTimeoutMs)
    }
    await sleep(Math.min(retryDelayMs, remainingMs))
  }
}

async function runWithBookingLease<T>(
  db: D1Database,
  lease: BookingLockLease,
  callback: (lease: BookingLockLease) => Promise<T>,
): Promise<T> {
  try {
    return await callback(lease)
  } finally {
    await releaseBookingLock(db, lease)
  }
}
