/**
 * Real weather over the East Courts: snow or rain falling on the map. It is
 * drawn and nothing more. EndStat reads only the World Situation's weather
 * (section 1.7), so nothing here touches the engine.
 */
import * as THREE from 'three';
import type { Precipitation } from '../engine/types';
import { THEATER_LENGTH, THEATER_WIDTH } from '../engine/theater';

const COUNT = 3000;
const CEILING = 14;

interface Fall {
  readonly speed: number;
  readonly drift: number;
  readonly color: number;
  readonly size: number;
  readonly opacity: number;
}

const FALLS: Readonly<Record<Exclude<Precipitation, 'none'>, Fall>> = {
  snow: { speed: 0.9, drift: 0.35, color: 0xffffff, size: 0.18, opacity: 0.9 },
  rain: { speed: 9, drift: 0.05, color: 0x9fb4c4, size: 0.05, opacity: 0.6 },
};

export class CourtWeather {
  readonly group = new THREE.Group();
  private readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly attribute: THREE.BufferAttribute;
  private readonly phase: Float32Array;
  private kind: Precipitation = 'none';
  private last = 0;

  constructor() {
    this.group.name = 'court-weather';
    this.positions = new Float32Array(COUNT * 3);
    this.phase = new Float32Array(COUNT);
    // A fixed scatter, so the same weather always looks the same.
    let seed = 12345;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < COUNT; i++) {
      this.positions[i * 3] = (rand() - 0.5) * (THEATER_WIDTH + 6);
      this.positions[i * 3 + 1] = rand() * CEILING;
      this.positions[i * 3 + 2] = (rand() - 0.5) * (THEATER_LENGTH + 6);
      this.phase[i] = rand() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    this.attribute = new THREE.BufferAttribute(this.positions, 3);
    geometry.setAttribute('position', this.attribute);
    this.points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ size: 0.09, transparent: true, depthWrite: false }),
    );
    this.points.frustumCulled = false;
    this.group.add(this.points);
    this.group.visible = false;
  }

  set(kind: Precipitation): void {
    this.kind = kind;
    this.group.userData['precipitation'] = kind;
    this.group.visible = kind !== 'none';
    if (kind === 'none') return;
    const fall = FALLS[kind];
    const m = this.points.material as THREE.PointsMaterial;
    m.color.setHex(fall.color);
    m.size = fall.size;
    m.opacity = fall.opacity;
  }

  update(now: number): void {
    const dt = Math.min(0.1, now - this.last);
    this.last = now;
    if (this.kind === 'none') return;
    const fall = FALLS[this.kind];
    for (let i = 0; i < COUNT; i++) {
      const k = i * 3;
      let y = (this.positions[k + 1] ?? 0) - fall.speed * dt;
      if (y < 0) y += CEILING;
      this.positions[k + 1] = y;
      const sway = Math.sin(now * 0.7 + (this.phase[i] ?? 0)) * fall.drift * dt;
      this.positions[k] = (this.positions[k] ?? 0) + sway;
    }
    this.attribute.needsUpdate = true;
  }
}
