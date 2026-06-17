// lib/qiblah.ts
//
// On-device Qiblah bearing — an EXACT replica of the backend's great-circle
// computation (index.js: computeQiblahBearing / bearingToCompass). A bearing is
// a fixed mathematical result, so this matches the server with zero drift and
// needs no network: the Qiblah works fully offline.

const KAABA_LAT = 21.4225;
const KAABA_LON = 39.8262;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function computeQiblahBearing(lat: number, lon: number): number {
  const kaabaLat = degToRad(KAABA_LAT);
  const kaabaLon = degToRad(KAABA_LON);
  const phi1 = degToRad(lat);
  const lambda1 = degToRad(lon);

  const y = Math.sin(kaabaLon - lambda1);
  const x =
    Math.cos(phi1) * Math.tan(kaabaLat) -
    Math.sin(phi1) * Math.cos(kaabaLon - lambda1);

  const theta = Math.atan2(y, x);
  return ((radToDeg(theta) % 360) + 360) % 360;
}

export function bearingToCompass(bearing: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round((((bearing % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

export type QiblahResult = {
  location: { lat: number; lon: number };
  kaaba: { lat: number; lon: number };
  bearing: number;
  direction: string;
  source: string;
  message: string;
};

/** Compute the full Qiblah result locally — same shape the API returned. */
export function computeQiblah(lat: number, lon: number): QiblahResult {
  const bearing = computeQiblahBearing(lat, lon);
  return {
    location: { lat, lon },
    kaaba: { lat: KAABA_LAT, lon: KAABA_LON },
    bearing,
    direction: bearingToCompass(bearing),
    source: "device-great-circle",
    message: "Qiblah direction calculated on your device.",
  };
}
