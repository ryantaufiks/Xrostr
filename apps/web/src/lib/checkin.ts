import { attendance } from './i18n/messages/attendance';
import { currentLocale } from './i18n/state';

/** Reads the site and code from a scanned QR text: a full URL or a bare `/checkin?…` path. */
export function parseCheckinQr(text: string): { locationId: string; code: string } | null {
  try {
    const url = new URL(text, window.location.origin);
    if (!url.pathname.endsWith('/checkin')) return null;
    const locationId = url.searchParams.get('l');
    const code = url.searchParams.get('c');
    return locationId && code ? { locationId, code } : null;
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
