import { BOOKING_MESSAGE_FIELD_INSTRUCTIONS } from "../booking-requirements"
import type { CatalogJob } from "../types/job-catalog"
import { formatJobCatalogNamesForPrompt } from "./job-catalog"
import type { BusinessLocalContext } from "../types/llm-task-results"

export function buildBookingDescriptionPrompt(
  context: BusinessLocalContext,
  jobCatalog: readonly CatalogJob[],
): string {
  const messageFields = Object.values(BOOKING_MESSAGE_FIELD_INSTRUCTIONS).join(
    "; ",
  )
  return (
    "Generate one realistic, concise booking request for a home service.\n" +
    `${formatJobCatalogNamesForPrompt(jobCatalog)}\n` +
    "Pick one of the catalog jobs above. " +
    "Include a future date and explicit clock time, " +
    `${messageFields}. ` +
    "Resolve relative phrases using this business-local context:\n" +
    `timezone: ${context.timezone}\n` +
    `now_local: ${context.nowLocal}\n` +
    `weekday: ${context.weekday}\n` +
    "Return only the request."
  )
}
