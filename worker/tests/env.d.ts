import type { D1Migration } from "@cloudflare/vitest-pool-workers"
import type { WorkerEnv } from "@infra/alchemy.run"

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      TEST_MIGRATIONS: D1Migration[]
    }

    interface GlobalProps {
      mainModule: typeof import("../src/index")
    }
  }
}

export {}
