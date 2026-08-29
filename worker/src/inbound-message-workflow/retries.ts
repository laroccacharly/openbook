/** Cloudflare retries the step this many times after its initial attempt. */
export const MESSAGE_WORKFLOW_RETRY_LIMIT = 3

/** Total executions observed by persisted attempt counters and test polling. */
export const MESSAGE_WORKFLOW_MAX_ATTEMPTS = MESSAGE_WORKFLOW_RETRY_LIMIT + 1
