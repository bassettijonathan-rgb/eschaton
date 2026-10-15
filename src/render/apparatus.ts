import * as THREE from 'three';
import type { ApparatusItem } from '../engine/apparatus';
import { OWNER_COLORS } from '../engine/data/territories';
import { THEATER_LENGTH, THEATER_WIDTH } from '../engine/theater';
import { tag } from './garments';
import { toWorld } from './theaterScene';

const lambert = (color: number | string): THREE.MeshLambertMaterial =>
  new THREE.MeshLambertMaterial({ color });

function person(shirt: number | string, shorts: number, withRacquet: boolean): THREE.Group {
  const g = new THREE.Group();
  const skin = lambert(0xe0b89a);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.8, 10), lambert(0xe0b89a));
  legs.position.y = 0.4;
  const shortsMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.15, 0.25, 12),
    lambert(shorts),
  );
  shortsMesh.position.y = 0.85;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.17, 0.55, 12), lambert(shirt));
  torso.position.y = 1.25;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), skin);
  head.position.y = 1.65;
  g.add(legs, shortsMesh, torso, head);
  if (withRacquet) {
    const racquet = new THREE.Group();
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.3, 8),
      lambert(0x222222),
    );
    handle.position.y = 0.15;
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 6, 20), lambert(0x333333));
    frame.scale.set(0.8, 1.05, 1);
    frame.position.y = 0.42;
    racquet.add(handle, frame);
    racquet.position.set(0.24, 0.8, 0);
    racquet.rotation.z = -0.35;
    g.add(racquet);
  }
  for (const m of g.children) m.castShadow = true;
  return g;
}

function bucket(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.12, 0.3, 20, 1, true),
    new THREE.MeshLambertMaterial({ color: 0xf7f7f2, side: THREE.DoubleSide }),
  );
  body.position.y = 0.15;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), lambert(0xf7f7f2));
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = 0.005;
  // A lid of tennis-ball felt just below the rim hints that it is full without saying how full.
  const felt = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), lambert(0xc8d64a));
  felt.rotation.x = -Math.PI / 2;
  felt.position.y = 0.27;
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.006, 6, 24, Math.PI),
    lambert(0xd0d0d0),
  );
  handle.position.y = 0.3;
  g.add(body, bottom, felt, handle);
  body.castShadow = true;
  return g;
}

function cart(): THREE.Group {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.6), lambert(0x6b6f73));
  deck.position.y = 0.75;
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.6), lambert(0x6b6f73));
  shelf.position.y = 0.3;
  g.add(deck, shelf);
  for (const [x, z] of [
    [-0.5, -0.25],
    [0.5, -0.25],
    [-0.5, 0.25],
    [0.5, 0.25],
  ] as const) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), lambert(0x444444));
    leg.position.set(x, 0.4, z);
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12),
      lambert(0x111111),
    );
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 0.05, z);
    g.add(leg, wheel);
  }
  // The Yushityu portable: a base and a colour monitor showing EndStat.
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.26), lambert(0x2a2a2e));
  base.position.set(0, 0.795, 0.05);
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.24, 0.015),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1e }),
  );
  screen.position.set(0, 0.92, -0.085);
  screen.rotation.x = -0.18;
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.2),
    new THREE.MeshBasicMaterial({ color: 0x5fd38d }),
  );
  glow.position.set(0, 0.92, -0.076);
  glow.rotation.x = -0.18;
  glow.name = 'yushityu-screen';
  g.add(base, screen, glow);
  for (const m of g.children) m.castShadow = true;
  return g;
}

function hopper(): THREE.Group {
  const g = new THREE.Group();
  const cage = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.45, 0.4),
    new THREE.MeshLambertMaterial({ color: 0x555b60, wireframe: true }),
  );
  cage.position.y = 0.4;
  const balls = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.3, 0.38), lambert(0xa8b23e));
  balls.position.y = 0.33;
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), lambert(0x444444));
  stand.position.y = 0.1;
  g.add(cage, balls, stand);
  return g;
}

/** What the game-master's beanie looks like in each state of the game. */
export const BEANIE_COLOURS = {
  gray: 0x8d9196,
  white: 0xf7f7f2,
  red: 0xc0392b,
  black: 0x1a1a1a,
} as const;

function gameMaster(): THREE.Group {
  const g = person(0x8d9196, 0xa3202b, false);
  // The beanie (its colour follows the game: see BEANIE_COLOURS), with its propeller.
  const beanie = new THREE.Mesh(
    new THREE.SphereGeometry(0.115, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    lambert(BEANIE_COLOURS.gray),
  );
  beanie.position.y = 1.67;
  beanie.name = 'beanie';
  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.008, 0.03), lambert(0xa3202b));
  prop.position.y = 1.8;
  prop.name = 'beanie-propeller';
  g.add(beanie, prop);
  return g;
}

export function buildApparatus(items: readonly ApparatusItem[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'apparatus';
  for (const a of items) {
    let obj: THREE.Group;
    switch (a.kind) {
      case 'player':
        obj = person(a.owner ? OWNER_COLORS[a.owner] : 0xffffff, 0x2b2b2b, true);
        break;
      case 'bucket':
        obj = bucket();
        break;
      case 'cart':
        obj = cart();
        break;
      case 'gameMaster':
        obj = gameMaster();
        break;
      case 'hopper':
        obj = hopper();
        break;
    }
    obj.position.copy(toWorld(a.at.x, a.at.y, 0));
    obj.name = a.id;
    tag(obj, { kind: 'apparatus', id: a.id });
    group.add(obj);
  }
  return group;
}

/** The spectators' pavilion, outside the north fence. */
export function buildPavilion(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'pavilion';
  const y0 = THEATER_LENGTH / 2 + 3;
  const width = THEATER_WIDTH * 0.45;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(width, 0.15, 5), lambert(0x7a2a2a));
  roof.position.copy(toWorld(0, y0 + 2.5, 3.6));
  g.add(roof);
  for (let i = 0; i <= 8; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.6, 8), lambert(0xe6e2d6));
    post.position.copy(toWorld(-width / 2 + (i * width) / 8, y0 + 0.2, 1.8));
    g.add(post);
  }
  for (let row = 0; row < 4; row++) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(width * 0.95, 0.3, 0.7), lambert(0x9c8b6e));
    bench.position.copy(toWorld(0, y0 + 0.8 + row * 1, 0.25 + row * 0.35));
    g.add(bench);
  }
  for (const m of g.children) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  tag(g, { kind: 'apparatus', id: 'pavilion' });
  return g;
}
