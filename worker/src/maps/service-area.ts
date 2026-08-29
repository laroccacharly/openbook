import type { AddressGeocoder, Coordinates } from "./google-geocoder"

export type ServiceArea = {
  center: Coordinates
  maxDistanceKm: number
  displayName: string
}

export const MONTREAL_SERVICE_AREA: ServiceArea = {
  center: { lat: 45.5017, lng: -73.5673 },
  maxDistanceKm: 50,
  displayName: "downtown Montreal",
}

export type ServiceAddressResolution =
  | {
      status: "resolved"
      address: string
      distanceKm: number
    }
  | { status: "not_found"; message: string }
  | { status: "outside_service_area"; message: string }

export function distanceKm(
  origin: Coordinates,
  destination: Coordinates,
): number {
  const earthRadiusKm = 6371
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const phi1 = toRadians(origin.lat)
  const phi2 = toRadians(destination.lat)
  const dPhi = toRadians(destination.lat - origin.lat)
  const dLambda = toRadians(destination.lng - origin.lng)
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a))
}

export async function resolveServiceAddress(
  geocoder: AddressGeocoder,
  rawAddress: string,
  serviceArea: ServiceArea,
): Promise<ServiceAddressResolution> {
  const geocoded = await geocoder.geocode(rawAddress)
  if (geocoded.status === "not_found") {
    return {
      status: "not_found",
      message: `Could not find address: ${rawAddress}`,
    }
  }

  const resolvedDistanceKm = distanceKm(
    serviceArea.center,
    geocoded.address.location,
  )
  if (resolvedDistanceKm > serviceArea.maxDistanceKm) {
    return {
      status: "outside_service_area",
      message:
        `That address is ${resolvedDistanceKm.toFixed(1)}km from ${serviceArea.displayName} ` +
        `(${geocoded.address.formattedAddress}), outside our ` +
        `${serviceArea.maxDistanceKm}km service area.`,
    }
  }

  return {
    status: "resolved",
    address: geocoded.address.formattedAddress,
    distanceKm: resolvedDistanceKm,
  }
}
