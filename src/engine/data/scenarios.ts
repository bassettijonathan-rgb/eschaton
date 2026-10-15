/**
 * The World Situations a game can start from.
 */
import type { WorldSituation } from '../types';
import { INTERDEPENDENCE_DAY } from './interdependenceDay';
import { DEFAULT_WORLD_SITUATION } from './worldSituation';

export const SCENARIOS: readonly WorldSituation[] = [DEFAULT_WORLD_SITUATION, INTERDEPENDENCE_DAY];

/** The scenario with this id, or the plain Sunday game. */
export function scenarioById(id: string | null | undefined): WorldSituation {
  return SCENARIOS.find((s) => s.id === id) ?? DEFAULT_WORLD_SITUATION;
}
