/**
 * The page's game: the engine's GameState, its action log, and the actions
 * the panels dispatch. Every change goes through the engine's reducer, so
 * the game on screen is always one that replays from its seed and log.
 */
import { scenarioById } from '../engine/data/scenarios';
import { apply, newGame, type Action, type GameState, type Outcome } from '../engine/game';
import type { LaunchOrder, LobResult } from '../engine/lob';
import type { AllocationMethod } from '../engine/types';

export type PageState = GameState;

/** The World Situation this page plays: `?scenario=` in the address picks one. */
const situation = scenarioById(
  typeof location === 'undefined'
    ? undefined
    : new URLSearchParams(location.search).get('scenario'),
);

let state: GameState = newGame(situation);
let actions: Action[] = [];
const listeners = new Set<(s: GameState) => void>();
const actionListeners = new Set<(prev: GameState, action: Action, next: GameState) => void>();

export function getState(): GameState {
  return state;
}

/** Every action applied so far: with the World Situation, the whole game. */
export function getActionLog(): readonly Action[] {
  return actions;
}

export function dispatch(action: Action): Outcome {
  const outcome = apply(state, action);
  if (outcome.state !== state) {
    const prev = state;
    state = outcome.state;
    actions = action.type === 'setMethod' && outcome.ok ? [action] : [...actions, action];
    for (const fn of actionListeners) fn(prev, action, state);
    for (const fn of listeners) fn(state);
  }
  return outcome;
}

export function setMethod(method: AllocationMethod): Outcome {
  return dispatch({ type: 'setMethod', method });
}

export type LaunchOutcome =
  | { readonly ok: true; readonly result: LobResult }
  | { readonly ok: true; readonly pending: number }
  | { readonly ok: false; readonly problems: readonly string[] };

/** Declare a launch order to the game-master. */
export function launch(order: LaunchOrder): LaunchOutcome {
  const o = dispatch({ type: 'launch', order });
  if (!o.ok) return { ok: false, problems: o.problems };
  if (o.pending !== undefined) return { ok: true, pending: o.pending };
  if (o.lob) return { ok: true, result: o.lob };
  return { ok: false, problems: ['The order went nowhere'] };
}

export function onStateChange(fn: (s: GameState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Every action that changed the game, with the game before and after it. */
export function onAction(
  fn: (prev: GameState, action: Action, next: GameState) => void,
): () => void {
  actionListeners.add(fn);
  return () => actionListeners.delete(fn);
}

/** Start again from a fresh game (tests and the practice button use this). */
export function resetGame(): void {
  state = newGame(situation);
  actions = [];
  for (const fn of listeners) fn(state);
}
