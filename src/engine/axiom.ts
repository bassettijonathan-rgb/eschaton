/**
 * The axiom: the map is not the territory (section 1.7). Players, their
 * racquets, the buckets and the game-master's cart stand on the courts but
 * are the apparatus of the game, not inside it. A ball that strikes one has
 * struck nothing on the map. Weather on the courts is not weather in the
 * World Situation. And the garments stay where the map puts them, except the
 * submarines and carrier groups, which move as their data allows.
 */
import type { ApparatusItem } from './apparatus';
import { MOBILE_RANGE_KM } from './data/targets';
import type { Vec3 } from './physics';
import { greatCircleKm } from './projection';
import { territoryAt } from './territory';
import type { CombatantId, LonLat, TargetItem } from './types';

export type SolidKind = 'player' | 'racquet' | 'bucket' | 'cart' | 'gameMaster' | 'hopper';

/**
 * The space a piece of apparatus takes up, as an upright cylinder (or, for
 * the cart and the hopper, an upright box) standing on the court.
 */
export interface ApparatusSolid {
  readonly id: string;
  readonly kind: SolidKind;
  readonly label: string;
  readonly owner?: CombatantId;
  readonly x: number;
  readonly y: number;
  /** Cylinder radius, m (unused for boxes). */
  readonly radius: number;
  /** Box half-extents east–west and north–south, m (boxes only). */
  readonly half?: { readonly x: number; readonly y: number };
  readonly bottom: number;
  readonly top: number;
}

/** Where a player holds the racquet: a little east of them, head about chest high. */
export const RACQUET_OFFSET = 0.3;

/**
 * The solids of a layout. Sizes follow the drawn models: a player is 1.8 m
 * tall with the racquet head beside them, a bucket 30 cm, the cart and its
 * Yushityu about a metre.
 */
export function apparatusSolids(layout: readonly ApparatusItem[]): ApparatusSolid[] {
  const solids: ApparatusSolid[] = [];
  for (const a of layout) {
    const base = {
      id: a.id,
      label: a.label,
      x: a.at.x,
      y: a.at.y,
      ...(a.owner ? { owner: a.owner } : {}),
    };
    switch (a.kind) {
      case 'player':
        // The racquet first: a ball that reaches both at once meets the strings.
        solids.push({
          ...base,
          id: `${a.id}-racquet`,
          kind: 'racquet',
          label: `${a.label}'s racquet`,
          x: a.at.x + RACQUET_OFFSET,
          radius: 0.15,
          bottom: 0.8,
          top: 1.45,
        });
        solids.push({ ...base, kind: 'player', radius: 0.2, bottom: 0, top: 1.78 });
        break;
      case 'gameMaster':
        solids.push({ ...base, kind: 'gameMaster', radius: 0.2, bottom: 0, top: 1.8 });
        break;
      case 'bucket':
        solids.push({ ...base, kind: 'bucket', radius: 0.15, bottom: 0, top: 0.3 });
        break;
      case 'cart':
        solids.push({
          ...base,
          kind: 'cart',
          radius: 0,
          half: { x: 0.55, y: 0.3 },
          bottom: 0,
          top: 1.05,
        });
        break;
      case 'hopper':
        solids.push({
          ...base,
          kind: 'hopper',
          radius: 0,
          half: { x: 0.2, y: 0.2 },
          bottom: 0,
          top: 0.65,
        });
        break;
    }
  }
  return solids;
}

function inside(p: Vec3, s: ApparatusSolid): boolean {
  if (p.z < s.bottom || p.z > s.top) return false;
  if (s.half) return Math.abs(p.x - s.x) <= s.half.x && Math.abs(p.y - s.y) <= s.half.y;
  return Math.hypot(p.x - s.x, p.y - s.y) <= s.radius;
}

const at = (a: Vec3, b: Vec3, f: number): Vec3 => ({
  x: a.x + (b.x - a.x) * f,
  y: a.y + (b.y - a.y) * f,
  z: a.z + (b.z - a.z) * f,
});

/**
 * The first solid a step of flight from `a` to `b` enters, and how far along
 * the step. A ball that starts inside a solid is not stopped by it: it is
 * already on its way out (the launchman's own racquet).
 */
export function firstStrike(
  a: Vec3,
  b: Vec3,
  solids: readonly ApparatusSolid[],
): { solid: ApparatusSolid; f: number } | undefined {
  let best: { solid: ApparatusSolid; f: number } | undefined;
  for (const s of solids) {
    // Cheap reject: the step is a couple of centimetres, the solids are small.
    const reach = (s.half ? Math.hypot(s.half.x, s.half.y) : s.radius) + 1;
    if (Math.abs(b.x - s.x) > reach || Math.abs(b.y - s.y) > reach) continue;
    if (b.z > s.top + 1) continue;
    if (inside(a, s) || !inside(b, s)) continue;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inside(at(a, b, mid), s)) hi = mid;
      else lo = mid;
    }
    if (!best || hi < best.f) best = { solid: s, f: hi };
  }
  return best;
}

export type MoveCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Whether a garment may go somewhere else on the map. Only submarines and
 * carrier groups move, only by their owner, only at sea, and only as far as
 * their data allows in one move. Anything else is tampering with the map.
 */
export function checkMove(item: TargetItem, by: CombatantId, from: LonLat, to: LonLat): MoveCheck {
  const range = MOBILE_RANGE_KM[item.type];
  if (!item.mobile || range === undefined)
    return {
      ok: false,
      reason: `Moving the ${item.name} garment is tampering with the map, not a move in the game`,
    };
  if (item.owner !== by) return { ok: false, reason: `Only ${item.owner} may move ${item.name}` };
  if (Math.abs(to.lat) > 90 || Math.abs(to.lon) > 180)
    return { ok: false, reason: 'That is not on the map' };
  if (territoryAt(to)) return { ok: false, reason: `${item.name} must stay at sea` };
  const km = greatCircleKm(from, to);
  if (km > range)
    return {
      ok: false,
      reason: `${item.name} can move at most ${String(range)} km at a time; that is ${km.toFixed(0)} km`,
    };
  return { ok: true };
}

/** The garments as they lie now: the map's positions, with moved ships where they went. */
export function itemsNow(
  items: readonly TargetItem[],
  positions: Readonly<Record<string, LonLat>>,
): TargetItem[] {
  return items.map((t) => {
    const p = positions[t.id];
    return p ? { ...t, at: p } : t;
  });
}
