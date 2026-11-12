export interface Point {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres (haversine). Accurate to well under a metre at site scale. */
export function distanceMeters(a: Point, b: Point): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Phones report an accuracy circle; give at most this much benefit of the doubt. */
export const MAX_ACCURACY_ALLOWANCE_M = 50;

/**
 * Inside the geofence when the reported position, moved towards the site by its accuracy
 * (capped), falls within the radius. A position reported with 2 km accuracy gets no free pass.
 */
export function withinGeofence(distanceM: number, radiusM: number, accuracyM?: number): boolean {
  const allowance = Math.min(accuracyM ?? 0, MAX_ACCURACY_ALLOWANCE_M);
  return distanceM - allowance <= radiusM;
}
