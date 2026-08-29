import { z } from "zod"

const GeocodeResultSchema = z.object({
  formatted_address: z.string().min(1),
  geometry: z.object({
    location: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
  }),
})

const GeocodeResponseSchema = z.object({
  status: z.string(),
  results: z.array(GeocodeResultSchema),
  error_message: z.string().optional(),
})

export type Coordinates = { lat: number; lng: number }

export type GeocodedAddress = {
  formattedAddress: string
  location: Coordinates
}

export type GeocodeResult =
  | { status: "found"; address: GeocodedAddress }
  | { status: "not_found" }

export interface AddressGeocoder {
  geocode(rawAddress: string): Promise<GeocodeResult>
}

export class GoogleGeocoder implements AddressGeocoder {
  private readonly apiKey: string
  private readonly fetcher: typeof fetch | undefined

  constructor(apiKey: string, fetcher?: typeof fetch) {
    if (apiKey === "") {
      throw new Error("GOOGLE_MAPS_API_KEY is required")
    }
    this.apiKey = apiKey
    this.fetcher = fetcher
  }

  async geocode(rawAddress: string): Promise<GeocodeResult> {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json")
    url.searchParams.set("address", rawAddress)
    url.searchParams.set("key", this.apiKey)

    // Call global fetch directly — storing `fetch` and invoking it unbound
    // throws Illegal invocation in Cloudflare Workers.
    const response =
      this.fetcher === undefined ? await fetch(url) : await this.fetcher(url)
    if (!response.ok) {
      throw new Error(`Google Geocoding HTTP ${response.status}`)
    }

    const parsed = GeocodeResponseSchema.parse(await response.json())
    if (parsed.status === "ZERO_RESULTS") {
      return { status: "not_found" }
    }
    if (parsed.status !== "OK") {
      const detail =
        parsed.error_message === undefined ? "" : `: ${parsed.error_message}`
      throw new Error(`Google Geocoding ${parsed.status}${detail}`)
    }

    const result = parsed.results[0]
    if (result === undefined) {
      throw new Error("Google Geocoding returned OK without a result")
    }
    return {
      status: "found",
      address: {
        formattedAddress: result.formatted_address,
        location: result.geometry.location,
      },
    }
  }
}
