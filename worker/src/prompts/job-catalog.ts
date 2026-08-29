import type { CatalogJob } from "../types/job-catalog"

function formatDuration(durationMinutes: number): string {
  if (durationMinutes % 60 === 0) {
    const hours = durationMinutes / 60
    return hours === 1 ? "1 hour" : `${hours} hours`
  }
  return `${durationMinutes} minutes`
}

function formatWorkers(workerCount: number): string {
  return workerCount === 1 ? "1 worker" : `${workerCount} workers`
}

function formatCatalogJob(job: CatalogJob): string {
  return (
    `- ${job.name}, ${job.estimatedPriceCents} cents, ` +
    `${formatDuration(job.durationMinutes)}, ${formatWorkers(job.workerCount)}`
  )
}

export function formatJobCatalogForPrompt(jobs: readonly CatalogJob[]): string {
  return "Jobs that we support are:\n" + jobs.map(formatCatalogJob).join("\n")
}

export function formatJobCatalogNamesForPrompt(
  jobs: readonly CatalogJob[],
): string {
  return (
    "Jobs that we support are:\n" +
    jobs.map((job) => `- ${job.name}`).join("\n")
  )
}
