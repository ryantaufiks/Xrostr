import { attendance } from './i18n/messages/attendance';
import { currentLocale } from './i18n/state';

/**
 * Where a scanned Xrostr QR code leads inside the app: a site check-in poster or a patrol
 * checkpoint tag. Accepts a full URL or a bare path; null for anything else.
 */
export function scanTarget(text: string): string | null {
  try {
    const url = new URL(text, window.location.origin);
    if (url.pathname.endsWith('/checkin')) {
      const locationId = url.searchParams.get('l');
      const code = url.searchParams.get('c');
      return locationId && code
        ? `/tenant/checkin?l=${encodeURIComponent(locationId)}&c=${encodeURIComponent(code)}`
        : null;
    }
    if (url.pathname.endsWith('/patrol')) {
      const tag = url.searchParams.get('k');
      return tag ? `/tenant/patrol/scan?k=${encodeURIComponent(tag)}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

export interface Position {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/** One precise GPS reading, or a reason the officer can act on. */
export function currentPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error(attendance[currentLocale()].noGeolocation));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (error) =>
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? attendance[currentLocale()].locationDenied
              : attendance[currentLocale()].locationUnavailable,
          ),
        ),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}

/** A GPS reading when one comes quickly, else null: patrol scans never wait on a weak signal. */
export async function positionIfAvailable(timeoutMs = 8_000): Promise<Position | null> {
  if (!navigator.geolocation) return null;
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15_000 },
    ),
  );
}
