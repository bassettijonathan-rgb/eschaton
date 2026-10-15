import { describe, expect, it } from 'vitest';
import { allocate } from './allocation';
import { GAME_MASTER, ballsInBuckets, fillBuckets, takeFromBucket, viewBucket } from './buckets';
import { COMBATANTS } from './data/combatants';
import { DEFAULT_WORLD_SITUATION } from './data/worldSituation';

const supply = fillBuckets(allocate(DEFAULT_WORLD_SITUATION, COMBATANTS));

describe('the ball supply', () => {
  it('is 400 balls, split between the buckets and the hopper', () => {
    expect(supply.total).toBe(400);
    expect(ballsInBuckets(supply) + supply.hopper).toBe(400);
    expect(supply.buckets.SOUTHAF).toBe(16);
  });

  it('refuses an allocation larger than the supply', () => {
    expect(() => fillBuckets(allocate(DEFAULT_WORLD_SITUATION, COMBATANTS), 100)).toThrow(
      RangeError,
    );
  });
});

describe('buckets', () => {
  it('hide their counts from other Combatants', () => {
    expect(viewBucket(supply, { kind: 'combatant', id: 'SOVWAR' }, 'AMNAT')).toEqual({
      kind: 'hidden',
    });
    expect(viewBucket(supply, { kind: 'combatant', id: 'REDCHI' }, 'SOUTHAF')).toEqual({
      kind: 'hidden',
    });
  });

  it('show their owner, and the game-master, the count', () => {
    expect(viewBucket(supply, { kind: 'combatant', id: 'SOUTHAF' }, 'SOUTHAF')).toEqual({
      kind: 'count',
      count: 16,
    });
    expect(viewBucket(supply, GAME_MASTER, 'AMNAT')).toEqual({
      kind: 'count',
      count: supply.buckets.AMNAT,
    });
  });

  it('give up warheads for a launch, and no more than they hold', () => {
    const after = takeFromBucket(supply, 'SOUTHAF', 3);
    expect(after.buckets.SOUTHAF).toBe(13);
    expect(supply.buckets.SOUTHAF).toBe(16); // unchanged: supplies are values
    expect(() => takeFromBucket(after, 'SOUTHAF', 14)).toThrow(RangeError);
    expect(() => takeFromBucket(after, 'SOUTHAF', 0)).toThrow(RangeError);
  });
});
