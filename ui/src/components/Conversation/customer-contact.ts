import type { ContactMethodSummary } from "@/lib/api/client"

export function conversationContactLabel(
  contactMethod: ContactMethodSummary,
): string {
  const parts = [contactMethod.customerName, contactMethod.address].filter(
    (value): value is string => value !== null && value !== "",
  )
  return parts.join(" · ")
}

export function contactMethodSendTarget(contactMethod: ContactMethodSummary): {
  channel: "email" | "sms"
  address: string
} {
  return { channel: contactMethod.channel, address: contactMethod.address }
}
