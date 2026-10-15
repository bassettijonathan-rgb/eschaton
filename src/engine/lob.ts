/**
 * The lob: a launch order, its validation, the swing that turns it into a
 * flight, MIRV jockstraps, and where each warhead first touches the court.
 */
import { garmentRects, distanceToRect, layoutApparatus, type GarmentRect } from './apparatus';
import { apparatusSolids, firstStrike, type ApparatusSolid, type SolidKind } from './axiom';
import { COMBATANTS } from './data/combatants';
import { TARGETS } from './data/targets';
import {
  TENNIS_BALL,
  launchState,
  simulate,
  vec,
  type Body,
  type Flight,
  type FlightState,
  type Vec3,
} from './physics';
import {
  courtMetresToKm,
  kmToCourtMetres,
  project,
  unproject,
  type CourtPoint,
} from './projection';
import type { Rng } from './rng';
import { THEATER_BOUNDS, contains, courtAtPoint, type CourtNumber } from './theater';
import type { CombatantDef, CombatantId, LonLat, TargetItem, WorldSituation } from './types';

/** Height above the court at which the racquet meets the ball, m. */
export const CONTACT_HEIGHT = 1.0;
/** The insurgent cell's howitzer reaches 50 km (A9): about 9 cm of court. */
export const HOWITZER_RANGE_KM = 50;
export const HOWITZER_PLATFORM = 'howitzer';

export interface Platform {
  readonly id: string;
  readonly name: string;
  readonly owner: CombatantId;
  readonly kind: 'land' | 'sea' | 'air' | 'howitzer';
  readonly at: LonLat;
}

/** The places a Combatant may lob from: its missile and silo socks, bomber socks and submarine shoes (A9). */
export function platformsFor(
  id: CombatantId,
  ws: WorldSituation,
  items: readonly TargetItem[] = TARGETS,
): Platform[] {
  const own: Platform[] = items
    .filter((t) => t.owner === id && t.platform)
    .map((t) => ({ id: t.id, name: t.name, owner: id, kind: t.platform ?? 'land', at: t.at }));
  if (id === 'INSURGENT' && ws.howitzerAt)
    own.push({
      id: HOWITZER_PLATFORM,
      name: 'The howitzer',
      owner: id,
      kind: 'howitzer',
      at: ws.howitzerAt,
    });
  return own;
}

export interface Swing {
  /** Compass bearing of the shot, radians clockwise from north. */
  readonly bearing: number;
  /** Radians above the horizontal. */
  readonly elevation: number;
  /** Racquet-head speed given to the ball, m/s. */
  readonly speed: number;
  readonly topspinRpm: number;
  /**
   * Where the timing meter stopped: 0 is the sweet spot, −1 and +1 the ends
   * (early and late). A mistimed swing pulls the ball off line and loses pace.
   */
  readonly timing: number;
}

export interface LaunchOrder {
  readonly combatant: CombatantId;
  readonly platformId: string;
  /** Warheads in this launch: 1 for a single ball, more for a jockstrap MIRV. */
  readonly warheads: number;
  readonly swing: Swing;
  /** Where the Combatant declared it is aiming, for the game-master's log. */
  readonly aimAt?: LonLat;
}

/** Bearing error, radians, at the end of the timing meter. */
export const TIMING_BEARING_ERROR = (8 * Math.PI) / 180;
/** Fraction of pace lost at the end of the timing meter. */
export const TIMING_PACE_LOSS = 0.12;

/** What the swing actually does once timing is taken into account. */
export function effectiveSwing(s: Swing): Swing {
  const t = Math.max(-1, Math.min(1, s.timing));
  return {
    ...s,
    bearing: s.bearing + t * TIMING_BEARING_ERROR,
    speed: s.speed * (1 - TIMING_PACE_LOSS * Math.abs(t)),
  };
}

export function validateLaunch(
  order: LaunchOrder,
  ws: WorldSituation,
  defs: Readonly<Record<CombatantId, CombatantDef>>,
  warheadsInBucket: number,
  destroyedPlatforms: readonly string[] = [],
): string[] {
  const problems: string[] = [];
  const def = defs[order.combatant];
  if (!ws.combatants.includes(order.combatant)) problems.push(`${def.code} is not playing`);
  const platform = platformsFor(order.combatant, ws).find((p) => p.id === order.platformId);
  if (!platform) problems.push(`${def.code} has no launch platform called ${order.platformId}`);
  else if (destroyedPlatforms.includes(platform.id))
    problems.push(`${platform.name} has been struck and can no longer launch`);
  if (!Number.isInteger(order.warheads) || order.warheads < 1)
    problems.push('a launch carries at least one warhead');
  if (order.warheads > def.mirvCap)
    problems.push(`${def.code} may pack at most ${String(def.mirvCap)} warheads in one jockstrap`);
  if (order.warheads > warheadsInBucket)
    problems.push(`${def.code} has only ${String(warheadsInBucket)} warheads left`);
  if (platform?.kind === 'howitzer' && order.aimAt) {
    const from = project(platform.at);
    const to = project(order.aimAt);
    const km = courtMetresToKm(Math.hypot(to.x - from.x, to.y - from.y));
    if (km > HOWITZER_RANGE_KM)
      problems.push(
        `the howitzer reaches ${String(HOWITZER_RANGE_KM)} km; that aim point is ${km.toFixed(0)} km away`,
      );
  }
  const s = order.swing;
  if (!(s.speed > 0 && s.speed <= 70)) problems.push('racquet speed must be between 0 and 70 m/s');
  if (!(s.elevation > 0 && s.elevation < Math.PI / 2))
    problems.push('elevation must be between 0° and 90°');
  return problems;
}

/** A jockstrap packed with k balls: heavier, bulkier, and tumbling, so no Magnus lift. */
export function jockstrapBody(k: number): Body {
  return {
    mass: k * TENNIS_BALL.mass + 0.03,
    radius: TENNIS_BALL.radius * Math.cbrt(k) * 1.25,
    dragCoefficient: 0.8,
    magnus: false,
  };
}

/** Sideways speed each MIRV warhead takes as the jockstrap opens, m/s at most. */
export const MIRV_SCATTER_SPEED = 1.5;

export interface Detonation {
  readonly warhead: number;
  /** Where the ball first touched the court (A1). */
  readonly at: CourtPoint;
  readonly lonLat: LonLat;
  readonly court: CourtNumber | undefined;
  /** Off the theater altogether, or stopped by the apparatus: not on the map. */
  readonly offMap: boolean;
  readonly hits: readonly TargetHit[];
  /** The apparatus the ball struck before it reached the court, if any (section 1.7). */
  readonly struck?: StruckApparatus;
}

export interface StruckApparatus {
  readonly id: string;
  readonly kind: SolidKind;
  readonly label: string;
  readonly owner?: CombatantId;
  /** Height above the court where it struck, m. */
  readonly height: number;
}

export interface TargetHit {
  readonly item: TargetItem;
  /** Inside the garment is direct; within the kill radius of it is indirect (A1). */
  readonly kind: 'direct' | 'indirect';
  /** From the detonation to the garment's nearest edge, metres of court. */
  readonly distance: number;
  readonly killRadius: number;
}

export interface LobResult {
  readonly order: LaunchOrder;
  readonly platform: Platform;
  /** The bus (or the single ball) from the racquet. */
  readonly launch: Flight;
  /** One flight per warhead after the jockstrap opens; for a single ball, the launch itself. */
  readonly warheadFlights: readonly Flight[];
  readonly detonations: readonly Detonation[];
  /** Shells that landed beyond the howitzer's reach and do nothing. */
  readonly outOfRange: number;
}

/** Kill radius of a 5 Mt strike on open, flat ground: Peoria's 10.1 km. */
export const FLAT_KILL_RADIUS_KM = 10.1;

export type KillRadius = (item: TargetItem) => number;

/** Until EndStat (M4) weighs terrain, every target gets Peoria's radius. */
export const flatKillRadius: KillRadius = () => kmToCourtMetres(FLAT_KILL_RADIUS_KM);

/** What a warhead that first touches the court here does to the map. */
export function adjudicateImpact(
  at: CourtPoint,
  warhead: number,
  killRadius: KillRadius = flatKillRadius,
  rects: readonly GarmentRect[] = garmentRects(),
): Detonation {
  const lonLat = unproject(at);
  const offMap = !contains(THEATER_BOUNDS, at.x, at.y);
  const hits: TargetHit[] = [];
  if (!offMap) {
    for (const r of rects) {
      const distance = distanceToRect(at, r);
      const radius = killRadius(r.item);
      if (distance === 0) hits.push({ item: r.item, kind: 'direct', distance, killRadius: radius });
      else if (distance <= radius)
        hits.push({ item: r.item, kind: 'indirect', distance, killRadius: radius });
    }
  }
  hits.sort((a, b) => a.distance - b.distance);
  return { warhead, at, lonLat, court: courtAtPoint(at.x, at.y)?.number, offMap, hits };
}

/**
 * What a ball meets that is not the map: a ball that strikes it stops there,
 * off the map, and scores nothing.
 */
export function apparatusDetonation(
  warhead: number,
  solid: ApparatusSolid,
  where: Vec3,
): Detonation {
  const at = { x: where.x, y: where.y };
  return {
    warhead,
    at,
    lonLat: unproject(at),
    court: courtAtPoint(at.x, at.y)?.number,
    offMap: true,
    hits: [],
    struck: {
      id: solid.id,
      kind: solid.kind,
      label: solid.label,
      height: where.z,
      ...(solid.owner ? { owner: solid.owner } : {}),
    },
  };
}

const layoutSolids = new WeakMap<WorldSituation, ApparatusSolid[]>();
/** The apparatus standing on the courts for a World Situation. */
export function solidsFor(ws: WorldSituation): ApparatusSolid[] {
  let solids = layoutSolids.get(ws);
  if (!solids) {
    solids = apparatusSolids(layoutApparatus(ws, COMBATANTS));
    layoutSolids.set(ws, solids);
  }
  return solids;
}

/** The courts as a lob finds them: where the garments lie and what stands on them. */
export interface LobWorld {
  readonly items?: readonly TargetItem[];
  readonly apparatus?: readonly ApparatusSolid[];
}

function originOf(platform: Platform): Vec3 {
  const p = project(platform.at);
  return vec(p.x, p.y, CONTACT_HEIGHT);
}

/**
 * Fly a launch order. A single warhead flies as a ball with the swing's
 * topspin. A MIRV flies as a tumbling jockstrap to the top of its arc, opens,
 * and scatters its warheads, each of which flies on as a ball. Every warhead
 * detonates where it first touches the court.
 */
export function resolveLob(
  order: LaunchOrder,
  ws: WorldSituation,
  rng: Rng,
  killRadius: KillRadius = flatKillRadius,
  world: LobWorld = {},
): LobResult {
  const items = world.items ?? TARGETS;
  const platform = platformsFor(order.combatant, ws, items).find((p) => p.id === order.platformId);
  if (!platform) throw new Error(`no platform ${order.platformId} for ${order.combatant}`);
  const s = effectiveSwing(order.swing);
  const origin = originOf(platform);
  const rects = garmentRects(items);
  // The map is not the territory: the apparatus stops a ball, and that is all.
  const solids = world.apparatus ?? solidsFor(ws);
  const flown = new Map<Flight, { solid: ApparatusSolid; where: Vec3 }>();
  const fly = (body: Body, start: FlightState, stopAtApex = false): Flight => {
    const strikes: { solid: ApparatusSolid; where: Vec3 }[] = [];
    const obstacle = (a: Vec3, b: Vec3): number | undefined => {
      const hit = firstStrike(a, b, solids);
      if (!hit) return undefined;
      const { f } = hit;
      strikes.push({
        solid: hit.solid,
        where: vec(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f),
      });
      return f;
    };
    const flight = simulate(body, start, { obstacle, stopAtApex });
    const strike = strikes[0];
    if (flight.obstructed && strike) flown.set(flight, strike);
    return flight;
  };

  let launch: Flight;
  let warheadFlights: Flight[];
  if (order.warheads === 1) {
    launch = fly(TENNIS_BALL, launchState(origin, s.bearing, s.elevation, s.speed, s.topspinRpm));
    warheadFlights = [launch];
  } else {
    const start = launchState(origin, s.bearing, s.elevation, s.speed, 0);
    launch = fly(jockstrapBody(order.warheads), start, true);
    const bus = flown.get(launch);
    if (bus) {
      // The jockstrap struck the apparatus before it opened: every warhead stops with it.
      const detonations = Array.from({ length: order.warheads }, (_, i) =>
        apparatusDetonation(i + 1, bus.solid, bus.where),
      );
      return { order, platform, launch, warheadFlights: [], detonations, outOfRange: 0 };
    }
    warheadFlights = Array.from({ length: order.warheads }, () => {
      const angle = rng.next() * 2 * Math.PI;
      const push = Math.sqrt(rng.next()) * MIRV_SCATTER_SPEED;
      const lift = (rng.next() - 0.5) * 0.4;
      const released: FlightState = {
        position: launch.end.position,
        velocity: vec(
          launch.end.velocity.x + push * Math.cos(angle),
          launch.end.velocity.y + push * Math.sin(angle),
          launch.end.velocity.z + lift,
        ),
        spin: vec(0, 0, 0),
      };
      return fly(TENNIS_BALL, released);
    });
  }

  let outOfRange = 0;
  const detonations: Detonation[] = [];
  warheadFlights.forEach((f, i) => {
    const hit = flown.get(f);
    if (hit) {
      detonations.push(apparatusDetonation(i + 1, hit.solid, hit.where));
      return;
    }
    const at = { x: f.end.position.x, y: f.end.position.y };
    if (platform.kind === 'howitzer') {
      const km = courtMetresToKm(Math.hypot(at.x - origin.x, at.y - origin.y));
      if (km > HOWITZER_RANGE_KM) {
        outOfRange++;
        return;
      }
    }
    detonations.push(adjudicateImpact(at, i + 1, killRadius, rects));
  });

  return { order, platform, launch, warheadFlights, detonations, outOfRange };
}

/**
 * The racquet speed that lands a perfectly timed shot on a point, for a given
 * elevation and topspin: a practice aid, and the computer Combatants' aim.
 * Returns undefined if no speed up to 70 m/s reaches it.
 */
export function solveSpeed(
  from: CourtPoint,
  to: CourtPoint,
  elevation: number,
  topspinRpm: number,
  warheads = 1,
): { bearing: number; speed: number } | undefined {
  const bearing = Math.atan2(to.x - from.x, to.y - from.y);
  const want = Math.hypot(to.x - from.x, to.y - from.y);
  const carry = (speed: number): number => {
    const origin = vec(from.x, from.y, CONTACT_HEIGHT);
    let end: Vec3;
    if (warheads === 1) {
      end = simulate(TENNIS_BALL, launchState(origin, bearing, elevation, speed, topspinRpm), {
        sampleEvery: 1e9,
      }).end.position;
    } else {
      const apex = simulate(
        jockstrapBody(warheads),
        launchState(origin, bearing, elevation, speed, 0),
        {
          stopAtApex: true,
          sampleEvery: 1e9,
        },
      ).end;
      end = simulate(TENNIS_BALL, { ...apex, spin: vec(0, 0, 0) }, { sampleEvery: 1e9 }).end
        .position;
    }
    return Math.hypot(end.x - from.x, end.y - from.y);
  };
  let lo = 0.1;
  let hi = 70;
  if (carry(hi) < want || carry(lo) > want) return undefined;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (carry(mid) < want) lo = mid;
    else hi = mid;
  }
  return { bearing, speed: (lo + hi) / 2 };
}
