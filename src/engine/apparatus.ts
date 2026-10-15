/**
 * The apparatus of the game: players, buckets, the game-master and his cart,
 * the ball hopper. These stand on the courts but are not part of the map
 * (section 1.7), so they are laid out clear of every target item.
 */
import { project, type CourtPoint } from './projection';
import { garmentFor, TARGETS } from './data/targets';
import { THEATER_BOUNDS, contains } from './theater';
import type { CombatantDef, CombatantId, LonLat, TargetItem, WorldSituation } from './types';

export interface GarmentRect {
  readonly item: TargetItem;
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly halfDepth: number;
}

/** Where each target item lies on the court, as a rectangle. */
export function garmentRects(items: readonly TargetItem[] = TARGETS): GarmentRect[] {
  return items.map((item) => {
    const { x, y } = project(item.at);
    const { width, depth } = garmentFor(item).footprint;
    return { item, x, y, halfWidth: width / 2, halfDepth: depth / 2 };
  });
}

/** Distance from a point to the nearest edge of a rectangle (0 inside it). */
export function distanceToRect(p: CourtPoint, r: GarmentRect): number {
  const dx = Math.max(0, Math.abs(p.x - r.x) - r.halfWidth);
  const dy = Math.max(0, Math.abs(p.y - r.y) - r.halfDepth);
  return Math.hypot(dx, dy);
}

export type ApparatusKind = 'player' | 'bucket' | 'cart' | 'gameMaster' | 'hopper';

export interface ApparatusItem {
  readonly id: string;
  readonly kind: ApparatusKind;
  readonly owner?: CombatantId;
  readonly label: string;
  readonly at: CourtPoint;
  /** Radius of the space it takes on the court, metres. */
  readonly radius: number;
}

const RADIUS: Readonly<Record<ApparatusKind, number>> = {
  player: 0.3,
  bucket: 0.16,
  cart: 0.7,
  gameMaster: 0.3,
  hopper: 0.25,
};

/** Clear space kept between apparatus and the nearest garment, metres. */
export const MAP_CLEARANCE = 0.1;

/** Lord's cart stands in Court 7's ad service box: mid-Atlantic on the map. */
export const CART_AT: LonLat = { lon: -35, lat: 15 };

function isClear(
  p: CourtPoint,
  radius: number,
  rects: readonly GarmentRect[],
  placed: readonly ApparatusItem[],
): boolean {
  if (!contains(THEATER_BOUNDS, p.x, p.y)) return false;
  if (rects.some((r) => distanceToRect(p, r) < radius + MAP_CLEARANCE)) return false;
  return placed.every(
    (a) => Math.hypot(a.at.x - p.x, a.at.y - p.y) >= a.radius + radius + MAP_CLEARANCE,
  );
}

/**
 * The nearest clear spot to a wanted point, searching outward on a spiral of
 * 10 cm steps. Deterministic, so a layout never changes between runs.
 */
function nearestClear(
  want: CourtPoint,
  radius: number,
  rects: readonly GarmentRect[],
  placed: readonly ApparatusItem[],
): CourtPoint {
  if (isClear(want, radius, rects, placed)) return want;
  for (let ring = 1; ring <= 60; ring++) {
    const r = ring * 0.1;
    const steps = 8 * ring;
    for (let k = 0; k < steps; k++) {
      const a = (2 * Math.PI * k) / steps;
      const p = { x: want.x + r * Math.cos(a), y: want.y + r * Math.sin(a) };
      if (isClear(p, radius, rects, placed)) return p;
    }
  }
  throw new Error(`no clear spot near (${want.x.toFixed(2)}, ${want.y.toFixed(2)})`);
}

export function layoutApparatus(
  ws: WorldSituation,
  defs: Readonly<Record<CombatantId, CombatantDef>>,
  rects: readonly GarmentRect[] = garmentRects(),
): ApparatusItem[] {
  const placed: ApparatusItem[] = [];
  const place = (
    id: string,
    kind: ApparatusKind,
    label: string,
    want: CourtPoint,
    owner?: CombatantId,
  ): ApparatusItem => {
    const at = nearestClear(want, RADIUS[kind], rects, placed);
    const item: ApparatusItem = {
      id,
      kind,
      label,
      at,
      radius: RADIUS[kind],
      ...(owner ? { owner } : {}),
    };
    placed.push(item);
    return item;
  };

  const cart = project(CART_AT);
  place('cart', 'cart', "Lord's cart, with the Yushityu portable running EndStat", cart);
  place('game-master', 'gameMaster', 'The game-master, wearing the beanie', {
    x: cart.x - 1,
    y: cart.y,
  });
  place('hopper', 'hopper', 'The ball hopper: balls nobody was allocated', {
    x: cart.x + 1,
    y: cart.y,
  });

  for (const id of ws.combatants) {
    const def = defs[id];
    const stand = project(def.stand);
    const n = def.teamSize.min;
    for (let i = 0; i < n; i++) {
      const role = def.roles[i] ?? 'player';
      place(
        `${id.toLowerCase()}-player-${String(i + 1)}`,
        'player',
        `${def.code} ${role}`,
        { x: stand.x + (i - (n - 1) / 2) * 0.9, y: stand.y },
        id,
      );
    }
    place(
      `${id.toLowerCase()}-bucket`,
      'bucket',
      `${def.code}'s bucket`,
      { x: stand.x, y: stand.y - 0.8 },
      id,
    );
  }
  return placed;
}
