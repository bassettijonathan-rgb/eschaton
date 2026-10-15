/**
 * Flight of a tennis ball: gravity, quadratic drag and the Magnus force,
 * integrated with fourth-order Runge–Kutta. An ICBM in Eschaton is a topspin
 * lob, so topspin has to make a lob dip the way it does on a real court.
 *
 * Frame: metres on the court, x east, y north, z up, origin at the theater's
 * centre on the court surface.
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const add = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z);
const scale = (a: Vec3, k: number): Vec3 => vec(a.x * k, a.y * k, a.z * k);
const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

export const GRAVITY = 9.81;
/** Sea-level air at about 15 °C, kg/m³. */
export const AIR_DENSITY = 1.21;

export interface Body {
  /** kg */
  readonly mass: number;
  /** Radius of the cross-section the air sees, m. */
  readonly radius: number;
  readonly dragCoefficient: number;
  /** Whether spin produces Magnus lift (a tumbling jockstrap's does not). */
  readonly magnus: boolean;
}

/** A regulation tennis ball: 57 g, 6.7 cm across. */
export const TENNIS_BALL: Body = {
  mass: 0.057,
  radius: 0.0335,
  dragCoefficient: 0.55,
  magnus: true,
};

export interface FlightState {
  readonly position: Vec3;
  readonly velocity: Vec3;
  /** Angular velocity, rad/s; its direction is the spin axis by the right-hand rule. */
  readonly spin: Vec3;
}

/**
 * Lift coefficient from the spin ratio S = rω/v, after Cross and Lindsey's
 * measurements on tennis balls: C_L ≈ 1 / (2 + 1/S).
 */
export function liftCoefficient(spinRatio: number): number {
  if (spinRatio <= 0) return 0;
  return 1 / (2 + 1 / spinRatio);
}

export function acceleration(body: Body, velocity: Vec3, spin: Vec3): Vec3 {
  const speed = length(velocity);
  const area = Math.PI * body.radius * body.radius;
  let a = vec(0, 0, -GRAVITY);
  if (speed === 0) return a;
  const q = 0.5 * AIR_DENSITY * area * speed * speed; // dynamic pressure × area
  a = add(a, scale(velocity, (-q * body.dragCoefficient) / (body.mass * speed)));
  if (body.magnus) {
    const w = length(spin);
    const axis = cross(spin, velocity);
    const axisLen = length(axis);
    if (w > 0 && axisLen > 0) {
      const cl = liftCoefficient((body.radius * w) / speed);
      a = add(a, scale(axis, (q * cl) / (body.mass * axisLen)));
    }
  }
  return a;
}

export interface FlightSample {
  readonly t: number;
  readonly position: Vec3;
}

export interface Flight {
  readonly samples: readonly FlightSample[];
  /** Where the flight ended: first contact with the court, or the stop condition. */
  readonly end: FlightState;
  readonly duration: number;
  readonly landed: boolean;
  /** Stopped by something standing on the court before it reached the court. */
  readonly obstructed: boolean;
}

export interface SimulateOptions {
  /** Integration step, s. */
  readonly dt?: number;
  /** Seconds between recorded samples, for drawing. */
  readonly sampleEvery?: number;
  /** Stop at the top of the arc instead of at the court. */
  readonly stopAtApex?: boolean;
  readonly maxTime?: number;
  /**
   * Something standing on the court: given one step of the flight, the
   * fraction of the step at which the ball first touches it, if it does.
   */
  readonly obstacle?: (from: Vec3, to: Vec3) => number | undefined;
}

function rk4(body: Body, s: FlightState, dt: number): FlightState {
  const a1 = acceleration(body, s.velocity, s.spin);
  const v1 = s.velocity;
  const v2 = add(s.velocity, scale(a1, dt / 2));
  const a2 = acceleration(body, v2, s.spin);
  const v3 = add(s.velocity, scale(a2, dt / 2));
  const a3 = acceleration(body, v3, s.spin);
  const v4 = add(s.velocity, scale(a3, dt));
  const a4 = acceleration(body, v4, s.spin);
  const dx = scale(add(add(v1, scale(v2, 2)), add(scale(v3, 2), v4)), dt / 6);
  const dv = scale(add(add(a1, scale(a2, 2)), add(scale(a3, 2), a4)), dt / 6);
  return { position: add(s.position, dx), velocity: add(s.velocity, dv), spin: s.spin };
}

/**
 * Fly a body until it first touches the court (z = 0), or until the top of
 * its arc. The contact point is interpolated within the last step, so where
 * a ball detonates does not depend on the step size: first contact (A1).
 */
export function simulate(body: Body, start: FlightState, options: SimulateOptions = {}): Flight {
  const dt = options.dt ?? 0.001;
  const sampleEvery = options.sampleEvery ?? 0.02;
  const maxTime = options.maxTime ?? 60;
  const samples: FlightSample[] = [{ t: 0, position: start.position }];
  let s = start;
  let t = 0;
  let nextSample = sampleEvery;
  while (t < maxTime) {
    const next = rk4(body, s, dt);
    if (options.stopAtApex && s.velocity.z > 0 && next.velocity.z <= 0) {
      const f = s.velocity.z / (s.velocity.z - next.velocity.z);
      const end = lerpState(s, next, f);
      samples.push({ t: t + f * dt, position: end.position });
      return { samples, end, duration: t + f * dt, landed: false, obstructed: false };
    }
    const blocked = options.obstacle?.(s.position, next.position);
    if (blocked !== undefined) {
      const end = lerpState(s, next, blocked);
      samples.push({ t: t + blocked * dt, position: end.position });
      return { samples, end, duration: t + blocked * dt, landed: false, obstructed: true };
    }
    if (next.position.z <= 0 && t > 0) {
      const f = s.position.z / (s.position.z - next.position.z);
      const end = lerpState(s, next, f);
      const contact = { ...end, position: vec(end.position.x, end.position.y, 0) };
      samples.push({ t: t + f * dt, position: contact.position });
      return { samples, end: contact, duration: t + f * dt, landed: true, obstructed: false };
    }
    s = next;
    t += dt;
    if (t >= nextSample - 1e-9) {
      samples.push({ t, position: s.position });
      nextSample += sampleEvery;
    }
  }
  return { samples, end: s, duration: t, landed: false, obstructed: false };
}

function lerpState(a: FlightState, b: FlightState, f: number): FlightState {
  const lerp = (p: Vec3, q: Vec3): Vec3 =>
    vec(p.x + (q.x - p.x) * f, p.y + (q.y - p.y) * f, p.z + (q.z - p.z) * f);
  return {
    position: lerp(a.position, b.position),
    velocity: lerp(a.velocity, b.velocity),
    spin: a.spin,
  };
}

/** Terminal velocity of a body falling through still air. */
export function terminalVelocity(body: Body): number {
  return Math.sqrt(
    (2 * body.mass * GRAVITY) / (AIR_DENSITY * Math.PI * body.radius ** 2 * body.dragCoefficient),
  );
}

export const RPM = (2 * Math.PI) / 60;

/**
 * A launch: speed and elevation along a compass bearing (radians clockwise
 * from north), with topspin (positive) or backspin (negative) about the axis
 * across the line of flight, and optional sidespin about the vertical.
 */
export function launchState(
  origin: Vec3,
  bearing: number,
  elevation: number,
  speed: number,
  topspinRpm: number,
  sidespinRpm = 0,
): FlightState {
  const dx = Math.sin(bearing);
  const dy = Math.cos(bearing);
  const horizontal = speed * Math.cos(elevation);
  const velocity = vec(horizontal * dx, horizontal * dy, speed * Math.sin(elevation));
  // Topspin turns the top of the ball forward: its axis is up × direction of travel.
  const topAxis = vec(-dy, dx, 0);
  const spin = add(scale(topAxis, topspinRpm * RPM), vec(0, 0, sidespinRpm * RPM));
  return { position: origin, velocity, spin };
}
