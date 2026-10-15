import * as THREE from 'three';
import {
  COURTS,
  COURT_LENGTH,
  DOUBLES_WIDTH,
  NET_POST_OUTSIDE_SIDELINE,
  SERVICE_LINE_FROM_NET,
  SINGLES_WIDTH,
  THEATER_LENGTH,
  THEATER_WIDTH,
  type Court,
} from '../engine/theater';

/**
 * Engine coordinates are (x east, y north) on the court surface. Three.js is
 * y-up, so a court point (x, y) sits at world (x, 0, -y): north is -z.
 */
export function toWorld(x: number, y: number, height = 0): THREE.Vector3 {
  return new THREE.Vector3(x, height, -y);
}

const LINE_WIDTH = 0.05;
const COLORS = {
  runOff: 0x3f6b4a,
  court: 0x2f5d8a,
  line: 0xf4f1e8,
  net: 0x1b1b1b,
  fence: 0x24302a,
  ground: 0x6f7a5c,
} as const;

function flatRect(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  color: number,
  height: number,
): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(maxX - minX, maxY - minY);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color }));
  mesh.position.copy(toWorld((minX + maxX) / 2, (minY + maxY) / 2, height));
  mesh.receiveShadow = true;
  return mesh;
}

function line(x1: number, y1: number, x2: number, y2: number): THREE.Mesh {
  const w = LINE_WIDTH / 2;
  return flatRect(
    Math.min(x1, x2) - w,
    Math.max(x1, x2) + w,
    Math.min(y1, y2) - w,
    Math.max(y1, y2) + w,
    COLORS.line,
    0.002,
  );
}

function courtNumberLabel(court: Court): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(244, 241, 232, 0.85)';
    ctx.font = 'bold 180px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(court.number), 128, 136);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const geometry = new THREE.PlaneGeometry(3, 3);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  // In the south run-off, behind the baseline.
  mesh.position.copy(toWorld(court.centerX, court.cell.minY + 3.2, 0.003));
  mesh.name = `court-${String(court.number)}-label`;
  return mesh;
}

function buildCourt(court: Court): THREE.Group {
  const group = new THREE.Group();
  group.name = `court-${String(court.number)}`;
  const { cell, playingArea: p, centerX } = court;

  group.add(flatRect(cell.minX, cell.maxX, cell.minY, cell.maxY, COLORS.runOff, 0));
  group.add(flatRect(p.minX, p.maxX, p.minY, p.maxY, COLORS.court, 0.001));

  const halfLen = COURT_LENGTH / 2;
  const halfDoubles = DOUBLES_WIDTH / 2;
  const halfSingles = SINGLES_WIDTH / 2;
  // Baselines and doubles sidelines.
  group.add(line(p.minX, p.minY, p.maxX, p.minY));
  group.add(line(p.minX, p.maxY, p.maxX, p.maxY));
  group.add(line(p.minX, p.minY, p.minX, p.maxY));
  group.add(line(p.maxX, p.minY, p.maxX, p.maxY));
  // Singles sidelines.
  group.add(line(centerX - halfSingles, -halfLen, centerX - halfSingles, halfLen));
  group.add(line(centerX + halfSingles, -halfLen, centerX + halfSingles, halfLen));
  // Service lines and the centre service line.
  for (const s of [-SERVICE_LINE_FROM_NET, SERVICE_LINE_FROM_NET]) {
    group.add(line(centerX - halfSingles, s, centerX + halfSingles, s));
  }
  group.add(line(centerX, -SERVICE_LINE_FROM_NET, centerX, SERVICE_LINE_FROM_NET));
  // Centre marks.
  group.add(line(centerX, -halfLen, centerX, -halfLen + 0.1));
  group.add(line(centerX, halfLen - 0.1, centerX, halfLen));

  // The net runs east-west across the middle of the court: along the map's equator.
  const postSpan = DOUBLES_WIDTH + 2 * NET_POST_OUTSIDE_SIDELINE;
  const net = new THREE.Mesh(
    new THREE.BoxGeometry(postSpan, 0.95, 0.02),
    new THREE.MeshLambertMaterial({ color: COLORS.net, transparent: true, opacity: 0.55 }),
  );
  net.position.copy(toWorld(centerX, 0, 0.95 / 2));
  net.castShadow = true;
  group.add(net);
  const tape = new THREE.Mesh(
    new THREE.BoxGeometry(postSpan, 0.05, 0.03),
    new THREE.MeshLambertMaterial({ color: COLORS.line }),
  );
  tape.position.copy(toWorld(centerX, 0, 0.93));
  group.add(tape);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.07),
      new THREE.MeshLambertMaterial({ color: 0x2b2b2b }),
    );
    post.position.copy(
      toWorld(centerX + side * (halfDoubles + NET_POST_OUTSIDE_SIDELINE), 0, 0.535),
    );
    group.add(post);
  }

  group.add(courtNumberLabel(court));
  return group;
}

function buildFence(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'fence';
  const height = 3.66;
  const material = new THREE.MeshLambertMaterial({
    color: COLORS.fence,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
  });
  const hw = THEATER_WIDTH / 2;
  const hl = THEATER_LENGTH / 2;
  const sides: [number, number, number, number][] = [
    [-hw, -hl, hw, -hl],
    [-hw, hl, hw, hl],
    [-hw, -hl, -hw, hl],
    [hw, -hl, hw, hl],
  ];
  for (const [x1, y1, x2, y2] of sides) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(length, height), material);
    panel.position.copy(toWorld((x1 + x2) / 2, (y1 + y2) / 2, height / 2));
    if (x1 === x2) panel.rotation.y = Math.PI / 2;
    group.add(panel);
  }
  return group;
}

export interface TheaterScene {
  readonly scene: THREE.Scene;
  readonly courts: readonly THREE.Group[];
}

export function buildTheaterScene(): TheaterScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc9d3d8);
  scene.fog = new THREE.Fog(0xc9d3d8, 120, 260);

  const ground = flatRect(-150, 150, -150, 150, COLORS.ground, -0.01);
  ground.name = 'ground';
  scene.add(ground);

  const courts = COURTS.map(buildCourt);
  for (const c of courts) scene.add(c);
  scene.add(buildFence());

  scene.add(new THREE.HemisphereLight(0xf1f4f8, 0x55604a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff3df, 1.4);
  // A low November sun from the south-west.
  sun.position.set(-40, 35, 50);
  sun.castShadow = true;
  // Cover the whole theater and pavilion with the shadow map, or its frustum edge shows on the courts.
  const cam = sun.shadow.camera;
  cam.left = -60;
  cam.right = 60;
  cam.top = 45;
  cam.bottom = -45;
  cam.near = 1;
  cam.far = 200;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  return { scene, courts };
}
