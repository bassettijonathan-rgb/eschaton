/**
 * Shots for tests: perfectly timed swings that do exactly what a test needs.
 */
import { DEFAULT_WORLD_SITUATION } from './data/worldSituation';
import { CONTACT_HEIGHT, platformsFor, solveSpeed, type LaunchOrder } from './lob';
import { TENNIS_BALL, launchState, simulate, vec } from './physics';
import { project, unproject, type CourtPoint } from './projection';
import type { CombatantId, WorldSituation } from './types';

const ELEVATION = (55 * Math.PI) / 180;
const SPIN = 1500;

/**
 * A perfectly timed single-warhead order that passes through a point above
 * the court: aim at the ground, see where the ball is at that height on the
 * way down, and shift the aim until it goes through.
 */
export function through(
  by: CombatantId,
  platformName: string,
  p: CourtPoint,
  z: number,
  ws: WorldSituation = DEFAULT_WORLD_SITUATION,
): LaunchOrder {
  const platform = platformsFor(by, ws).find((x) => x.name === platformName);
  if (!platform) throw new Error(platformName);
  const from = project(platform.at);
  let aim = { ...p };
  let swing = { bearing: 0, elevation: ELEVATION, speed: 0, topspinRpm: SPIN, timing: 0 };
  for (let i = 0; i < 6; i++) {
    const s = solveSpeed(from, aim, ELEVATION, SPIN);
    if (!s) throw new Error('out of reach');
    swing = { ...swing, bearing: s.bearing, speed: s.speed };
    const flight = simulate(
      TENNIS_BALL,
      launchState(vec(from.x, from.y, CONTACT_HEIGHT), s.bearing, ELEVATION, s.speed, SPIN),
      { sampleEvery: 0.001 },
    );
    const descending = flight.samples.filter((x, k) => k > 0 && x.position.z <= z);
    const at = descending.find((x) => x.t > flight.duration / 2)?.position;
    if (!at) throw new Error('never that low');
    aim = { x: aim.x + (p.x - at.x), y: aim.y + (p.y - at.y) };
  }
  return { combatant: by, platformId: platform.id, warheads: 1, swing, aimAt: unproject(p) };
}
