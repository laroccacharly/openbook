import { defineConfig } from "@playwright/test"
import { resolveDeploymentOrigin } from "../infra/deployment-context"
import { resolveCloudflareIpv4 } from "./cloudflare-dns-fetch"

const baseURL = resolveDeploymentOrigin()
const deploymentHostname = new URL(baseURL).hostname
const deploymentAddress = await resolveCloudflareIpv4(deploymentHostname)

export default defineConfig({
  testDir: "./ui",
  timeout: 30_000,
  use: {
    baseURL,
    headless: true,
    launchOptions: {
      args: [
        `--host-resolver-rules=MAP ${deploymentHostname} ${deploymentAddress}`,
      ],
    },
  },
})
