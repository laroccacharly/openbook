import { MONTREAL_SERVICE_AREA } from "./maps/service-area"

export const BOOKING_REQUIREMENT_KEYS = ["customer_name", "address"] as const

export type BookingRequirementItem = (typeof BOOKING_REQUIREMENT_KEYS)[number]

/** Fields that must appear in the customer message text. */
export const BOOKING_MESSAGE_FIELD_INSTRUCTIONS = {
  customer_name: "the customer's full name",
  address:
    `a complete street address with street number and name within ` +
    `${MONTREAL_SERVICE_AREA.maxDistanceKm}km of ${MONTREAL_SERVICE_AREA.displayName}`,
} as const satisfies Record<BookingRequirementItem, string>
