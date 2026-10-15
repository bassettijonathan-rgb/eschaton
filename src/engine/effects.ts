/**
 * What a 5-megaton warhead does where it lands: kill radius by terrain and
 * scenario weather, firestorms, fallout and radiation, and EMP. These are
 * EndStat's physical models; scoring is in endstat.ts.
 *
 * Distances are measured on the court and converted to kilometres at the A6
 * scale, so the map, not the globe, is the territory the rules see (A38).
 */
import { FLAT_KILL_RADIUS_KM, type KillRadius } from './lob';
import { courtForLonLat, courtMetresToKm, kmToCourtMetres, type CourtPoint } from './projection';
import type {
  LonLat,
  Precipitation,
  ScenarioWeather,
  TargetItem,
  Terrain,
  WorldSituation,
} from './types';

/** Kill radius relative to open, flat ground (Peoria's 10.1 km). */
export const TERRAIN_FACTOR: Readonly<Record<Terrain, number>> = {
  flat: 1,
  coastal: 0.85,
  rolling: 0.8,
  mountainous: 0.55,
  sea: 0.9,
};

/** Skyscrapers shadow one another from blast and heat. */
export const HIGH_RISE_FACTOR = 0.9;

/** Wet air and ground soak up the thermal pulse. Only scenario weather counts. */
export const PRECIPITATION_FACTOR: Readonly<Record<Precipitation, number>> = {
  none: 1,
  rain: 0.95,
  snow: 0.92,
};

export interface Audited<T> {
  readonly value: T;
  readonly steps: readonly string[];
}

const km1 = (n: number): string => `${n.toFixed(2)} km`;

/** The scenario weather over a point on the map: its court's (A24). */
export function weatherAt(ws: WorldSituation, p: LonLat): ScenarioWeather | undefined {
  const court = courtForLonLat(p);
  return court === undefined ? undefined : ws.weather[court];
}

export function killRadiusKm(
  item: TargetItem,
  weather: ScenarioWeather | undefined,
): Audited<number> {
  const steps = [`Open flat ground: ${km1(FLAT_KILL_RADIUS_KM)} for 5 Mt (the Peoria case).`];
  let r = FLAT_KILL_RADIUS_KM;
  const t = TERRAIN_FACTOR[item.terrain];
  if (t !== 1) {
    r *= t;
    steps.push(`${item.terrain} terrain × ${String(t)} → ${km1(r)}.`);
  }
  if (item.highRise) {
    r *= HIGH_RISE_FACTOR;
    steps.push(`High-rise skyline × ${String(HIGH_RISE_FACTOR)} → ${km1(r)}.`);
  }
  const p = weather?.precipitation ?? 'none';
  if (p !== 'none') {
    r *= PRECIPITATION_FACTOR[p];
    steps.push(`Scenario ${p} over the target × ${String(PRECIPITATION_FACTOR[p])} → ${km1(r)}.`);
  }
  return { value: r, steps };
}

/** EndStat's kill radius, in court metres, for adjudicating a lob. */
export function endstatKillRadius(ws: WorldSituation): KillRadius {
  return (item) => kmToCourtMetres(killRadiusKm(item, weatherAt(ws, item.at)).value);
}

/** Strikes, close enough to count, that a city takes before it burns. */
export function firestormThreshold(item: TargetItem): number {
  return item.highRise ? 2 : 1;
}

/** A strike counts toward a firestorm when it lands in the inner half of the kill radius. */
export const FIRESTORM_SEVERITY = 0.5;

// ---------------------------------------------------------------- radiation

/** Below this whole-body dose nobody is counted. */
export const RADIATION_THRESHOLD_ROENTGENS = 100;
/** Deaths per head per roentgen: 6.36 per hundred at 1,000 roentgens. */
export const RADIATION_DEATH_COEFFICIENT = 0.0636 / 1000;

export interface RadiationCasualties {
  readonly deaths: number;
  /** Survivors whose lives the dose shortens. */
  readonly shortened: number;
}

/**
 * Straight X and gamma: at or above 100 roentgens, 0.0636 deaths per head
 * per 1,000 roentgens, and everyone else exposed lives a shorter life.
 */
export function radiationCasualties(population: number, roentgens: number): RadiationCasualties {
  if (population <= 0 || roentgens < RADIATION_THRESHOLD_ROENTGENS)
    return { deaths: 0, shortened: 0 };
  const deaths = Math.min(population, population * RADIATION_DEATH_COEFFICIENT * roentgens);
  return { deaths, shortened: population - deaths };
}

// ---------------------------------------------------------------- fallout

/** Dose ten kilometres downwind of a ground burst in a 15 km/h wind, roentgens. */
export const FALLOUT_DOSE_AT_10_KM = 6000;
/** How fast dose falls off downwind: dose ∝ distance^−1.2. */
export const FALLOUT_DECAY = 1.2;
/** Rain or snow in the scenario brings fallout down sooner: hotter near, cooler far. */
export const RAINOUT_NEAR = 1.6;
export const RAINOUT_FAR = 0.5;
export const RAINOUT_KM = 150;

export interface Plume {
  readonly at: CourtPoint;
  /** Unit vector the wind blows toward, on the court. */
  readonly toward: { readonly x: number; readonly y: number };
  readonly windKmh: number;
  readonly precipitation: Precipitation;
}

export function plumeFor(at: CourtPoint, weather: ScenarioWeather | undefined): Plume {
  const w = weather ?? { windToward: 0, windKmh: 0, precipitation: 'none' as const, cloud: 0 };
  const a = (w.windToward * Math.PI) / 180;
  return {
    at,
    toward: { x: Math.sin(a), y: Math.cos(a) },
    windKmh: w.windKmh,
    precipitation: w.precipitation,
  };
}

/** Dose on the plume's centreline at `along` km downwind (negative is upwind). */
function centreline(p: Plume, along: number): number {
  const base = (FALLOUT_DOSE_AT_10_KM * 20) / (p.windKmh + 5);
  if (along <= 0) return base;
  let d = base * (10 / Math.max(along, 10)) ** FALLOUT_DECAY;
  if (p.precipitation !== 'none') d *= along < RAINOUT_KM ? RAINOUT_NEAR : RAINOUT_FAR;
  return d;
}

/** Half-width scale of the plume, km, at `along` km downwind. */
function spread(along: number): number {
  return 3 + 0.12 * Math.max(0, along);
}

/** Fallout dose in roentgens at a point, from one ground burst. */
export function falloutDose(p: Plume, point: CourtPoint): number {
  const dx = courtMetresToKm(point.x - p.at.x);
  const dy = courtMetresToKm(point.y - p.at.y);
  const along = dx * p.toward.x + dy * p.toward.y;
  const cross = Math.abs(-dx * p.toward.y + dy * p.toward.x);
  if (along <= 0) return centreline(p, 0) * Math.exp(-((Math.hypot(dx, dy) / spread(0)) ** 2));
  return centreline(p, along) * Math.exp(-((cross / spread(along)) ** 2));
}

/** The outline of the plume where the dose reaches `roentgens`, as court points. */
export function plumeOutline(p: Plume, roentgens = RADIATION_THRESHOLD_ROENTGENS): CourtPoint[] {
  const halfWidth = (along: number): number => {
    const c = centreline(p, along);
    return c <= roentgens ? 0 : spread(along) * Math.sqrt(Math.log(c / roentgens));
  };
  const r0 = halfWidth(0);
  if (r0 === 0) return [];
  let length = 0;
  while (halfWidth(length + 5) > 0 && length < 5000) length += 5;
  const toCourt = (along: number, cross: number): CourtPoint => {
    const ax = along * p.toward.x - cross * p.toward.y;
    const ay = along * p.toward.y + cross * p.toward.x;
    return { x: p.at.x + kmToCourtMetres(ax), y: p.at.y + kmToCourtMetres(ay) };
  };
  const left: CourtPoint[] = [];
  const right: CourtPoint[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const along = (length * i) / steps;
    const w = halfWidth(along);
    left.push(toCourt(along, w));
    right.push(toCourt(along, -w));
  }
  // The upwind end is a half circle around ground zero.
  const back: CourtPoint[] = [];
  for (let i = 1; i < 12; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / 12;
    back.push(toCourt(r0 * Math.cos(a), r0 * Math.sin(a)));
  }
  return [...left, ...right.reverse(), ...back];
}

// ---------------------------------------------------------------- EMP

/** Communication capacity lost to one detonation in a Combatant's territory. */
export const EMP_LOSS_PER_DETONATION = 0.06;
/** Extra capacity lost when the strike takes out a command site or satellite receiver. */
export const EMP_LOSS_COMMAND_HIT = 0.15;
/** The most that EMP-resistant civil defence can shield. */
export const EMP_HARDENING_CAP = 0.6;

/** Share of EMP damage that civil-defence spending shields, from spending as a share of the military budget. */
export function empHardening(civilDefenseSpending: number, militaryBudget: number): number {
  if (militaryBudget <= 0) return 0;
  return Math.min(EMP_HARDENING_CAP, (10 * civilDefenseSpending) / militaryBudget);
}

/** Longest hotline message, in words, at full communication capacity. */
export const HOTLINE_WORDS_AT_FULL_CAPACITY = 80;

export function hotlineWords(capacity: number): number {
  return Math.round(HOTLINE_WORDS_AT_FULL_CAPACITY * Math.max(0, capacity));
}
