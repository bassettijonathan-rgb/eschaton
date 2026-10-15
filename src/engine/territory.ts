/**
 * The political map: which owner's territory a map position lies in.
 * Built from Natural Earth's 1:110m countries (world-atlas).
 */
import type { Feature, Geometry, Position } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import countries110m from 'world-atlas/countries-110m.json';
import { EAST_GERMANY, OWNER_BY_COUNTRY } from './data/territories';
import type { LonLat, OwnerId } from './types';

export interface Territory {
  readonly countryId: string;
  readonly name: string;
  readonly owner: OwnerId | undefined;
  /** Each polygon is a list of rings; the first ring is the outline, the rest are holes. */
  readonly polygons: readonly (readonly (readonly Position[])[])[];
  readonly bbox: readonly [number, number, number, number];
}

type CountryProps = { name: string };

function bboxOf(polygons: Territory['polygons']): Territory['bbox'] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const poly of polygons)
    for (const [lon = 0, lat = 0] of poly[0] ?? []) {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  return [minLon, minLat, maxLon, maxLat];
}

/**
 * A ring that crosses the antimeridian (eastern Russia, Fiji) jumps from +180
 * to -180 and back. Shift its western half east by 360° so it is one closed
 * shape spanning past 180; lookups then try a point at lon and at lon + 360.
 * Antarctica's ring circles the pole (one jump) and is left alone.
 */
function unwrapRing(ring: Position[]): Position[] {
  let jumps = 0;
  for (let k = 1; k < ring.length; k++) {
    if (Math.abs((ring[k]?.[0] ?? 0) - (ring[k - 1]?.[0] ?? 0)) > 180) jumps++;
  }
  if (jumps !== 2) return ring;
  return ring.map(([lon = 0, lat = 0]) => [lon < 0 ? lon + 360 : lon, lat]);
}

function loadTerritories(): Territory[] {
  const topology = countries110m as unknown as Topology<{
    countries: GeometryCollection<CountryProps>;
  }>;
  const fc = feature(topology, topology.objects.countries);
  return fc.features.map((f: Feature<Geometry | null, CountryProps>) => {
    const geom = f.geometry;
    const polygons: Position[][][] =
      geom?.type === 'Polygon'
        ? [geom.coordinates]
        : geom?.type === 'MultiPolygon'
          ? geom.coordinates
          : [];
    const countryId = String(f.id ?? '');
    const unwrapped = polygons.map((rings) => rings.map(unwrapRing));
    return {
      countryId,
      name: f.properties.name,
      owner: OWNER_BY_COUNTRY[countryId],
      polygons: unwrapped,
      bbox: bboxOf(unwrapped),
    };
  });
}

export const TERRITORIES: readonly Territory[] = loadTerritories();

const EAST_GERMANY_RING: Position[] = EAST_GERMANY.map((p) => [p.lon, p.lat]);

function inRing(lon: number, lat: number, ring: readonly Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi = 0, yi = 0] = ring[i] ?? [];
    const [xj = 0, yj = 0] = ring[j] ?? [];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(lon: number, lat: number, rings: readonly (readonly Position[])[]): boolean {
  const [outer, ...holes] = rings;
  if (!outer || !inRing(lon, lat, outer)) return false;
  return !holes.some((h) => inRing(lon, lat, h));
}

/** The country a map position lies in, or undefined at sea. */
export function territoryAt({ lon, lat }: LonLat): Territory | undefined {
  const contains = (t: Territory, x: number): boolean =>
    x >= t.bbox[0] &&
    x <= t.bbox[2] &&
    lat >= t.bbox[1] &&
    lat <= t.bbox[3] &&
    t.polygons.some((p) => inPolygon(x, lat, p));
  return TERRITORIES.find((t) => contains(t, lon) || (lon < 0 && contains(t, lon + 360)));
}

/** Whose territory a map position is: undefined at sea or in background countries. */
export function ownerAt(p: LonLat): OwnerId | undefined {
  const t = territoryAt(p);
  if (t?.countryId === '276' && inRing(p.lon, p.lat, EAST_GERMANY_RING)) return 'SOVWAR';
  return t?.owner;
}

export const EAST_GERMANY_OUTLINE: readonly Position[] = EAST_GERMANY_RING;
