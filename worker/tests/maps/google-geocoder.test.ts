import { describe, expect, test } from "vitest"
import { GoogleGeocoder } from "@worker/src/maps/google-geocoder"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("GoogleGeocoder", () => {
  test("returns the formatted address and coordinates", async () => {
    const geocoder = new GoogleGeocoder("secret", async (input) => {
      const href =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      const url = new URL(href)
      expect(url.searchParams.get("address")).toBe("1000 St Denis, Montreal")
      expect(url.searchParams.get("key")).toBe("secret")
      return jsonResponse({
        status: "OK",
        results: [
          {
            formatted_address: "1000 R. Saint-Denis, Montréal, QC, Canada",
            geometry: { location: { lat: 45.516, lng: -73.56 } },
          },
        ],
      })
    })

    await expect(geocoder.geocode("1000 St Denis, Montreal")).resolves.toEqual({
      status: "found",
      address: {
        formattedAddress: "1000 R. Saint-Denis, Montréal, QC, Canada",
        location: { lat: 45.516, lng: -73.56 },
      },
    })
  })

  test("treats only ZERO_RESULTS as an address that was not found", async () => {
    const geocoder = new GoogleGeocoder("secret", async () =>
      jsonResponse({ status: "ZERO_RESULTS", results: [] }),
    )

    await expect(geocoder.geocode("missing")).resolves.toEqual({
      status: "not_found",
    })
  })

  test("throws provider errors instead of blaming the customer address", async () => {
    const geocoder = new GoogleGeocoder("secret", async () =>
      jsonResponse({
        status: "REQUEST_DENIED",
        results: [],
        error_message: "API key rejected",
      }),
    )

    await expect(geocoder.geocode("1000 St Denis")).rejects.toThrow(
      "Google Geocoding REQUEST_DENIED: API key rejected",
    )
  })
})
