import * as Cloudflare from "alchemy/Cloudflare"
import * as Effect from "effect/Effect"

function emailBindings(emailAddress: string) {
  return Effect.gen(function* () {
    const EMAIL = yield* Cloudflare.Email.SendEmail("Email", {
      allowedSenderAddresses: [emailAddress],
    })
    return { EMAIL }
  })
}

export function EmailBindings(
  emailAddress: string,
): ReturnType<typeof emailBindings> {
  return emailBindings(emailAddress)
}
