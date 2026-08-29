export const contactMethodsQueryKey = ["contact-methods"] as const

export function conversationQueryKey(conversationId: number) {
  return ["conversation", conversationId] as const
}

export function customerBookingsQueryKey(customerId: number) {
  return ["customer-bookings", customerId] as const
}
