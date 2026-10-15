import { describe, expect, it } from 'vitest';
import { allocate } from '../engine/allocation';
import { layoutApparatus } from '../engine/apparatus';
import { GAME_MASTER, fillBuckets } from '../engine/buckets';
import { COMBATANTS } from '../engine/data/combatants';
import { TARGETS } from '../engine/data/targets';
import { DEFAULT_WORLD_SITUATION } from '../engine/data/worldSituation';
import { describeApparatus, describeTarget } from './describe';

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
