import * as THREE from 'three';
import type { Position } from 'geojson';
import { OWNER_COLORS } from '../engine/data/territories';
import { THEATER_LENGTH, THEATER_WIDTH } from '../engine/theater';
import { EAST_GERMANY_OUTLINE, TERRITORIES } from '../engine/territory';
import { toWorld } from './theaterScene';

const W = 4096;
const H = 2048;

const px = (lon: number): number => ((lon + 180) / 360) * W;
const py = (lat: number): number => ((90 - lat) / 180) * H;

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${String((n >> 16) & 255)}, ${String((n >> 8) & 255)}, ${String(n & 255)}, ${String(alpha)})`;
}

/** Trace a ring, drawn once where it is and again shifted by -360° for rings past 180°. */
function traceRing(ctx: Path2D, ring: readonly Position[], shift: number): void {
  ring.forEach(([lon = 0, lat = 0], i) => {
    const x = px(lon + shift);
    const y = py(lat);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function crossesPole(ring: readonly Position[]): boolean {
  let jumps = 0;
  for (let k = 1; k < ring.length; k++)
    if (Math.abs((ring[k]?.[0] ?? 0) - (ring[k - 1]?.[0] ?? 0)) > 180) jumps++;
  return jumps % 2 === 1;
}

/** Antarctica's ring circles the pole: close it along the bottom edge of the map. */
function tracePolarRing(ctx: Path2D, ring: readonly Position[]): void {
  const sorted = [...ring];
  let start = 0;
  for (let k = 1; k < sorted.length; k++)
    if (Math.abs((sorted[k]?.[0] ?? 0) - (sorted[k - 1]?.[0] ?? 0)) > 180) start = k;
  const rotated = [...sorted.slice(start), ...sorted.slice(0, start)];
  const first = rotated[0] ?? [0, 0];
  const last = rotated[rotated.length - 1] ?? [0, 0];
  ctx.moveTo(px(first[0] ?? 0), py(first[1] ?? 0));
  for (const [lon = 0, lat = 0] of rotated) ctx.lineTo(px(lon), py(lat));
  ctx.lineTo(px(last[0] ?? 0), H);
  ctx.lineTo(px(first[0] ?? 0), H);
  ctx.closePath();
}

/**
 * The world, faintly drawn on the court surface: land, each Combatant's
 * territory tinted in its colour, coastlines and a 30° graticule.
 */
export function drawMapCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Graticule.
  ctx.strokeStyle = 'rgba(244, 241, 232, 0.12)';
  ctx.lineWidth = 2;
  for (let lon = -150; lon <= 150; lon += 30) {
    ctx.beginPath();
    ctx.moveTo(px(lon), 0);
    ctx.lineTo(px(lon), H);
    ctx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    ctx.beginPath();
    ctx.moveTo(0, py(lat));
    ctx.lineTo(W, py(lat));
    ctx.stroke();
  }

  for (const t of TERRITORIES) {
    const path = new Path2D();
    for (const poly of t.polygons) {
      const [outer] = poly;
      if (!outer) continue;
      if (crossesPole(outer)) {
        tracePolarRing(path, outer);
        continue;
      }
      traceRing(path, outer, 0);
      if (t.bbox[2] > 180) traceRing(path, outer, -360);
    }
    const fill = t.owner ? hexToRgba(OWNER_COLORS[t.owner], 0.26) : 'rgba(244, 241, 232, 0.08)';
    if (t.countryId === '276') {
      // Germany: West in AMNAT's colour, the East (drawn back in by hand) in SOVWAR's.
      const east = new Path2D();
      traceRing(east, EAST_GERMANY_OUTLINE, 0);
      ctx.save();
      ctx.clip(path);
      ctx.fillStyle = fill;
      ctx.fill(path);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      ctx.fill(east);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = hexToRgba(OWNER_COLORS.SOVWAR, 0.26);
      ctx.fill(east);
      ctx.strokeStyle = 'rgba(244, 241, 232, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke(east);
      ctx.restore();
    } else {
      ctx.fillStyle = fill;
      ctx.fill(path, 'evenodd');
    }
    ctx.strokeStyle = 'rgba(244, 241, 232, 0.5)';
    ctx.lineWidth = 2.5;
    ctx.stroke(path);
  }

  return canvas;
}

export function buildMapMesh(): THREE.Mesh {
  const texture = new THREE.CanvasTexture(drawMapCanvas());
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const geometry = new THREE.PlaneGeometry(THEATER_WIDTH, THEATER_LENGTH);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  mesh.position.copy(toWorld(0, 0, 0.0015));
  mesh.name = 'map';
  mesh.renderOrder = 1;
  return mesh;
}
