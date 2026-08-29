import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type { Redacted } from "effect/Redacted"
import { SMS_SECRET_NAMES } from "@book/secrets/catalog"

export const SmsBindings = Effect.gen(function* () {
  const bindings: Partial<
    Record<(typeof SMS_SECRET_NAMES)[number], Redacted<string>>
  > = {}

  for (const name of SMS_SECRET_NAMES) {
    const value = yield* Config.option(Config.redacted(name))
    if (Option.isNone(value)) continue
    bindings[name] = value.value
  }

  return bindings
})
