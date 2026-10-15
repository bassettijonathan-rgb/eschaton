/**
 * Who the computer plays: which Combatants, how good its launchmen are, and
 * whether it runs the table as game-master. A page setting, not part of the
 * game: every computer move still goes into the action log like anyone's.
 */
import type { Controllers } from '../engine/ai';
import type { CombatantId } from '../engine/types';

export const DEFAULT_SKILL = 0.8;

let controllers: Controllers = { combatants: {}, gameMaster: false };
let skill = DEFAULT_SKILL;
let fast = false;
const listeners = new Set<() => void>();
const changed = (): void => {
  for (const fn of listeners) fn();
};

export function getControllers(): Controllers {
  return controllers;
}

export function isComputer(id: CombatantId): boolean {
  return controllers.combatants[id] !== undefined;
}

export function getSkill(): number {
  return skill;
}

export function isFast(): boolean {
  return fast;
}

export function setComputer(id: CombatantId, on: boolean): void {
  const combatants = Object.fromEntries(
    Object.entries(controllers.combatants).filter(([other]) => other !== id),
  );
  if (on) combatants[id] = { skill };
  controllers = { ...controllers, combatants };
  changed();
}

export function setSkill(value: number): void {
  skill = Math.min(1, Math.max(0, value));
  const combatants = Object.fromEntries(
    Object.keys(controllers.combatants).map((id) => [id, { skill }]),
  );
  controllers = { ...controllers, combatants };
  changed();
}

export function setComputerGameMaster(on: boolean): void {
  controllers = { ...controllers, gameMaster: on };
  changed();
}

export function setFast(on: boolean): void {
  fast = on;
  changed();
}

/** Hand every Combatant and the table to the computer. */
export function computerPlaysAll(ids: readonly CombatantId[]): void {
  controllers = {
    combatants: Object.fromEntries(ids.map((id) => [id, { skill }])),
    gameMaster: true,
  };
  changed();
}

export function onComputersChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
