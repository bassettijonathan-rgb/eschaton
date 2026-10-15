/**
 * The A6 projection: the world as a 2:1 equirectangular map centred on
 * Greenwich, laid across the four courts. Court 6 holds roughly 180°W–90°W,
 * Court 7 90°W–0°, Court 8 0°–90°E and Court 9 90°E–180°.
 */
import { THEATER_LENGTH, THEATER_WIDTH, courtAtPoint, type CourtNumber } from './theater';
import type { LonLat } from './types';

/** Mean equatorial circumference, km. */
export const EARTH_CIRCUMFERENCE_KM = 40_075;

/** Court metres per degree, the same on both axes. */
export const METRES_PER_DEGREE = THEATER_WIDTH / 360;

/** Map kilometres per court metre along the equator (about 548). */
export const KM_PER_COURT_METRE = EARTH_CIRCUMFERENCE_KM / THEATER_WIDTH;

export interface CourtPoint {
  /** Metres east of the theater centre. */
  readonly x: number;
  /** Metres north of the theater centre. */
  readonly y: number;
}

export function project({ lon, lat }: LonLat): CourtPoint {
  return { x: lon * METRES_PER_DEGREE, y: lat * METRES_PER_DEGREE };
}

export function unproject({ x, y }: CourtPoint): LonLat {
  return { lon: x / METRES_PER_DEGREE, lat: y / METRES_PER_DEGREE };
}

/** A map distance (km) as a court distance (m), at the equator's scale. */
export function kmToCourtMetres(km: number): number {
  return km / KM_PER_COURT_METRE;
}

export function courtMetresToKm(m: number): number {
  return m * KM_PER_COURT_METRE;
}

/** Which court a map position lies on. */
export function courtForLonLat(p: LonLat): CourtNumber | undefined {
  const { x, y } = project(p);
  return courtAtPoint(x, y)?.number;
}

/** Great-circle distance in km between two map positions. */
export function greatCircleKm(a: LonLat, b: LonLat): number {
  const r = EARTH_CIRCUMFERENCE_KM / (2 * Math.PI);
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Where you end up going `km` from `from` on an initial compass bearing (degrees clockwise from north). */
export function destinationPoint(from: LonLat, bearingDeg: number, km: number): LonLat {
  const r = EARTH_CIRCUMFERENCE_KM / (2 * Math.PI);
  const rad = Math.PI / 180;
  const d = km / r;
  const b = bearingDeg * rad;
  const lat1 = from.lat * rad;
  const lon1 = from.lon * rad;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  const lon = ((((lon2 / rad + 540) % 360) + 360) % 360) - 180;
  return { lon, lat: lat2 / rad };
}

// The theater is exactly 2:1, so one degree is the same length both ways.
if (Math.abs(THEATER_LENGTH / 180 - METRES_PER_DEGREE) > 1e-9) {
  throw new Error('theater is not 2:1');
}
