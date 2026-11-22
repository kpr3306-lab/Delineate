// Opt-in location tags: off by default; coordinates stay on the photo record in this browser.
const KEY = 'delineate-geo';

export function isGeoOn() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setGeoOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* private mode: the toggle just won't stick */
  }
}

/** The current position, or undefined if it is off, denied, unavailable or slower than 6 s. */
export function currentPlace(): Promise<{ lat: number; lon: number; acc: number } | undefined> {
  if (!isGeoOn() || !navigator.geolocation) return Promise.resolve(undefined);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(5), lon: +p.coords.longitude.toFixed(5), acc: Math.round(p.coords.accuracy) }),
      () => resolve(undefined),
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 5 * 60 * 1000 },
    ),
  );
}
