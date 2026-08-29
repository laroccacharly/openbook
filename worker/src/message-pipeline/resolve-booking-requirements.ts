import { type BookingRequirementItem } from "../booking-requirements"
import type { AddressGeocoder } from "../maps/google-geocoder"
import { resolveServiceAddress, type ServiceArea } from "../maps/service-area"
import type { ExtractedCustomerInformation } from "../types/llm-task-results"

export type { BookingRequirementItem }
export type BookingRequirements = {
  customerName: string
  serviceAddress: string
}

export type BookingRequirementsResolution =
  | { status: "ready"; value: BookingRequirements }
  | {
      status: "needs_information"
      missing: BookingRequirementItem[]
    }
  | { status: "address_not_found"; message: string }
  | { status: "outside_service_area"; message: string }

export async function resolveBookingRequirements(options: {
  extracted: ExtractedCustomerInformation
  addressGeocoder: AddressGeocoder
  serviceArea: ServiceArea
}): Promise<BookingRequirementsResolution> {
  const customerName = options.extracted.customer_name
  const rawAddress = options.extracted.address
  const missing: BookingRequirementItem[] = []
  if (customerName === null) {
    missing.push("customer_name")
  }
  if (rawAddress === null) {
    missing.push("address")
    return { status: "needs_information", missing }
  }

  const address = await resolveServiceAddress(
    options.addressGeocoder,
    rawAddress,
    options.serviceArea,
  )
  if (address.status === "not_found") {
    return { status: "address_not_found", message: address.message }
  }
  if (address.status === "outside_service_area") {
    return { status: "outside_service_area", message: address.message }
  }
  if (customerName === null) {
    return { status: "needs_information", missing }
  }

  return {
    status: "ready",
    value: {
      customerName,
      serviceAddress: address.address,
    },
  }
}
