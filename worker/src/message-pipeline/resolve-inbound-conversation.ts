import type { D1Database } from "@cloudflare/workers-types"
import { getOrCreateContactMethod } from "../db/contact-methods"
import { getOrCreateConversation } from "../db/conversations"
import { linkCustomerToContact } from "../db/customers"
import {
  type ContactMethodChannel,
  type ContactMethodKey,
} from "../types/contact-method"

function defaultCustomerName(
  channel: ContactMethodChannel,
  address: string,
): string | null {
  switch (channel) {
    case "email": {
      const localPart = address.split("@").at(0)?.trim()
      if (localPart === undefined || localPart === "") {
        return address
      }
      return localPart
    }
    case "sms":
      return null
    default: {
      const exhaustive: never = channel
      throw new Error(`Unhandled channel: ${String(exhaustive)}`)
    }
  }
}

export async function resolveInboundConversation(
  db: D1Database,
  input: ContactMethodKey,
): Promise<number> {
  const contactMethod = await getOrCreateContactMethod(
    db,
    input.channel,
    input.address,
  )
  const conversation = await getOrCreateConversation(db, contactMethod.id)
  await linkCustomerToContact(
    db,
    contactMethod,
    defaultCustomerName(input.channel, input.address),
  )
  return conversation.id
}
