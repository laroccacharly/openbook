import {
  buildExtractDatetimesSystemPrompt,
  runExtractDatetimes,
} from "../llm-tasks/extract-datetimes"
import {
  buildExtractJobSystemPrompt,
  runExtractJob,
} from "../llm-tasks/extract-job"
import {
  buildExtractRequiredInformationSystemPrompt,
  runExtractRequiredInformation,
} from "../llm-tasks/extract-required-information"
import {
  businessLocalContext,
  businessLocalToUtc,
  humanReadableDatetime,
} from "../time"
import type {
  JobDetails,
  PreferredDatetime,
  ExtractedCustomerInformation,
} from "../types/llm-task-results"
import type { PipelineContext } from "./context"
import { runPersistedTask } from "./persisted-task"

export type PipelinePreferredDatetime = PreferredDatetime & {
  display: string | null
}

export type PreferredDatetimesDetails = {
  preferred_datetimes: PipelinePreferredDatetime[]
}

export type BookingDetails = {
  preferredDatetimes: PreferredDatetimesDetails
  customerInformation: ExtractedCustomerInformation
  job: JobDetails | null
}

function preferredDatetimesForState(
  preferredDatetimes: PreferredDatetime[],
  timezone: string,
): PipelinePreferredDatetime[] {
  return preferredDatetimes.map((preferredDatetime) => ({
    ...preferredDatetime,
    display:
      preferredDatetime.time === null
        ? null
        : humanReadableDatetime(
            businessLocalToUtc(
              preferredDatetime.date,
              preferredDatetime.time,
              timezone,
            ),
            timezone,
          ),
  }))
}

export async function extractPreferredDatetimes(
  ctx: PipelineContext,
): Promise<PreferredDatetimesDetails> {
  const localContext = businessLocalContext(ctx.clock.now(), ctx.timezone)
  const preferredDatetimes = await runPersistedTask({
    db: ctx.db,
    messageId: ctx.messageId,
    taskType: "extract_datetimes",
    languageModelId: ctx.languageModelId,
    systemPrompt: buildExtractDatetimesSystemPrompt(
      ctx.masterSystemPrompt,
      localContext,
    ),
    run: async () => {
      const { result } = await runExtractDatetimes(
        ctx.languageModel,
        ctx.conversation,
        ctx.masterSystemPrompt,
        localContext,
      )
      return result
    },
  })

  return {
    preferred_datetimes: preferredDatetimesForState(
      preferredDatetimes.preferred_datetimes,
      ctx.timezone,
    ),
  }
}

export async function extractBookingDetails(
  ctx: PipelineContext,
): Promise<BookingDetails> {
  const [preferredDatetimes, customerInformation, extractJob] =
    await Promise.all([
      extractPreferredDatetimes(ctx),
      runPersistedTask({
        db: ctx.db,
        messageId: ctx.messageId,
        taskType: "extract_required_information",
        languageModelId: ctx.languageModelId,
        systemPrompt: buildExtractRequiredInformationSystemPrompt(
          ctx.masterSystemPrompt,
        ),
        run: async () => {
          const { result } = await runExtractRequiredInformation(
            ctx.languageModel,
            ctx.conversation,
            ctx.masterSystemPrompt,
          )
          return result
        },
      }),
      runPersistedTask({
        db: ctx.db,
        messageId: ctx.messageId,
        taskType: "extract_job",
        languageModelId: ctx.languageModelId,
        systemPrompt: buildExtractJobSystemPrompt(
          ctx.masterSystemPrompt,
          ctx.jobCatalog,
        ),
        run: async () => {
          const { result } = await runExtractJob(
            ctx.languageModel,
            ctx.conversation,
            ctx.masterSystemPrompt,
            ctx.jobCatalog,
          )
          return result
        },
      }),
    ])

  return {
    preferredDatetimes,
    customerInformation,
    job: extractJob.job,
  }
}
