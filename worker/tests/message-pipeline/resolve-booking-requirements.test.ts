import { describe, expect, test, vi } from "vitest"
import type { AddressGeocoder } from "@worker/src/maps/google-geocoder"
import type { ServiceArea } from "@worker/src/maps/service-area"
import { resolveBookingRequirements } from "@worker/src/message-pipeline/resolve-booking-requirements"

const serviceArea: ServiceArea = {
  center: { lat: 45.5017, lng: -73.5673 },
  maxDistanceKm: 50,
  displayName: "downtown Montreal",
}

function geocoderAtCenter(): AddressGeocoder {
  return {
    geocode: async () => ({
      status: "found",
      address: {
        formattedAddress: "1000 R. Saint-Denis, Montréal, QC, Canada",
        location: serviceArea.center,
      },
    }),
  }
}

describe("resolveBookingRequirements", () => {
  test("returns every missing field without geocoding", async () => {
    const geocode = vi.fn<AddressGeocoder["geocode"]>()

    await expect(
      resolveBookingRequirements({
        extracted: { customer_name: null, address: null },
        addressGeocoder: { geocode },
        serviceArea,
      }),
    ).resolves.toEqual({
      status: "needs_information",
      missing: ["customer_name", "address"],
    })
    expect(geocode).not.toHaveBeenCalled()
  })

  test("returns one normalized, booking-ready value", async () => {
    await expect(
      resolveBookingRequirements({
        extracted: {
          customer_name: "John Doe",
          address: "1000 St Denis, Montreal",
        },
        addressGeocoder: geocoderAtCenter(),
        serviceArea,
      }),
    ).resolves.toEqual({
      status: "ready",
      value: {
        customerName: "John Doe",
        serviceAddress: "1000 R. Saint-Denis, Montréal, QC, Canada",
      },
    })
  })

  test("reports an unrecognized address as correctable input", async () => {
    const addressGeocoder: AddressGeocoder = {
      geocode: async () => ({ status: "not_found" }),
    }

    await expect(
      resolveBookingRequirements({
        extracted: { customer_name: "John Doe", address: "somewhere" },
        addressGeocoder,
        serviceArea,
      }),
    ).resolves.toEqual({
      status: "address_not_found",
      message: "Could not find address: somewhere",
    })
  })
})
