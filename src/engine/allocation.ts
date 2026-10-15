/**
 * Allocation of megatonnage (ambiguity A5).
 *
 * The novel divides megatonnage by "an integrally regressed ratio" of
 * (a) military budget as a share of GNP to (b) the inverse of strategic
 * spending as a share of the military budget. a ÷ (1/b) = a·b, which comes to
 * strategic spending ÷ GNP: a bang-for-buck figure that ignores the size of
 * the economy.
 *
 * Endnote 123 then has Pemulis average each Combatant's ratio over its game
 * history by the mean-value theorem for integrals, and claim the mean follows
 * from the smallest and largest recorded ratios alone. The theorem only proves
 * such a mean lies between them, so the default here is the true integral
 * average (trapezoid rule over game index) and Pemulis's (r+R)/2 is offered as
 * a labelled option, as are the literal per-game reading and the old red
 * Yahtzee dice.
 */
import type { Rng } from './rng';
import type {
  AllocationMethod,
  CombatantDef,
  CombatantId,
  Economics,
  WorldSituation,
} from './types';

export const MEGATONS_PER_WARHEAD = 5;
/** Dead, bald balls available for a game. */
export const BALL_SUPPLY = 400;
/** AMNAT and SOVWAR each land near this many megatons. */
export const SUPERPOWER_ANCHOR_MT = 400;
const ANCHOR_COMBATANTS: readonly CombatantId[] = ['AMNAT', 'SOVWAR'];

export const ALLOCATION_METHOD_LABELS: Readonly<Record<AllocationMethod, string>> = {
  meanValue: 'Mean value over game history (default)',
  literal: 'This game only (literal reading)',
  pemulisShortcut: "Pemulis's shortcut, (r + R) / 2",
  yahtzee: 'Old rules: red Yahtzee dice',
};

/** (military / GNP) × (strategic / military). */
export function perGameRatio(e: Economics): number {
  if (e.gnp <= 0 || e.militaryBudget <= 0) return 0;
  return (e.militaryBudget / e.gnp) * (e.strategicSpending / e.militaryBudget);
}

/**
 * The integral average of a ratio recorded once per game, treating it as a
 * continuous function of game index sampled at 0, 1, …, n−1 and integrating
 * with the trapezoid rule. One game's record is its own mean.
 */
export function meanValue(series: readonly number[]): number {
  const n = series.length;
  if (n === 0) throw new RangeError('no recorded ratios');
  if (n === 1) return series[0] ?? 0;
  let area = 0;
  for (let i = 1; i < n; i++) area += ((series[i - 1] ?? 0) + (series[i] ?? 0)) / 2;
  return area / (n - 1);
}

/** Endnote 123's shortcut: the midpoint of the smallest and largest ratios. */
export function pemulisShortcut(series: readonly number[]): number {
  if (series.length === 0) throw new RangeError('no recorded ratios');
  return (Math.min(...series) + Math.max(...series)) / 2;
}

export interface AllocationLine {
  readonly combatant: CombatantId;
  /** This game's ratio from the World Situation's economics. */
  readonly currentRatio: number;
  /** The figure the method produced, before scaling to megatons. */
  readonly ratioUsed: number;
  readonly megatonsBeforeRounding: number;
  readonly warheads: number;
  readonly megatons: number;
  /** Plain-language steps, for the audit trail ("Appeal to Pemulis"). */
  readonly steps: readonly string[];
}

export interface Allocation {
  readonly method: AllocationMethod;
  /** Megatons given per unit of ratio. */
  readonly megatonsPerUnit: number;
  /** Fraction applied when the formula asked for more balls than exist; 1 if none. */
  readonly supplyScale: number;
  readonly lines: readonly AllocationLine[];
  readonly totalWarheads: number;
  readonly steps: readonly string[];
}

export interface AllocationOptions {
  readonly method?: AllocationMethod;
  /** Required for the dice; ignored otherwise. */
  readonly rng?: Rng;
  readonly ballSupply?: number;
}

const fmt = (x: number, digits = 6): string => x.toFixed(digits);

interface Draft {
  def: CombatantDef;
  currentRatio: number;
  ratioUsed: number;
  steps: string[];
}

function draftFor(
  def: CombatantDef,
  economics: Economics,
  method: AllocationMethod,
  rng: Rng | undefined,
): Draft {
  const steps: string[] = [];
  const a = economics.gnp > 0 ? economics.militaryBudget / economics.gnp : 0;
  const b =
    economics.militaryBudget > 0 ? economics.strategicSpending / economics.militaryBudget : 0;
  const currentRatio = perGameRatio(economics);
  steps.push(
    `(a) military budget / GNP = ${String(economics.militaryBudget)} / ${String(economics.gnp)} = ${fmt(a, 4)}`,
    `(b) strategic spending / military budget = ${String(economics.strategicSpending)} / ${String(economics.militaryBudget)} = ${fmt(b, 4)}`,
    `this game's ratio = a ÷ (1/b) = a × b = ${fmt(currentRatio)}`,
  );

  const series = [...def.ratioHistory, currentRatio];
  let ratioUsed: number;
  switch (method) {
    case 'literal':
      ratioUsed = currentRatio;
      steps.push(`literal reading: use this game's ratio, ${fmt(ratioUsed)}`);
      break;
    case 'meanValue':
      ratioUsed = meanValue(series);
      steps.push(
        `recorded ratios over ${String(series.length)} games: ${series.map((r) => fmt(r)).join(', ')}`,
        `mean value = (1 / (n − 1)) × trapezoid integral over game index = ${fmt(ratioUsed)}`,
      );
      break;
    case 'pemulisShortcut': {
      const r = Math.min(...series);
      const R = Math.max(...series);
      ratioUsed = pemulisShortcut(series);
      steps.push(
        `recorded ratios over ${String(series.length)} games: ${series.map((x) => fmt(x)).join(', ')}`,
        `Pemulis's shortcut: (r + R) / 2 = (${fmt(r)} + ${fmt(R)}) / 2 = ${fmt(ratioUsed)}`,
        'note: the mean-value theorem says a mean lies between r and R, not that it is their midpoint',
      );
      break;
    }
    case 'yahtzee': {
      if (!rng) throw new Error('the dice need a seeded RNG');
      const rolls = Array.from({ length: def.yahtzeeDice }, () => rng.int(1, 6));
      ratioUsed = rolls.reduce((s, r) => s + r, 0);
      steps.splice(0, steps.length);
      steps.push(
        `old rules: ${String(def.yahtzeeDice)} red Yahtzee ${def.yahtzeeDice === 1 ? 'die' : 'dice'}: ${rolls.join(' + ')} = ${String(ratioUsed)}`,
      );
      break;
    }
  }
  return { def, currentRatio, ratioUsed, steps };
}

/**
 * Allocate warheads to every Combatant in a World Situation.
 *
 * Scaling: the megatons per unit of ratio are set so the mean of AMNAT's and
 * SOVWAR's figures comes to 400 Mt (if neither plays, the largest figure gets
 * 400 Mt). Each Combatant then gets the nearest whole number of 5 Mt
 * warheads, at least one if its figure is positive. If the total would exceed
 * the ball supply, every formula allocation is scaled down to fit.
 */
export function allocate(
  situation: WorldSituation,
  defs: Readonly<Record<CombatantId, CombatantDef>>,
  options: AllocationOptions = {},
): Allocation {
  const method = options.method ?? situation.allocationMethod;
  const supply = options.ballSupply ?? BALL_SUPPLY;
  const steps: string[] = [`method: ${ALLOCATION_METHOD_LABELS[method]}`];

  const playing = situation.combatants.map((id) => defs[id]);
  const fixed = playing.filter((d) => d.fixedWarheads !== undefined);
  const formula = playing
    .filter((d) => d.fixedWarheads === undefined)
    .map((d) => draftFor(d, situation.economics[d.id] ?? d.economics, method, options.rng));

  const anchors = formula.filter((d) => ANCHOR_COMBATANTS.includes(d.def.id));
  const anchorRatio =
    anchors.length > 0
      ? anchors.reduce((s, d) => s + d.ratioUsed, 0) / anchors.length
      : Math.max(0, ...formula.map((d) => d.ratioUsed));
  const megatonsPerUnit = anchorRatio > 0 ? SUPERPOWER_ANCHOR_MT / anchorRatio : 0;
  steps.push(
    anchors.length > 0
      ? `anchor: mean of ${anchors.map((d) => d.def.code).join(' and ')} = ${fmt(anchorRatio)} → ${String(SUPERPOWER_ANCHOR_MT)} Mt`
      : `anchor: largest figure ${fmt(anchorRatio)} → ${String(SUPERPOWER_ANCHOR_MT)} Mt`,
    `scale: ${megatonsPerUnit.toFixed(1)} Mt per unit`,
  );

  const fixedTotal = fixed.reduce((s, d) => s + (d.fixedWarheads ?? 0), 0);
  const wanted = formula.map((d) => {
    const mt = d.ratioUsed * megatonsPerUnit;
    return {
      draft: d,
      mt,
      warheads: d.ratioUsed > 0 ? Math.max(1, Math.round(mt / MEGATONS_PER_WARHEAD)) : 0,
    };
  });
  const wantedTotal = wanted.reduce((s, w) => s + w.warheads, 0);
  const room = Math.max(0, supply - fixedTotal);
  let supplyScale = 1;
  if (wantedTotal > room) {
    supplyScale = room / wantedTotal;
    steps.push(
      `the formula asks for ${String(wantedTotal + fixedTotal)} balls but only ${String(supply)} exist: scaling formula allocations by ${supplyScale.toFixed(4)}`,
    );
    for (const w of wanted)
      w.warheads = w.warheads > 0 ? Math.max(1, Math.floor(w.warheads * supplyScale)) : 0;
  }

  const lines: AllocationLine[] = [
    ...wanted.map(({ draft, mt, warheads }) => ({
      combatant: draft.def.id,
      currentRatio: draft.currentRatio,
      ratioUsed: draft.ratioUsed,
      megatonsBeforeRounding: mt,
      warheads,
      megatons: warheads * MEGATONS_PER_WARHEAD,
      steps: [
        ...draft.steps,
        `${fmt(draft.ratioUsed)} × ${megatonsPerUnit.toFixed(1)} Mt = ${mt.toFixed(1)} Mt`,
        `${String(warheads)} warheads of ${String(MEGATONS_PER_WARHEAD)} Mt = ${String(warheads * MEGATONS_PER_WARHEAD)} Mt`,
      ],
    })),
    ...fixed.map((d) => {
      const warheads = d.fixedWarheads ?? 0;
      return {
        combatant: d.id,
        currentRatio: 0,
        ratioUsed: 0,
        megatonsBeforeRounding: warheads * MEGATONS_PER_WARHEAD,
        warheads,
        megatons: warheads * MEGATONS_PER_WARHEAD,
        steps: [`fixed by the scenario: ${String(warheads)} shells; the formula does not apply`],
      };
    }),
  ];
  // Keep the World Situation's order.
  lines.sort(
    (x, y) => situation.combatants.indexOf(x.combatant) - situation.combatants.indexOf(y.combatant),
  );

  return {
    method,
    megatonsPerUnit,
    supplyScale,
    lines,
    totalWarheads: lines.reduce((s, l) => s + l.warheads, 0),
    steps,
  };
}
