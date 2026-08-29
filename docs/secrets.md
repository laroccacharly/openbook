# Local development secrets

Book reads secrets only from the environment. It does not decrypt a local
store and does not persist generated values.

Secret values must not be committed in plaintext.

## Names

Recognized names live in `secrets/catalog.ts`. The repository-root
`.env.example` lists one empty `NAME=` line per catalog entry.

## Generated values

`bun auth gen-secret`, `bun infra gen-api-key`, and
`bun infra setup-stripe-webhook` write the secret to stdout and stop. Put that
value in the environment before running a command that needs it.
