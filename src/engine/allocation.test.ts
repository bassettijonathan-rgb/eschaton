import { describe, expect, it } from 'vitest';
import {
  BALL_SUPPLY,
  MEGATONS_PER_WARHEAD,
  allocate,
  meanValue,
  pemulisShortcut,
  perGameRatio,
} from './allocation';
import { COMBATANTS } from './data/combatants';
import { DEFAULT_WORLD_SITUATION } from './data/worldSituation';
import { createRng } from './rng';
import type { CombatantId, WorldSituation } from './types';

const line = (a: ReturnType<typeof allocate>, id: CombatantId) => {
  const l = a.lines.find((x) => x.combatant === id);
  if (!l) throw new Error(`no line for ${id}`);
  return l;
};

describe('per-game ratio (literal reading of A5)', () => {
  it('is (military/GNP) × (strategic/military), which is strategic/GNP', () => {
    const e = { gnp: 1000, militaryBudget: 50, strategicSpending: 5, civilDefenseSpending: 0 };
    const a = e.militaryBudget / e.gnp;
    const b = e.strategicSpending / e.militaryBudget;
    expect(perGameRatio(e)).toBeCloseTo(a / (1 / b), 12);
    expect(perGameRatio(e)).toBeCloseTo(e.strategicSpending / e.gnp, 12);
  });

  it('is zero with no economy or no military', () => {
    expect(
      perGameRatio({ gnp: 0, militaryBudget: 0, strategicSpending: 0, civilDefenseSpending: 0 }),
    ).toBe(0);
  });
});

describe('mean value over game history', () => {
  it('integrates by the trapezoid rule over game index', () => {
    expect(meanValue([1, 3])).toBe(2);
    expect(meanValue([1, 1, 4])).toBe(1.75);
    expect(meanValue([2, 2, 2, 2])).toBe(2);
    expect(meanValue([0.7])).toBe(0.7);
    expect(() => meanValue([])).toThrow(RangeError);
  });

  it('always lies between the smallest and largest ratio, as the theorem says', () => {
    const rng = createRng(123);
    for (let trial = 0; trial < 200; trial++) {
      const series = Array.from({ length: rng.int(1, 12) }, () => rng.next());
      const m = meanValue(series);
      expect(m).toBeGreaterThanOrEqual(Math.min(...series) - 1e-12);
      expect(m).toBeLessThanOrEqual(Math.max(...series) + 1e-12);
    }
  });

  it("differs from Pemulis's shortcut, which is not what the theorem gives", () => {
    const series = [1, 1, 1, 1, 5];
    expect(meanValue(series)).toBe(1.5);
    expect(pemulisShortcut(series)).toBe(3);
  });
});

describe('allocation in the default World Situation', () => {
  const a = allocate(DEFAULT_WORLD_SITUATION, COMBATANTS);

  it('uses the mean value by default', () => {
    expect(a.method).toBe('meanValue');
  });

  it('gives AMNAT and SOVWAR about 400 Mt each', () => {
    for (const id of ['AMNAT', 'SOVWAR'] as const) {
      expect(line(a, id).megatons).toBeGreaterThanOrEqual(380);
      expect(line(a, id).megatons).toBeLessThanOrEqual(420);
    }
    const mean =
      (line(a, 'AMNAT').megatonsBeforeRounding + line(a, 'SOVWAR').megatonsBeforeRounding) / 2;
    expect(mean).toBeCloseTo(400, 9);
  });

  it('gives SOUTHAF its sixteen warheads, as in the chapter', () => {
    expect(line(a, 'SOUTHAF').warheads).toBe(16);
  });

  it('gives the insurgent cell its fixed shells and stays within the ball supply', () => {
    expect(line(a, 'INSURGENT').warheads).toBe(6);
    expect(a.totalWarheads).toBeLessThanOrEqual(BALL_SUPPLY);
    expect(a.supplyScale).toBe(1);
  });

  it('allocates whole 5-megaton warheads', () => {
    for (const l of a.lines) expect(l.megatons).toBe(l.warheads * MEGATONS_PER_WARHEAD);
  });

  it('writes an audit trail an appeal to Pemulis can show', () => {
    const steps = line(a, 'AMNAT').steps.join('\n');
    expect(steps).toContain('a ÷ (1/b) = a × b');
    expect(steps).toContain('trapezoid');
    expect(steps).toMatch(/\d+ warheads of 5 Mt/);
  });
});

describe('allocation methods', () => {
  const withHistory = (id: CombatantId, history: number[]) => ({
    ...COMBATANTS,
    [id]: { ...COMBATANTS[id], ratioHistory: history },
  });

  it('literal reading ignores history, as Lord does in the chapter', () => {
    const base = allocate(DEFAULT_WORLD_SITUATION, COMBATANTS, { method: 'literal' });
    const changed = allocate(DEFAULT_WORLD_SITUATION, withHistory('REDCHI', [0.05, 0.09]), {
      method: 'literal',
    });
    expect(line(changed, 'REDCHI').warheads).toBe(line(base, 'REDCHI').warheads);
    expect(line(base, 'REDCHI').ratioUsed).toBe(line(base, 'REDCHI').currentRatio);
  });

  it('mean value rewards past thermonuclear largesse', () => {
    const base = allocate(DEFAULT_WORLD_SITUATION, COMBATANTS);
    const lavish = allocate(DEFAULT_WORLD_SITUATION, withHistory('REDCHI', [0.006, 0.006, 0.006]));
    expect(line(lavish, 'REDCHI').warheads).toBeGreaterThan(line(base, 'REDCHI').warheads);
  });

  it("Pemulis's shortcut uses only the smallest and largest recorded ratios", () => {
    const defs = withHistory('INDPAK', [0.001, 0.003, 0.001, 0.001]);
    const a = allocate(DEFAULT_WORLD_SITUATION, defs, { method: 'pemulisShortcut' });
    const series = [...defs.INDPAK.ratioHistory, line(a, 'INDPAK').currentRatio];
    expect(line(a, 'INDPAK').ratioUsed).toBeCloseTo(
      (Math.min(...series) + Math.max(...series)) / 2,
      12,
    );
    const mean = allocate(DEFAULT_WORLD_SITUATION, defs, { method: 'meanValue' });
    expect(line(a, 'INDPAK').ratioUsed).not.toBeCloseTo(line(mean, 'INDPAK').ratioUsed, 6);
  });

  it('the old dice are seeded, so a game replays', () => {
    const roll = (seed: number) =>
      allocate(DEFAULT_WORLD_SITUATION, COMBATANTS, {
        method: 'yahtzee',
        rng: createRng(seed),
      }).lines.map((l) => l.warheads);
    expect(roll(7)).toEqual(roll(7));
    expect(() => allocate(DEFAULT_WORLD_SITUATION, COMBATANTS, { method: 'yahtzee' })).toThrow();
  });

  it('the dice roll each Combatant its own number of dice', () => {
    const a = allocate(DEFAULT_WORLD_SITUATION, COMBATANTS, {
      method: 'yahtzee',
      rng: createRng(3),
    });
    const amnat = line(a, 'AMNAT');
    expect(amnat.ratioUsed).toBeGreaterThanOrEqual(5);
    expect(amnat.ratioUsed).toBeLessThanOrEqual(30);
    expect(amnat.steps[0]).toMatch(/5 red Yahtzee dice/);
    expect(line(a, 'SOUTHAF').ratioUsed).toBeLessThanOrEqual(6);
  });

  it('scales every formula allocation down when the balls run out', () => {
    const a = allocate(DEFAULT_WORLD_SITUATION, COMBATANTS, { ballSupply: 100 });
    expect(a.totalWarheads).toBeLessThanOrEqual(100);
    expect(a.supplyScale).toBeLessThan(1);
    expect(line(a, 'INSURGENT').warheads).toBe(6);
    for (const l of a.lines) expect(l.warheads).toBeGreaterThanOrEqual(1);
  });

  it('anchors on the largest Combatant when neither superpower plays', () => {
    const ws: WorldSituation = { ...DEFAULT_WORLD_SITUATION, combatants: ['REDCHI', 'SOUTHAF'] };
    const a = allocate(ws, COMBATANTS);
    expect(line(a, 'REDCHI').megatons).toBe(400);
    expect(line(a, 'SOUTHAF').megatons).toBeLessThan(400);
  });

  it('uses the World Situation’s economics over the standing data', () => {
    const ws: WorldSituation = {
      ...DEFAULT_WORLD_SITUATION,
      economics: {
        SOUTHAF: { ...COMBATANTS.SOUTHAF.economics, strategicSpending: 0.6 },
      },
    };
    const a = allocate(ws, COMBATANTS, { method: 'literal' });
    const base = allocate(DEFAULT_WORLD_SITUATION, COMBATANTS, { method: 'literal' });
    expect(line(a, 'SOUTHAF').warheads).toBeGreaterThan(line(base, 'SOUTHAF').warheads);
  });
});
