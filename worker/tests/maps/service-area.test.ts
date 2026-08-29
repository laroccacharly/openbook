import { describe, expect, test } from "vitest"
import type { AddressGeocoder } from "@worker/src/maps/google-geocoder"
import {
  distanceKm,
  resolveServiceAddress,
  type ServiceArea,
} from "@worker/src/maps/service-area"

const serviceArea: ServiceArea = {
  center: { lat: 45.5017, lng: -73.5673 },
  maxDistanceKm: 50,
  displayName: "downtown Montreal",
}

function foundAt(lat: number, lng: number): AddressGeocoder {
  return {
    geocode: async () => ({
      status: "found",
      address: {
        formattedAddress: "Resolved address",
        location: { lat, lng },
      },
    }),
  }
}

describe("resolveServiceAddress", () => {
  test("accepts an address exactly at the configured boundary", async () => {
    const location = { lat: 46, lng: -73.5673 }
    const exactBoundary = {
      ...serviceArea,
      maxDistanceKm: distanceKm(serviceArea.center, location),
    }

    await expect(
      resolveServiceAddress(
        foundAt(location.lat, location.lng),
        "boundary",
        exactBoundary,
      ),
    ).resolves.toMatchObject({
      status: "resolved",
      address: "Resolved address",
    })
  })

  test("rejects an address beyond the configured boundary", async () => {
    const result = await resolveServiceAddress(
      foundAt(43.6532, -79.3832),
      "Toronto",
      serviceArea,
    )

    expect(result).toMatchObject({ status: "outside_service_area" })
  })

  test("keeps an unrecognized address distinct from an ineligible one", async () => {
    const geocoder: AddressGeocoder = {
      geocode: async () => ({ status: "not_found" }),
    }

    await expect(
      resolveServiceAddress(geocoder, "unclear address", serviceArea),
    ).resolves.toEqual({
      status: "not_found",
      message: "Could not find address: unclear address",
    })
  })
})
