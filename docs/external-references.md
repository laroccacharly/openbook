# External references

This page is a curated map to the authoritative documentation for the external
platforms and libraries used by Book. Keep project behavior in code, tests, and
the root README rather than copying upstream documentation into this repository.

Package manifests and `bun.lock` are the source of truth for dependency
versions. Add a link here only when it is useful for operating or changing the
application; this is not intended to duplicate every package in the lockfile.

## Runtime and infrastructure

- [Bun documentation](https://bun.com/docs/)
- [Bun Secrets API](https://bun.com/docs/runtime/secrets)
- [Alchemy documentation](https://alchemy.run/)
- [Alchemy Cloudflare Workflow resource](https://alchemy.run/providers/cloudflare/workflows/workflow/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Cloudflare Workflows](https://developers.cloudflare.com/workflows/)
- [Cloudflare Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Cloudflare Email Workers](https://developers.cloudflare.com/email-routing/email-workers/)

## HTTP and application UI

- [Hono on Cloudflare Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Hono RPC and typed clients](https://hono.dev/docs/guides/rpc)
- [React](https://react.dev/reference/react)
- [Vite](https://vite.dev/guide/)
- [React Router](https://reactrouter.com/start/declarative/routing)
- [TanStack Query for React](https://tanstack.com/query/latest/docs/framework/react/overview)
- [shadcn/ui Vite installation](https://ui.shadcn.com/docs/installation/vite)
- [shadcn/ui Sidebar](https://ui.shadcn.com/docs/components/base/sidebar)
- [shadcn/ui chat components (June 2026)](https://ui.shadcn.com/docs/changelog/2026-06-chat-components)
- [shadcn/ui Message](https://ui.shadcn.com/docs/components/base/message)
- [shadcn/ui Bubble](https://ui.shadcn.com/docs/components/base/bubble)
- [shadcn/ui MessageScroller](https://ui.shadcn.com/docs/components/base/message-scroller)
- [shadcn/ui Marker](https://ui.shadcn.com/docs/components/base/marker)
- [`@shadcn/react` (headless MessageScroller)](https://www.npmjs.com/package/@shadcn/react)
- [TanStack Table](https://tanstack.com/table/latest/docs/overview) (v9)
- [TanStack Table v9 migration guide](https://tanstack.com/table/latest/docs/framework/react/guide/migrating)
- [shadcn/ui Data Table](https://ui.shadcn.com/docs/components/base/data-table)

## Language models

- [AI SDK](https://ai-sdk.dev/docs)
- [AI SDK structured data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [`workers-ai-provider`](https://www.npmjs.com/package/workers-ai-provider)
- [OpenRouter integration with the AI SDK](https://openrouter.ai/docs/guides/community/vercel-ai-sdk)
- [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs)
- [`@openrouter/ai-sdk-provider`](https://github.com/OpenRouterTeam/ai-sdk-provider)

## External services

- [Google OAuth 2.0 for web-server applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google Calendar Events API](https://developers.google.com/workspace/calendar/api/v3/reference/events)
- [Twilio Messages API](https://www.twilio.com/docs/messaging/api/message-resource)
- [Validating Twilio webhook requests](https://www.twilio.com/docs/usage/security#validating-requests)

## Testing and tooling

- [Vitest](https://vitest.dev/guide/)
- [Cloudflare Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [Playwright](https://playwright.dev/docs/intro)
- [Oxlint](https://oxc.rs/docs/guide/usage/linter.html)
- [Oxlint rules](https://oxc.rs/docs/guide/usage/linter/rules.html)
