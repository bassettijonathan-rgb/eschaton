import * as THREE from 'three';
import { FLAT_KILL_RADIUS_KM, type Detonation, type LobResult } from '../engine/lob';
import type { Flight } from '../engine/physics';
import { kmToCourtMetres, type CourtPoint } from '../engine/projection';
import { toWorld } from './theaterScene';

const BALL_RADIUS = 0.0335;
const FLASH_SECONDS = 0.9;

interface Segment {
  readonly flight: Flight;
  readonly start: number;
  readonly ball: THREE.Group;
  readonly trail: THREE.Line;
  /** The warhead this segment carries to the court, if it ends in one. */
  readonly detonation: Detonation | undefined;
  /** It ends with the jockstrap opening, or with a shell that does nothing. */
  /** thud: it struck the apparatus, which is not the map, and did nothing. */
  readonly ending: 'detonate' | 'open' | 'dud' | 'thud';
  done: boolean;
}

interface Flash {
  readonly mesh: THREE.Mesh;
  readonly start: number;
}

function ballMesh(color: number, radius: number): THREE.Group {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 12),
    new THREE.MeshLambertMaterial({ color }),
  );
  ball.castShadow = true;
  // A faint halo so a 6.7 cm ball can be followed from the pavilion.
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(radius * 3, 0.12), 12, 8),
    new THREE.MeshBasicMaterial({
      color: 0xfff4a0,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    }),
  );
  g.add(ball, halo);
  return g;
}

function trailLine(flight: Flight, color: number): THREE.Line {
  const positions = new Float32Array(flight.samples.length * 3);
  flight.samples.forEach((s, i) => {
    const w = toWorld(s.position.x, s.position.y, s.position.z);
    positions.set([w.x, w.y, w.z], i * 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }),
  );
  line.frustumCulled = false;
  return line;
}

function positionAt(flight: Flight, t: number): { point: THREE.Vector3; drawn: number } {
  const s = flight.samples;
  let i = 0;
  while (i < s.length - 1 && (s[i + 1]?.t ?? Infinity) <= t) i++;
  const a = s[i];
  const b = s[Math.min(i + 1, s.length - 1)];
  if (!a || !b) return { point: new THREE.Vector3(), drawn: 0 };
  const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
  const p = {
    x: a.position.x + (b.position.x - a.position.x) * f,
    y: a.position.y + (b.position.y - a.position.y) * f,
    z: a.position.z + (b.position.z - a.position.z) * f,
  };
  return { point: toWorld(p.x, p.y, p.z), drawn: i + 1 };
}

/**
 * Plays lobs back in real time: the ball (or the jockstrap, then its
 * warheads) along its flight with a trail, a flash where each warhead first
 * touches the court, and a lasting burn mark with its kill radius.
 */
export class FlightPlayer {
  readonly group = new THREE.Group();
  private readonly marks = new THREE.Group();
  private segments: Segment[] = [];
  private flashes: Flash[] = [];
  private trails: THREE.Line[] = [];
  private startedAt = 0;
  private onDetonate: ((d: Detonation) => void) | undefined;
  private onDone: (() => void) | undefined;

  constructor() {
    this.group.name = 'flights';
    this.marks.name = 'burn-marks';
    this.group.add(this.marks);
  }

  /** Wipe the courts: burn marks and trails go, as when a new game starts. */
  reset(): void {
    this.clearSegments();
    this.marks.clear();
  }

  busy(): boolean {
    return this.segments.length > 0;
  }

  play(
    result: LobResult,
    now: number,
    onDetonate?: (d: Detonation) => void,
    onDone?: () => void,
  ): void {
    this.clearSegments();
    this.startedAt = now;
    this.onDetonate = onDetonate;
    this.onDone = onDone;
    const byWarhead = new Map(result.detonations.map((d) => [d.warhead, d]));
    const mirv = result.order.warheads > 1;
    if (mirv) {
      const stopped = result.warheadFlights.length === 0 && result.detonations[0]?.struck;
      this.addSegment(
        result.launch,
        0,
        undefined,
        stopped ? 'thud' : 'open',
        0xd8d4c8,
        BALL_RADIUS * 2.2,
      );
    }
    result.warheadFlights.forEach((f, i) => {
      const d = byWarhead.get(i + 1);
      this.addSegment(
        f,
        mirv ? result.launch.duration : 0,
        d,
        d?.struck ? 'thud' : d ? 'detonate' : 'dud',
        0xd7e04a,
        BALL_RADIUS,
      );
    });
  }

  private addSegment(
    flight: Flight,
    start: number,
    detonation: Detonation | undefined,
    ending: Segment['ending'],
    color: number,
    radius: number,
  ): void {
    const ball = ballMesh(color, radius);
    ball.visible = false;
    const trail = trailLine(flight, ending === 'open' ? 0xd8d4c8 : 0xfff07a);
    this.group.add(ball, trail);
    this.segments.push({ flight, start, ball, trail, detonation, ending, done: false });
  }

  /** How much faster than life the flights play. */
  timeScale = 1;

  update(now: number): void {
    const t = (now - this.startedAt) * this.timeScale;
    for (const s of this.segments) {
      if (s.done || t < s.start) continue;
      const local = t - s.start;
      const { point, drawn } = positionAt(s.flight, local);
      s.ball.visible = true;
      s.ball.position.copy(point);
      s.trail.geometry.setDrawRange(0, drawn);
      if (local >= s.flight.duration) {
        s.done = true;
        s.ball.visible = false;
        s.trail.geometry.setDrawRange(0, s.flight.samples.length);
        const end = s.flight.end.position;
        if (s.ending === 'detonate' && s.detonation) {
          this.flash(end, now, 0xffb347);
          this.burn(s.detonation);
          this.onDetonate?.(s.detonation);
        } else if (s.ending === 'dud') this.flash(end, now, 0x9a9a9a);
        else if (s.ending === 'thud') this.flash(end, now, 0xf4f1e8, end.z);
      }
    }
    for (const f of this.flashes) {
      const k = (now - f.start) / FLASH_SECONDS;
      f.mesh.scale.setScalar(0.05 + k * 0.4);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k);
      if (k >= 1) this.group.remove(f.mesh);
    }
    this.flashes = this.flashes.filter((f) => now - f.start < FLASH_SECONDS);
    if (
      this.segments.length > 0 &&
      this.segments.every((s) => s.done) &&
      this.flashes.length === 0
    ) {
      // The trails stay on the courts until the next lob; the balls go.
      for (const s of this.segments) this.group.remove(s.ball);
      this.trails = this.segments.map((s) => s.trail);
      this.segments = [];
      const done = this.onDone;
      this.onDone = undefined;
      done?.();
    }
  }

  private flash(at: { x: number; y: number }, now: number, color: number, height = 0): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }),
    );
    mesh.position.copy(toWorld(at.x, at.y, height));
    mesh.scale.setScalar(0.05);
    this.group.add(mesh);
    this.flashes.push({ mesh, start: now });
  }

  /** A scorch mark where the warhead touched down, ringed at its kill radius. */
  private burn(d: Detonation): void {
    const at = d.at;
    const scorch = new THREE.Mesh(
      new THREE.CircleGeometry(0.03, 20),
      new THREE.MeshBasicMaterial({
        color: 0x2b1d14,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.copy(toWorld(at.x, at.y, 0.004));
    scorch.renderOrder = 3;
    const r = d.hits[0]?.killRadius ?? kmToCourtMetres(FLAT_KILL_RADIUS_KM);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.85, Math.max(r, r * 0.85 + 0.004), 40),
      new THREE.MeshBasicMaterial({ color: 0xd9312b, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(toWorld(at.x, at.y, 0.005));
    ring.renderOrder = 3;
    const mark = new THREE.Group();
    mark.name = `detonation-${String(this.marks.children.length + 1)}`;
    mark.add(scorch, ring);
    this.marks.add(mark);
  }

  private clearSegments(): void {
    for (const t of this.trails) {
      this.group.remove(t);
      t.geometry.dispose();
    }
    this.trails = [];
    for (const s of this.segments) {
      this.group.remove(s.ball, s.trail);
      s.trail.geometry.dispose();
    }
    this.segments = [];
  }
}

/** The aim: a line along the ground from the launch platform and a crosshair on the aim point. */
export class AimPreview {
  readonly group = new THREE.Group();
  private readonly line: THREE.Line;
  private readonly cross: THREE.Mesh;
  private readonly origin: THREE.Mesh;

  constructor() {
    this.group.name = 'aim';
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    this.line = new THREE.Line(
      geometry,
      new THREE.LineDashedMaterial({
        color: 0xffe066,
        dashSize: 0.3,
        gapSize: 0.2,
        depthTest: false,
      }),
    );
    this.line.renderOrder = 9;
    const ring = (inner: number, outer: number, color: number): THREE.Mesh => {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(inner, outer, 32),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: false }),
      );
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 9;
      return m;
    };
    this.cross = ring(0.1, 0.13, 0xffe066);
    this.origin = ring(0.14, 0.17, 0xffffff);
    this.group.add(this.line, this.cross, this.origin);
    this.group.visible = false;
  }

  show(from: CourtPoint | undefined, to: CourtPoint | undefined): void {
    this.origin.visible = !!from;
    this.cross.visible = !!to;
    this.line.visible = !!from && !!to;
    this.group.visible = !!from || !!to;
    if (from) this.origin.position.copy(toWorld(from.x, from.y, 0.01));
    if (to) this.cross.position.copy(toWorld(to.x, to.y, 0.01));
    if (from && to) {
      this.line.geometry.setFromPoints([toWorld(from.x, from.y, 0.01), toWorld(to.x, to.y, 0.01)]);
      this.line.computeLineDistances();
    }
  }
}
