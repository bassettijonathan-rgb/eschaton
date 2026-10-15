import { describe, expect, it } from 'vitest';
import {
  GRAVITY,
  TENNIS_BALL,
  launchState,
  length,
  liftCoefficient,
  simulate,
  terminalVelocity,
  vec,
  type Body,
} from './physics';

const deg = (d: number) => (d * Math.PI) / 180;
const EAST = deg(90);
const NORTH = 0;
const VACUUM: Body = { ...TENNIS_BALL, dragCoefficient: 0, magnus: false };

const range = (body: Body, speed: number, elevationDeg: number, topspin = 0, height = 1) => {
  const f = simulate(body, launchState(vec(0, 0, height), EAST, deg(elevationDeg), speed, topspin));
  return f.end.position.x;
};

describe('ball flight', () => {
  it('follows the textbook parabola in a vacuum', () => {
    for (const [v, a, h] of [
      [20, 45, 1],
      [15, 60, 1],
      [30, 30, 0.5],
    ] as const) {
      const th = deg(a);
      const analytic =
        (v *
          Math.cos(th) *
          (v * Math.sin(th) + Math.sqrt((v * Math.sin(th)) ** 2 + 2 * GRAVITY * h))) /
        GRAVITY;
      expect(range(VACUUM, v, a, 0, h)).toBeCloseTo(analytic, 3);
    }
  });

  it('falls at a terminal velocity of about 22 m/s, as a real tennis ball does', () => {
    const vt = terminalVelocity(TENNIS_BALL);
    expect(vt).toBeGreaterThan(20);
    expect(vt).toBeLessThan(23);
    const drop = simulate(TENNIS_BALL, {
      position: vec(0, 0, 400),
      velocity: vec(0, 0, 0),
      spin: vec(0, 0, 0),
    });
    expect(length(drop.end.velocity)).toBeCloseTo(vt, 1);
  });

  it('loses range to drag', () => {
    expect(range(TENNIS_BALL, 25, 45)).toBeLessThan(0.75 * range(VACUUM, 25, 45));
  });

  it('dips with topspin and floats with backspin', () => {
    const flat = simulate(TENNIS_BALL, launchState(vec(0, 0, 1), EAST, deg(50), 20, 0));
    const top = simulate(TENNIS_BALL, launchState(vec(0, 0, 1), EAST, deg(50), 20, 2500));
    expect(top.end.position.x).toBeLessThan(flat.end.position.x - 1);
    // A low drive with backspin carries farther than a flat one (at steep angles
    // the lift tilts backwards and shortens it instead).
    const lowFlat = simulate(TENNIS_BALL, launchState(vec(0, 0, 1), EAST, deg(12), 25, 0));
    const lowBack = simulate(TENNIS_BALL, launchState(vec(0, 0, 1), EAST, deg(12), 25, -1500));
    expect(lowBack.end.position.x).toBeGreaterThan(lowFlat.end.position.x + 1);
    const descent = (f: typeof flat) => Math.atan2(-f.end.velocity.z, f.end.velocity.x);
    expect(descent(top)).toBeGreaterThan(descent(flat));
    // A topspin lob stays straight: no sideways drift.
    expect(Math.abs(top.end.position.y)).toBeLessThan(1e-9);
  });

  it('curves with sidespin, to the left for anticlockwise spin seen from above', () => {
    const f = simulate(TENNIS_BALL, launchState(vec(0, 0, 1), NORTH, deg(30), 25, 0, 1500));
    expect(f.end.position.x).toBeLessThan(-0.5);
  });

  it('uses Cross and Lindsey’s lift coefficient', () => {
    expect(liftCoefficient(0)).toBe(0);
    expect(liftCoefficient(1)).toBeCloseTo(1 / 3, 12);
    expect(liftCoefficient(0.2)).toBeCloseTo(1 / 7, 12);
  });

  it('ends at first contact with the court, interpolated, whatever the step size', () => {
    const a = simulate(TENNIS_BALL, launchState(vec(0, 0, 1), EAST, deg(55), 18, 1800), {
      dt: 0.001,
    });
    const b = simulate(TENNIS_BALL, launchState(vec(0, 0, 1), EAST, deg(55), 18, 1800), {
      dt: 0.0002,
    });
    expect(a.landed).toBe(true);
    expect(a.end.position.z).toBe(0);
    expect(a.end.velocity.z).toBeLessThan(0);
    expect(a.end.position.x).toBeCloseTo(b.end.position.x, 3);
  });

  it('stops at the top of the arc when asked', () => {
    const f = simulate(VACUUM, launchState(vec(0, 0, 1), EAST, deg(45), 20, 0), {
      stopAtApex: true,
    });
    const vz = 20 * Math.sin(deg(45));
    expect(f.end.velocity.z).toBeCloseTo(0, 6);
    expect(f.end.position.z).toBeCloseTo(1 + (vz * vz) / (2 * GRAVITY), 3);
  });

  it('pins a reference lob so the physics cannot drift unnoticed', () => {
    // 20 m/s at 55°, 2,000 rpm topspin, struck 1 m up: lands about 23.6 m away after 2.7 s,
    // where the same shot in a vacuum would carry 39 m.
    const f = simulate(TENNIS_BALL, launchState(vec(0, 0, 1), EAST, deg(55), 20, 2000));
    expect(f.end.position.x).toBeCloseTo(REFERENCE.x, 2);
    expect(f.duration).toBeCloseTo(REFERENCE.t, 2);
  });
});

const REFERENCE = { x: 23.604, t: 2.666 };
