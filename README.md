# Book

Book automates inbound leads (via email or SMS). It generates reliable responses using structured LLM tasks instead of soft rules in a system prompt.

The system can create, reschedule, and cancel bookings, or answer questions. Booking scheduling is grounded in a scheduling algorithm that guarantees availability and business rules.

Book relies heavily on end-to-end tests with an LLM in the loop to ensure reliable behavior.

# Infra

The infrastructure is built on Cloudflare for all of its components (except Twilio for handling SMS). We use Alchemy for Infrastructure as Code (IaC). We use D1 for the database, and email is handled by Cloudflare. 

## Setup

Install workspace dependencies:

```sh
bun install
```

# Secrets

Credentials come only from the environment. Names are listed in `.env.example`.

## Commands

```sh
bun lint
bun infra --help
bun infra zone list
bun infra zone set example.com
bun infra up
bun sms setup-webhook
bun email setup-inbound
```

Select a Cloudflare zone before deploying. SMS and email webhooks target the
current deployment; email routing is a confirmed cutover and is not changed by
`bun infra up`.

# Tests

```sh
bun run test unit
bun run test ui
bun run test llm
```

A path and `-t pattern` filter a subset.

## Unit

Vitest against the Worker in Miniflare. No live Cloudflare account.

`bun run test coverage` is the same suite with a 100% function-coverage gate on db and scheduler.

## UI

Playwright against the selected deployment. Install Chromium with
`bun setup:playwright`. Needs `BOOK_API_KEY`, `ADMIN_PASSWORD`, and
`STRIPE_TEST_SECRET_KEY`.

## LLM

Integration tests with models in the loop against the live Worker. Needs
`BOOK_API_KEY`.

## References

See [external references](docs/external-references.md) for the authoritative
documentation of the platforms, APIs, and major libraries used by Book.

## License

Book is available under the [MIT License](LICENSE).
