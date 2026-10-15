/**
 * Checks a World Situation is complete and consistent before the Combatants
 * are asked to endorse it.
 */
import { COURT_NUMBERS } from './theater';
import { COMBATANT_IDS, type CombatantDef, type CombatantId, type WorldSituation } from './types';

export function validateWorldSituation(
  ws: WorldSituation,
  defs: Readonly<Record<CombatantId, CombatantDef>>,
): string[] {
  const problems: string[] = [];
  if (ws.combatants.length < 2) problems.push('a game needs at least two Combatants');
  const seen = new Set<string>();
  for (const id of ws.combatants) {
    if (!(COMBATANT_IDS as readonly string[]).includes(id))
      problems.push(`unknown Combatant ${id}`);
    if (seen.has(id)) problems.push(`${id} is listed twice`);
    seen.add(id);
  }
  for (const id of ws.combatants) {
    const def = defs[id];
    const e = ws.economics[id] ?? def.economics;
    if (def.fixedWarheads === undefined) {
      if (!(e.gnp > 0)) problems.push(`${id}: GNP must be positive`);
      if (e.militaryBudget < 0 || e.militaryBudget > e.gnp)
        problems.push(`${id}: military budget must lie between 0 and GNP`);
      if (e.strategicSpending < 0 || e.strategicSpending > e.militaryBudget)
        problems.push(`${id}: strategic spending must lie between 0 and the military budget`);
    }
    const lsa = def.landSeaAir;
    if (Math.abs(lsa.land + lsa.sea + lsa.air - 1) > 1e-9)
      problems.push(`${id}: Land-Sea-Air shares must sum to 1`);
    if (!ws.forces[id]) problems.push(`${id}: no force distribution`);
  }
  for (const court of COURT_NUMBERS) {
    const w = ws.weather[court];
    if (w.windKmh < 0) problems.push(`Court ${String(court)}: negative wind speed`);
    if (w.cloud < 0 || w.cloud > 1)
      problems.push(`Court ${String(court)}: cloud must lie in [0, 1]`);
  }
  if (ws.combatants.includes('INSURGENT') && !ws.howitzerAt)
    problems.push('the insurgent cell plays but its howitzer has no emplacement');
  return problems;
}
