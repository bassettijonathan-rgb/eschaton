/**
 * The page's game state for now: the World Situation, its allocation and the
 * buckets filled from it. Later milestones replace this with the full game.
 */
import { allocate, type Allocation } from '../engine/allocation';
import { fillBuckets, type BallSupply } from '../engine/buckets';
import { COMBATANTS } from '../engine/data/combatants';
import { DEFAULT_WORLD_SITUATION } from '../engine/data/worldSituation';
import { createRng } from '../engine/rng';
import type { AllocationMethod, WorldSituation } from '../engine/types';

export interface PageState {
  readonly situation: WorldSituation;
  readonly method: AllocationMethod;
  readonly allocation: Allocation;
  readonly supply: BallSupply;
}

function compute(situation: WorldSituation, method: AllocationMethod): PageState {
  const allocation = allocate(situation, COMBATANTS, { method, rng: createRng(situation.seed) });
  return { situation, method, allocation, supply: fillBuckets(allocation) };
}

let state = compute(DEFAULT_WORLD_SITUATION, DEFAULT_WORLD_SITUATION.allocationMethod);
const listeners = new Set<(s: PageState) => void>();

export function getState(): PageState {
  return state;
}

export function setMethod(method: AllocationMethod): void {
  state = compute(state.situation, method);
  for (const fn of listeners) fn(state);
}

export function onStateChange(fn: (s: PageState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
