import { describe, expect, it } from 'vitest';
import { garmentRects } from './apparatus';
import { COMBATANTS } from './data/combatants';
import { TARGETS } from './data/targets';
import { DEFAULT_WORLD_SITUATION } from './data/worldSituation';
import {
  CONTACT_HEIGHT,
  HOWITZER_PLATFORM,
  HOWITZER_RANGE_KM,
  adjudicateImpact,
  effectiveSwing,
  flatKillRadius,
  jockstrapBody,
  platformsFor,
  resolveLob,
  solveSpeed,
  validateLaunch,
  type LaunchOrder,
  type Swing,
} from './lob';
import { TENNIS_BALL, terminalVelocity } from './physics';
import { courtMetresToKm, kmToCourtMetres, project } from './projection';
import { createRng } from './rng';
import type { LonLat, TargetItem } from './types';

const ws = DEFAULT_WORLD_SITUATION;
const DEG = Math.PI / 180;

const target = (name: string): TargetItem => {
  const t = TARGETS.find((x) => x.name === name);
  if (!t) throw new Error(`no target ${name}`);
  return t;
};

const MINOT = target('Minot missile field');
const MOSCOW = target('Moscow');

/** A perfectly timed swing that should land on `to` from `platformAt`. */
function aimedSwing(
  platformAt: LonLat,
  to: LonLat,
  elevation: number,
  topspinRpm: number,
  warheads = 1,
): Swing {
  const aim = solveSpeed(project(platformAt), project(to), elevation, topspinRpm, warheads);
  if (!aim) throw new Error('out of reach');
  return { bearing: aim.bearing, elevation, speed: aim.speed, topspinRpm, timing: 0 };
}

const order = (o: Partial<LaunchOrder> & Pick<LaunchOrder, 'swing'>): LaunchOrder => ({
  combatant: 'AMNAT',
  platformId: MINOT.id,
  warheads: 1,
  ...o,
});

describe('launch platforms (A9)', () => {
  it('are a Combatant’s own missile fields, silos, bomber wings and submarines', () => {
    const amnat = platformsFor('AMNAT', ws);
    expect(amnat.map((p) => p.name)).toContain('Minot missile field');
    expect(amnat.map((p) => p.name)).toContain('Atlantic missile submarine');
    expect(amnat.map((p) => p.name)).toContain('Barksdale bomber wing');
    expect(amnat.every((p) => p.owner === 'AMNAT')).toBe(true);
    expect(amnat.map((p) => p.name)).not.toContain('New York');
    expect(amnat.map((p) => p.kind)).toEqual(expect.arrayContaining(['land', 'sea', 'air']));
  });

  it('give the insurgent cell its howitzer and nothing else', () => {
    const insurgent = platformsFor('INSURGENT', ws);
    expect(insurgent.map((p) => p.id)).toEqual([HOWITZER_PLATFORM]);
    expect(insurgent[0]?.kind).toBe('howitzer');
  });
});

describe('launch order validation', () => {
  const swing: Swing = { bearing: 0, elevation: 50 * DEG, speed: 20, topspinRpm: 1500, timing: 0 };

  it('accepts a single ball from one’s own missile field', () => {
    expect(validateLaunch(order({ swing }), ws, COMBATANTS, 10)).toEqual([]);
  });

  it('refuses to launch from another Combatant’s platform', () => {
    const problems = validateLaunch(order({ combatant: 'SOVWAR', swing }), ws, COMBATANTS, 10);
    expect(problems.join()).toMatch(/no launch platform/);
  });

  it('refuses to launch from a target that is not a platform', () => {
    const problems = validateLaunch(
      order({ platformId: target('New York').id, swing }),
      ws,
      COMBATANTS,
      10,
    );
    expect(problems.join()).toMatch(/no launch platform/);
  });

  it('caps the warheads in one jockstrap at the Combatant’s MIRV limit', () => {
    expect(validateLaunch(order({ warheads: 8, swing }), ws, COMBATANTS, 20)).toEqual([]);
    expect(validateLaunch(order({ warheads: 9, swing }), ws, COMBATANTS, 20).join()).toMatch(
      /at most 8/,
    );
  });

  it('cannot launch more warheads than are left in the bucket', () => {
    expect(validateLaunch(order({ warheads: 3, swing }), ws, COMBATANTS, 2).join()).toMatch(
      /only 2/,
    );
  });

  it('rejects howitzer aim points beyond 50 km', () => {
    const insurgent = (aimAt: LonLat): LaunchOrder =>
      order({ combatant: 'INSURGENT', platformId: HOWITZER_PLATFORM, swing, aimAt });
    expect(validateLaunch(insurgent(target('Detroit').at), ws, COMBATANTS, 6)).toEqual([]);
    expect(validateLaunch(insurgent(target('Toronto').at), ws, COMBATANTS, 6).join()).toMatch(
      /howitzer reaches 50 km/,
    );
  });
});

describe('the lob', () => {
  it('lands a perfectly timed topspin lob on its aim point', () => {
    const swing = aimedSwing(MINOT.at, MOSCOW.at, 55 * DEG, 2000);
    const result = resolveLob(order({ swing }), ws, createRng(1));
    expect(result.detonations).toHaveLength(1);
    const d = result.detonations[0];
    const want = project(MOSCOW.at);
    expect(Math.hypot((d?.at.x ?? 0) - want.x, (d?.at.y ?? 0) - want.y)).toBeLessThan(0.01);
    expect(d?.hits[0]?.item.name).toBe('Moscow');
    expect(d?.hits[0]?.kind).toBe('direct');
  });

  it('leaves the racquet at contact height and ends on the court', () => {
    const swing = aimedSwing(MINOT.at, MOSCOW.at, 55 * DEG, 2000);
    const { launch } = resolveLob(order({ swing }), ws, createRng(1));
    expect(launch.samples[0]?.position.z).toBe(CONTACT_HEIGHT);
    expect(launch.end.position.z).toBe(0);
    expect(launch.landed).toBe(true);
  });

  it('a mistimed swing pulls the ball off line and short', () => {
    const swing = aimedSwing(MINOT.at, MOSCOW.at, 55 * DEG, 2000);
    const want = project(MOSCOW.at);
    const late = resolveLob(order({ swing: { ...swing, timing: 0.5 } }), ws, createRng(1));
    const at = late.detonations[0]?.at ?? { x: 0, y: 0 };
    const from = project(MINOT.at);
    expect(Math.hypot(at.x - want.x, at.y - want.y)).toBeGreaterThan(1);
    expect(Math.hypot(at.x - from.x, at.y - from.y)).toBeLessThan(
      Math.hypot(want.x - from.x, want.y - from.y),
    );
    expect(effectiveSwing({ ...swing, timing: 3 }).speed).toBeCloseTo(
      effectiveSwing({ ...swing, timing: 1 }).speed,
    );
  });

  it('is deterministic: the same order and seed give the same detonations', () => {
    const swing = aimedSwing(MINOT.at, MOSCOW.at, 60 * DEG, 0, 4);
    const a = resolveLob(order({ warheads: 4, swing }), ws, createRng(42));
    const b = resolveLob(order({ warheads: 4, swing }), ws, createRng(42));
    expect(a.detonations.map((d) => d.at)).toEqual(b.detonations.map((d) => d.at));
  });
});

describe('MIRV jockstraps', () => {
  const swing = aimedSwing(MINOT.at, MOSCOW.at, 60 * DEG, 0, 6);

  it('open at the top of the arc and scatter one warhead per ball', () => {
    const result = resolveLob(order({ warheads: 6, swing }), ws, createRng(7));
    expect(result.launch.landed).toBe(false);
    expect(Math.abs(result.launch.end.velocity.z)).toBeLessThan(1e-6);
    expect(result.warheadFlights).toHaveLength(6);
    expect(result.detonations.map((d) => d.warhead)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const f of result.warheadFlights)
      expect(f.samples[0]?.position).toEqual(result.launch.end.position);
  });

  it('spread the warheads around the aim point, each landing apart', () => {
    const result = resolveLob(order({ warheads: 6, swing }), ws, createRng(7));
    const want = project(MOSCOW.at);
    const spots = result.detonations.map((d) => d.at);
    for (const p of spots) expect(Math.hypot(p.x - want.x, p.y - want.y)).toBeLessThan(5);
    const distinct = new Set(spots.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`));
    expect(distinct.size).toBe(6);
  });

  it('scatter differently under a different seed', () => {
    const a = resolveLob(order({ warheads: 6, swing }), ws, createRng(7));
    const b = resolveLob(order({ warheads: 6, swing }), ws, createRng(8));
    expect(a.detonations.map((d) => d.at)).not.toEqual(b.detonations.map((d) => d.at));
  });

  it('a packed jockstrap is heavier and bulkier than one ball, and tumbles without lift', () => {
    const body = jockstrapBody(6);
    expect(body.mass).toBeGreaterThan(6 * TENNIS_BALL.mass);
    expect(body.radius).toBeGreaterThan(TENNIS_BALL.radius);
    expect(body.magnus).toBe(false);
    expect(terminalVelocity(body)).toBeGreaterThan(terminalVelocity(jockstrapBody(1)));
  });
});

describe('the howitzer (A9)', () => {
  const howitzer = ws.howitzerAt ?? { lon: 0, lat: 0 };
  const shell = (swing: Swing): LaunchOrder =>
    order({ combatant: 'INSURGENT', platformId: HOWITZER_PLATFORM, swing });

  it('reaches Detroit across the river', () => {
    const swing = aimedSwing(howitzer, target('Detroit').at, 80 * DEG, 0);
    const result = resolveLob(shell(swing), ws, createRng(1));
    expect(result.outOfRange).toBe(0);
    expect(result.detonations[0]?.hits.map((h) => h.item.name)).toContain('Detroit');
  });

  it('does nothing with a shell that lands beyond 50 km', () => {
    const swing: Swing = {
      bearing: 60 * DEG,
      elevation: 45 * DEG,
      speed: 5,
      topspinRpm: 0,
      timing: 0,
    };
    const result = resolveLob(shell(swing), ws, createRng(1));
    const end = result.launch.end.position;
    const from = project(howitzer);
    expect(courtMetresToKm(Math.hypot(end.x - from.x, end.y - from.y))).toBeGreaterThan(
      HOWITZER_RANGE_KM,
    );
    expect(result.outOfRange).toBe(1);
    expect(result.detonations).toEqual([]);
  });
});

describe('first contact (A1)', () => {
  const rects = garmentRects();
  const moscow = rects.find((r) => r.item.name === 'Moscow');
  if (!moscow) throw new Error('no Moscow');

  it('inside a garment is a direct hit', () => {
    const d = adjudicateImpact({ x: moscow.x, y: moscow.y }, 1);
    expect(d.hits.find((h) => h.item.name === 'Moscow')?.kind).toBe('direct');
    expect(d.offMap).toBe(false);
    expect(d.court).toBeDefined();
  });

  it('within the kill radius of a garment is an indirect hit', () => {
    const r = flatKillRadius(moscow.item);
    expect(r).toBeCloseTo(kmToCourtMetres(10.1), 12);
    const at = { x: moscow.x + moscow.halfWidth + r * 0.5, y: moscow.y };
    const hit = adjudicateImpact(at, 1).hits.find((h) => h.item.name === 'Moscow');
    expect(hit?.kind).toBe('indirect');
    expect(hit?.distance).toBeCloseTo(r * 0.5, 9);
  });

  it('beyond the kill radius of every garment touches nothing', () => {
    const r = flatKillRadius(moscow.item);
    const d = adjudicateImpact(
      { x: moscow.x + moscow.halfWidth + r * 1.5, y: moscow.y },
      1,
      flatKillRadius,
      [moscow],
    );
    expect(d.hits).toEqual([]);
  });

  it('off the theater is off the map and scores nothing', () => {
    const d = adjudicateImpact({ x: 0, y: 30 }, 1);
    expect(d.offMap).toBe(true);
    expect(d.hits).toEqual([]);
    expect(d.court).toBeUndefined();
  });
});
