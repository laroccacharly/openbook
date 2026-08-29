import { findNextAvailableSlot } from "../scheduler"
import type { PipelineContext } from "./context"

export async function findNextAvailable(
  ctx: PipelineContext,
  durationMinutes: number,
  workerCount: number,
): Promise<Date> {
  await ctx.setStage("find_next_available")
  const slot = await findNextAvailableSlot(
    { db: ctx.db, clock: ctx.clock },
    { durationMinutes, workerCount },
  )
  if (!slot.success) {
    throw new Error(slot.message)
  }
  return slot.startDatetime
}
