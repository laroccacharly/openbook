import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const uiDirectory = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  cacheDir: resolve(uiDirectory, "../node_modules/.vite/ui"),
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": resolve(uiDirectory, "./src"),
      "@infra": resolve(uiDirectory, "../infra"),
      "@worker": resolve(uiDirectory, "../worker"),
    },
  },
})
