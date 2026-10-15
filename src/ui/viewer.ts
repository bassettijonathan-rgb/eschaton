/**
 * Whose eyes the screen is: the game-master's, or one Combatant's. On a
 * shared hot-seat screen this decides what each person may see.
 */
import { GAME_MASTER, type Viewer } from '../engine/buckets';

let current: Viewer = GAME_MASTER;
const listeners = new Set<(v: Viewer) => void>();

export function getViewer(): Viewer {
  return current;
}

export function setViewer(v: Viewer): void {
  current = v;
  for (const fn of listeners) fn(v);
}

export function onViewerChange(fn: (v: Viewer) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
