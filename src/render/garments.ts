import * as THREE from 'three';
import { GARMENTS, garmentFor } from '../engine/data/targets';
import { project } from '../engine/projection';
import type { GarmentKind, TargetItem } from '../engine/types';
import { toWorld } from './theaterScene';

/** E.T.A. colours and the rest of the laundry. */
const C = {
  etaGray: 0x8d9196,
  etaRed: 0xa3202b,
  towel: 0xf2efe6,
  towelStripe: 0x2f5d8a,
  shortsRed: 0xb3202f,
  shortsGray: 0x8a8f94,
  trimGray: 0xa7abaf,
  trimRed: 0xb3202f,
  armband: 0x161616,
  sockWhite: 0xf4f2ec,
  sockNavy: 0x1f2a44,
  sockStripe: 0x2f5d8a,
  sockPink: 0xe88aa6,
  sole: 0xe9e6dc,
  upper: 0xd8d4c8,
  sponsor: 0x3a6ea5,
} as const;

const materials = new Map<number, THREE.MeshLambertMaterial>();
function mat(color: number): THREE.MeshLambertMaterial {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    materials.set(color, m);
  }
  return m;
}

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);

/** A box sized w (east-west) × h (up) × d (north-south), resting on the court at local (x, y north). */
function box(
  w: number,
  h: number,
  d: number,
  color: number,
  x = 0,
  yNorth = 0,
  lift = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(boxGeometry, mat(color));
  mesh.scale.set(w, h, d);
  mesh.position.set(x, lift + h / 2, -yNorth);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

type Builder = (w: number, d: number) => THREE.Object3D[];

const sock =
  (main: number, band: number | null, length: number, pom: boolean): Builder =>
  (w, d) => {
    const legW = w * length;
    const footW = w * 0.42;
    const h = 0.022;
    const parts: THREE.Object3D[] = [
      box(legW, h, d * 0.75, main, -w / 2 + legW / 2, d * 0.12),
      box(footW, h, d, main, w / 2 - footW / 2, 0),
    ];
    if (band !== null)
      parts.push(box(legW * 0.18, h + 0.002, d * 0.76, band, -w / 2 + legW * 0.15, d * 0.12));
    if (pom) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), mat(0xffffff));
      ball.position.set(w / 2 - footW, 0.03, d * 0.3);
      parts.push(ball);
    }
    return parts;
  };

const BUILDERS: Readonly<Record<GarmentKind, Builder>> = {
  tshirt: (w, d) => [
    box(w, 0.03, d, C.etaGray),
    box(w, 0.032, d * 0.16, C.etaRed, 0, d * 0.18),
    box(w * 0.3, 0.033, d * 0.08, C.etaRed, 0, d * 0.44),
  ],
  towel: (w, d) => [
    box(w, 0.02, d, C.towel),
    box(w * 0.06, 0.021, d, C.towelStripe, -w * 0.38),
    box(w * 0.06, 0.021, d, C.towelStripe, w * 0.38),
  ],
  'red-shorts': (w, d) => [
    box(w, 0.025, d, C.shortsRed),
    box(w, 0.027, d * 0.12, C.trimGray, 0, d * 0.44),
    box(w * 0.05, 0.027, d * 0.88, C.trimGray, -w * 0.475, -d * 0.06),
    box(w * 0.05, 0.027, d * 0.88, C.trimGray, w * 0.475, -d * 0.06),
  ],
  'gray-shorts': (w, d) => [
    box(w, 0.025, d, C.shortsGray),
    box(w, 0.027, d * 0.12, C.trimRed, 0, d * 0.44),
    box(w * 0.05, 0.027, d * 0.88, C.trimRed, -w * 0.475, -d * 0.06),
    box(w * 0.05, 0.027, d * 0.88, C.trimRed, w * 0.475, -d * 0.06),
  ],
  armband: (w, d) => [box(w, 0.012, d, C.armband)],
  'sock-boys-tennis': sock(C.sockWhite, C.sockStripe, 0.7, false),
  'sock-boys-street': sock(C.sockNavy, null, 0.75, false),
  'sock-girls-bunny': sock(C.sockWhite, C.sockPink, 0.45, true),
  'sock-girls-plain': sock(C.sockWhite, null, 0.45, false),
  sneaker: (w, d) => [
    box(w, 0.025, d, C.sole),
    box(w * 0.85, 0.055, d * 0.85, C.upper, -w * 0.05, 0, 0.025),
    box(w * 0.4, 0.04, d * 0.9, C.sponsor, w * 0.05, 0, 0.03),
  ],
};

export interface PickTag {
  readonly kind: 'target' | 'apparatus';
  readonly id: string;
}

export function tag(object: THREE.Object3D, pick: PickTag): void {
  object.userData['pick'] = pick;
}

export function buildGarment(item: TargetItem): THREE.Group {
  const def = garmentFor(item);
  const group = new THREE.Group();
  group.name = `target-${item.id}`;
  for (const part of BUILDERS[def.kind](def.footprint.width, def.footprint.depth)) group.add(part);
  const { x, y } = project(item.at);
  group.position.copy(toWorld(x, y, 0.003));
  tag(group, { kind: 'target', id: item.id });
  return group;
}

export function buildGarments(items: readonly TargetItem[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'garments';
  for (const item of items) group.add(buildGarment(item));
  return group;
}

/** For a legend swatch. */
export const GARMENT_SWATCH: Readonly<Record<GarmentKind, string>> = {
  tshirt: '#8d9196',
  towel: '#f2efe6',
  'red-shorts': '#b3202f',
  'gray-shorts': '#8a8f94',
  armband: '#161616',
  'sock-boys-tennis': '#f4f2ec',
  'sock-boys-street': '#1f2a44',
  'sock-girls-bunny': '#e88aa6',
  'sock-girls-plain': '#f4f2ec',
  sneaker: '#d8d4c8',
};

export { GARMENTS };
