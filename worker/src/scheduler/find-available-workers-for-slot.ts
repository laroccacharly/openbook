import {
  type FindAvailableWorkersForSlotRequest,
  type SchedulerContext,
  FindAvailableWorkersForSlotRequestSchema,
} from "../types/scheduler"
import { createSchedulerCore } from "./core"

export async function findAvailableWorkersForSlot(
  context: SchedulerContext,
  request: FindAvailableWorkersForSlotRequest,
): Promise<number[] | null> {
  const { durationMinutes, workerCount, startDatetime } =
    FindAvailableWorkersForSlotRequestSchema.parse(request)
  const endDatetime = new Date(
    startDatetime.getTime() + durationMinutes * 60_000,
  )
  const scheduler = await createSchedulerCore(context, {
    startDatetime,
    endDatetime,
  })
  return scheduler.findAvailableWorkers(
    startDatetime,
    durationMinutes,
    workerCount,
  )
}
