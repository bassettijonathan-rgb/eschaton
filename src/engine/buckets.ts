/**
 * The ball supply and the Combatants' buckets. Every Combatant keeps its
 * warheads in an identical white bucket, so nobody can count anybody else's
 * arsenal: a bucket's count is visible only to its owner and to the
 * game-master.
 */
import type { Allocation } from './allocation';
import { BALL_SUPPLY } from './allocation';
import type { CombatantId } from './types';

export type Viewer =
  { readonly kind: 'gameMaster' } | { readonly kind: 'combatant'; readonly id: CombatantId };

export const GAME_MASTER: Viewer = { kind: 'gameMaster' };

export interface BallSupply {
  readonly total: number;
  readonly buckets: Readonly<Partial<Record<CombatantId, number>>>;
  /** Balls nobody was allocated: they stay in the game-master's hopper. */
  readonly hopper: number;
}

export function fillBuckets(allocation: Allocation, total = BALL_SUPPLY): BallSupply {
  const buckets: Partial<Record<CombatantId, number>> = {};
  for (const line of allocation.lines) buckets[line.combatant] = line.warheads;
  const allocated = allocation.lines.reduce((s, l) => s + l.warheads, 0);
  if (allocated > total)
    throw new RangeError(`allocated ${String(allocated)} of ${String(total)} balls`);
  return { total, buckets, hopper: total - allocated };
}

export type BucketView =
  { readonly kind: 'count'; readonly count: number } | { readonly kind: 'hidden' };

export function canSeeBucket(viewer: Viewer, owner: CombatantId): boolean {
  return viewer.kind === 'gameMaster' || viewer.id === owner;
}

export function viewBucket(supply: BallSupply, viewer: Viewer, owner: CombatantId): BucketView {
  if (!canSeeBucket(viewer, owner)) return { kind: 'hidden' };
  return { kind: 'count', count: supply.buckets[owner] ?? 0 };
}

/** Take warheads out of a bucket for a launch. */
export function takeFromBucket(supply: BallSupply, owner: CombatantId, n: number): BallSupply {
  const have = supply.buckets[owner] ?? 0;
  if (!Number.isInteger(n) || n < 1) throw new RangeError('take at least one whole ball');
  if (n > have) throw new RangeError(`${owner} has ${String(have)} warheads, not ${String(n)}`);
  return { ...supply, buckets: { ...supply.buckets, [owner]: have - n } };
}

/** Balls on the courts: in buckets, in the hopper, or already lobbed. */
export function ballsInBuckets(supply: BallSupply): number {
  return Object.values(supply.buckets).reduce((s, n) => s + n, 0);
}
