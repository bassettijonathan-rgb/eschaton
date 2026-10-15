import { describe, expect, it } from 'vitest';
import { allocate } from '../engine/allocation';
import { layoutApparatus } from '../engine/apparatus';
import { GAME_MASTER, fillBuckets } from '../engine/buckets';
import { COMBATANTS } from '../engine/data/combatants';
import { TARGETS } from '../engine/data/targets';
import { DEFAULT_WORLD_SITUATION } from '../engine/data/worldSituation';
import { apparatusSolids } from '../engine/axiom';
import { adjudicateImpact, apparatusDetonation } from '../engine/lob';
import { vec } from '../engine/physics';
import { project } from '../engine/projection';
import { endstatKillRadius } from '../engine/effects';
import { computeEndStat } from '../engine/endstat';
import {
  describeApparatus,
  describeDamage,
  describeDetonation,
  describeStrike,
  describeTarget,
  formatRatio,
} from './describe';
import { METER_PERIOD, describeTiming, meterPosition } from './lobPanel';

const supply = fillBuckets(allocate(DEFAULT_WORLD_SITUATION, COMBATANTS));
const layout = layoutApparatus(DEFAULT_WORLD_SITUATION, COMBATANTS);
const find = (name: string) => {
  const t = TARGETS.find((x) => x.name === name);
  if (!t) throw new Error(name);
  return t;
};

describe('the inspector', () => {
  it('names what a garment is on the map', () => {
    const d = describeTarget(find('New York'));
    expect(d.title).toBe('New York');
    expect(d.lines).toContain('On the map: MAMA (Major Metro Area).');
    expect(d.lines).toContain('On the court: folded gray-and-red E.T.A. T-shirt.');
    expect(d.lines).toContain('Worth 32 points.');
  });

  it('flags the SSTRAC garment change', () => {
    const d = describeTarget(find('Cheyenne Mountain'));
    expect(d.lines.join(' ')).toMatch(/gray shorts with red trim/);
  });

  it('calls unplayed nations worthless', () => {
    expect(describeTarget(find('Tel Aviv')).lines.join(' ')).toMatch(/regrettable mistargeting/);
  });

  it('keeps a bucket’s count from other Combatants', () => {
    const bucket = layout.find((a) => a.id === 'amnat-bucket');
    if (!bucket) throw new Error('no bucket');
    expect(describeApparatus(bucket, { kind: 'combatant', id: 'SOVWAR' }, supply).lines[0]).toMatch(
      /cannot see/,
    );
    expect(describeApparatus(bucket, { kind: 'combatant', id: 'AMNAT' }, supply).lines[0]).toBe(
      `Holds ${String(supply.buckets.AMNAT)} warheads (${String((supply.buckets.AMNAT ?? 0) * 5)} Mt).`,
    );
    expect(describeApparatus(bucket, GAME_MASTER, supply).lines[0]).toMatch(/^Holds/);
  });

  it('says the apparatus is not the map', () => {
    const cart = layout.find((a) => a.kind === 'cart');
    if (!cart) throw new Error('no cart');
    expect(describeApparatus(cart, GAME_MASTER, supply).lines.join(' ')).toMatch(/not the map/);
  });
});

describe('what a warhead did', () => {
  const at = (name: string) => project(find(name).at);

  it('names a direct hit and the court it came down on', () => {
    const line = describeDetonation(adjudicateImpact(at('Moscow'), 1));
    expect(line).toMatch(/^Warhead 1 on Court \d: direct hit on Moscow/);
  });

  it('says where a miss landed and the nearest target', () => {
    const p = at('Moscow');
    const line = describeDetonation(adjudicateImpact({ x: p.x + 0.5, y: p.y }, 2));
    expect(line).toMatch(
      /^Warhead 2 on Court \d: landed in .+, \d+ km from .+, with nothing in reach\.$/,
    );
  });

  it('says a warhead off the theater does nothing', () => {
    expect(describeDetonation(adjudicateImpact({ x: 0, y: 40 }, 3))).toBe(
      'Warhead 3 came down off the map, where it does nothing.',
    );
  });

  it('says a ball that struck the apparatus did nothing, and why', () => {
    const bucket = apparatusSolids(layoutApparatus(DEFAULT_WORLD_SITUATION, COMBATANTS)).find(
      (x) => x.id === 'sovwar-bucket',
    );
    if (!bucket) throw new Error('no bucket');
    const d = apparatusDetonation(1, bucket, vec(bucket.x, bucket.y, 0.2));
    expect(describeDetonation(d)).toBe(
      "Warhead 1 struck SOVWAR's bucket. The apparatus is not the territory: off the map, and nothing scores.",
    );
    const moscow = TARGETS.find((t) => t.name === 'Moscow');
    if (!moscow) throw new Error('no Moscow');
    expect(describeTarget(moscow).lines).toContain(
      'Fixed to the map: moving it would be tampering with the map, not a move in the game.',
    );
  });

  it('reads a timing meter', () => {
    expect(meterPosition(0)).toBeCloseTo(-1);
    expect(meterPosition(METER_PERIOD / 4)).toBeCloseTo(0);
    expect(meterPosition(METER_PERIOD / 2)).toBeCloseTo(1);
    expect(describeTiming(0.01)).toBe('Timing: sweet spot.');
    expect(describeTiming(-0.25)).toBe('Timing: 25% early.');
    expect(describeTiming(0.6)).toBe('Timing: 60% late.');
  });
});

describe('the strike log', () => {
  it('says what a warhead hit and what it cost', () => {
    const ws = DEFAULT_WORLD_SITUATION;
    const report = computeEndStat(ws, COMBATANTS, allocate(ws, COMBATANTS), [
      {
        order: { combatant: 'AMNAT' },
        detonations: [adjudicateImpact(project(find('Moscow').at), 1, endstatKillRadius(ws))],
      },
    ]);
    const strike = report.strikes[0];
    if (!strike) throw new Error('no strike');
    expect(describeStrike(strike)).toMatch(
      /^AMNAT, warhead 1: Moscow \(direct, firestorm\)\. [\d.]+ million dead\. SACPOP\.$/,
    );
    expect(describeDamage(find('Moscow'), report).join(' ')).toMatch(/firestorm has burned/);
    expect(formatRatio({ ratio: Infinity })).toBe('∞');
    expect(formatRatio({ ratio: undefined })).toBe('—');
  });
});
