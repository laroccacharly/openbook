# Book 
- Ask the user for confirmation before changing the AGENTS.md file. 
- After you complete a minor backend change or any UI change, run `bun infra up` to deploy it.  

# Stack 
- Bun/TypeScript for top-level orchestration
- Alchemy for IaC, in infra/
- Cloudflare Worker with Hono, in worker/ 
- sms and email folders for stand alone inbounds 
- Vite react, in ui/ 
- vitest for ts tests. 
- Use commander for cli

# Docs 
- Docs are in docs/ folder

# Workflow 
On a new machine (or after lockfile changes):

bun install
bun setup:playwright
bun lint
bun format

# Format
`bun format` runs oxfmt. `bun format --check` verifies without writing.

# Infra
Run `bun infra --help` to learn how to use the infra CLI.

# Secrets
- Secrets come only from the environment. Book never decrypts SOPS and never calls `cpass`.
- Run all Book commands as `cpass run -- <command>` from the repo root (names from `.env.example`).
- To add or rotate a secret: `cpass sops set`; never from Book code.
- When a Book command writes a secret to stdout (`bun auth gen-secret`, `bun infra gen-api-key`, `bun infra setup-stripe-webhook`), pipe it into cpass so the value never appears in the terminal or chat:

```sh
cpass sops set BOOK_API_KEY --value "$(bun infra gen-api-key)"
```

- Do not print or echo the secret. Then re-run under `cpass run`.
- On Linux, unlock first: `cpass sops unlock`.

# Live API
Use `bun api` to investigate the live deployment — inspect bookings, messages, config, workflows, and other production state without wiring auth or origin yourself (`api/`).

bun api methods
bun api call listBookings
bun api call getBooking --args 2

Prefer `bun api call` over `exec` — it only invokes typed api-client methods. Use `bun api exec` when you need to chain calls or run logic that `call` cannot express.

# Auth
`bun run auth gen-migration` refreshes `auth/migration.sql` from `auth/better-auth.schema.ts` for reference only. Applied D1 migrations live in `worker/migrations/` and are written manually—diff against the reference when Better Auth config changes.

# Testing
uses bun/vitest
Each one has path/`-t` filters to debug [-t pattern] — the full suite is slow.
bun run test unit
bun run test e2e
bun run test ui
bun run test llm

## Coverage 
bun run test coverage
Only requirement: 100% function coverage 

# Alchemy
Weekly from `infra/`: bump the alchemy pin, then from the repo root run `bun install --force`. Plain `bun install` / `bun update` reuse the cached CLI binary. Delete `infra/.alchemy/version-check.json` after upgrading so a stale npm dist-tag cache does not warn that an older version is newer. Bump this stamp when you do.
Last Alchemy update: 2026-08-29 — alchemy@2.0.0-beta.74 (distilled cloudflare@1.0.0-rc.6; runtime is now @alchemy.run/cloudflare-runtime)
- workerd is overrided to 20260730 because of max compat date 2026-07-29 mismatch. See in the future if we can avoid that.
