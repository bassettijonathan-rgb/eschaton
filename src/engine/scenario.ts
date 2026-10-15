/**
 * What a scenario's TRIGSIT does to the World Situation, and the names and
 * owners that follow from it. A TRIGSIT is the premise of the game: it can
 * rename a Combatant, bring an unplayed nation over to one, leave garments
 * damaged or cities evacuated, and record who has already attacked whom.
 * None of it scores: only the balls lobbed in play do.
 */
import { COMBATANTS } from './data/combatants';
import type {
  CombatantDef,
  CombatantId,
  OwnerId,
  SituationChanges,
  TargetItem,
  UnplayedNationId,
  WorldSituation,
} from './types';
import { COMBATANT_IDS } from './types';

/** A Combatant's code as the game now has it. */
export function codeOf(ws: WorldSituation, id: CombatantId): string {
  return ws.codes?.[id] ?? COMBATANTS[id].code;
}

/** Rewrites standing codes in a line of text to the names the TRIGSIT gave them. */
export function renameCodes(ws: WorldSituation, text: string): string {
  const codes = ws.codes;
  if (!codes) return text;
  let out = text;
  for (const id of COMBATANT_IDS) {
    const now = codes[id];
    if (now) out = out.replace(new RegExp(`\\b${COMBATANTS[id].code}\\b`, 'g'), now);
  }
  return out;
}

/** The Combatant data with the codes the TRIGSIT gave them, for EndStat's working. */
export function defsFor(ws: WorldSituation): Readonly<Record<CombatantId, CombatantDef>> {
  const codes = ws.codes;
  if (!codes) return COMBATANTS;
  return Object.fromEntries(
    COMBATANT_IDS.map((id) => {
      const def = COMBATANTS[id];
      const now = codes[id];
      const name = now && def.expandsTo?.code === now ? def.expandsTo.name : def.name;
      return [id, now ? { ...def, code: now, name } : def];
    }),
  ) as Record<CombatantId, CombatantDef>;
}

/** Who owns a place or garment once allies have joined. */
export function ownerIn(ws: WorldSituation, owner: OwnerId): OwnerId;
export function ownerIn(ws: WorldSituation, owner: OwnerId | undefined): OwnerId | undefined;
export function ownerIn(ws: WorldSituation, owner: OwnerId | undefined): OwnerId | undefined {
  if (owner === undefined) return undefined;
  return ws.allies?.[owner as UnplayedNationId] ?? owner;
}

/** The garments with their owners as the TRIGSIT left them. */
export function itemsIn(ws: WorldSituation, items: readonly TargetItem[]): TargetItem[] {
  if (!ws.allies) return [...items];
  return items.map((t) => {
    const owner = ownerIn(ws, t.owner);
    return owner === t.owner ? t : { ...t, owner };
  });
}

/** A city's people at the start of play: what is left after the TRIGSIT's losses and evacuations. */
export function startingPopulation(ws: WorldSituation, item: TargetItem): number {
  return (
    (item.population ?? 0) *
    (1 - (ws.losses?.[item.id] ?? 0)) *
    (1 - (ws.evacuated?.[item.id] ?? 0))
  );
}

/** The World Situation once a TRIGSIT event's changes stand. */
export function applyChanges(ws: WorldSituation, changes: SituationChanges): WorldSituation {
  const merged: { -readonly [K in keyof SituationChanges]: SituationChanges[K] } = {};
  if (changes.codes) merged.codes = { ...ws.codes, ...changes.codes };
  if (changes.allies) merged.allies = { ...ws.allies, ...changes.allies };
  if (changes.losses) {
    const losses: Record<string, number> = { ...ws.losses };
    for (const [id, f] of Object.entries(changes.losses))
      losses[id] = 1 - (1 - (losses[id] ?? 0)) * (1 - f);
    merged.losses = losses;
  }
  if (changes.evacuated) merged.evacuated = { ...ws.evacuated, ...changes.evacuated };
  if (changes.incidents) merged.incidents = [...(ws.incidents ?? []), ...changes.incidents];
  return { ...ws, ...merged };
}
