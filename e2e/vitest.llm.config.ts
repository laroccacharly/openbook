import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const e2eDirectory = dirname(fileURLToPath(import.meta.url))
const repoDirectory = resolve(e2eDirectory, "..")

export default defineConfig({
  root: e2eDirectory,
  resolve: {
    alias: {
      "@infra": resolve(repoDirectory, "infra"),
      "@worker": resolve(repoDirectory, "worker"),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["llm/**/*.test.ts"],
    setupFiles: ["./setup.ts"],
    hookTimeout: 180_000,
    testTimeout: 180_000,
  },
})
