import { exports } from "cloudflare:workers"
import { createApiClient } from "@worker/src/api-client"
import { TEST_BOOK_API_KEY } from "./api-key"

export const testApiClient = createApiClient("http://localhost", {
  apiKey: TEST_BOOK_API_KEY,
  fetch: exports.default.fetch.bind(exports.default),
})
