/**
 * The page's game state for now: the World Situation, its allocation and the
 * buckets filled from it. Later milestones replace this with the full game.
 */
import { allocate, type Allocation } from '../engine/allocation';
import { fillBuckets, takeFromBucket, type BallSupply } from '../engine/buckets';
import { COMBATANTS } from '../engine/data/combatants';
import { DEFAULT_WORLD_SITUATION } from '../engine/data/worldSituation';
import { resolveLob, validateLaunch, type LaunchOrder, type LobResult } from '../engine/lob';
import { createRng, type Rng } from '../engine/rng';
import type { AllocationMethod, WorldSituation } from '../engine/types';

export interface PageState {
  readonly situation: WorldSituation;
  readonly method: AllocationMethod;
  readonly allocation: Allocation;
  readonly supply: BallSupply;
  /** Every lob so far, oldest first. */
  readonly lobs: readonly LobResult[];
}

function compute(situation: WorldSituation, method: AllocationMethod): PageState {
  const allocation = allocate(situation, COMBATANTS, { method, rng: createRng(situation.seed) });
  return { situation, method, allocation, supply: fillBuckets(allocation), lobs: [] };
}

let state = compute(DEFAULT_WORLD_SITUATION, DEFAULT_WORLD_SITUATION.allocationMethod);
/** The game's dice for everything after allocation: MIRV scatter, for now. */
let rng: Rng = createRng(state.situation.seed + 1);
const listeners = new Set<(s: PageState) => void>();

export function getState(): PageState {
  return state;
}

function publish(): void {
  for (const fn of listeners) fn(state);
}

export function setMethod(method: AllocationMethod): void {
  state = compute(state.situation, method);
  rng = createRng(state.situation.seed + 1);
  publish();
}

export type LaunchOutcome =
  | { readonly ok: true; readonly result: LobResult }
  | { readonly ok: false; readonly problems: readonly string[] };

/** Take the warheads out of the bucket and lob them. */
export function launch(order: LaunchOrder): LaunchOutcome {
  const inBucket = state.supply.buckets[order.combatant] ?? 0;
  const problems = validateLaunch(order, state.situation, COMBATANTS, inBucket);
  if (problems.length > 0) return { ok: false, problems };
  const result = resolveLob(order, state.situation, rng);
  state = {
    ...state,
    supply: takeFromBucket(state.supply, order.combatant, order.warheads),
    lobs: [...state.lobs, result],
  };
  publish();
  return { ok: true, result };
}

export function onStateChange(fn: (s: PageState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
