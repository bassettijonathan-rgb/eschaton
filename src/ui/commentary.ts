/**
 * The commentary for someone watching a game from the pavilion: what each
 * move was, what it was aiming at, what it did, and who is ahead. It reads
 * the game the way the game-master does (every bucket, pact and message),
 * and explains in plain words what the log only records.
 */
import { UNPLAYED_NATIONS } from '../engine/data/worldSituation';
import type { StrikeReport, Tally } from '../engine/endstat';
import {
  CITY_DEFCON,
  LAUNCH_DEFCON,
  MIRV_DEFCON,
  PACT_LABELS,
  bucketOf,
  clockLabel,
  inContention,
  declaredTarget,
  defconLabel,
  itemsOf,
  quorum,
  type Action,
  type Defcon,
  type GameState,
  type Pact,
  type PactKind,
  type Phase,
} from '../engine/game';
import { platformsFor } from '../engine/lob';
import { greatCircleKm } from '../engine/projection';
import { codeOf } from '../engine/scenario';
import { territoryAt } from '../engine/territory';
import {
  COMBATANT_IDS,
  type CombatantId,
  type LonLat,
  type OwnerId,
  type TargetItem,
} from '../engine/types';
import { formatRatio, whereItLanded } from './describe';

export type CommentKind = 'phase' | 'lob' | 'outcome' | 'talk' | 'score' | 'note' | 'end';

export interface Comment {
  /** The game clock when it happened. */
  readonly at: number;
  readonly text: string;
  readonly kind: CommentKind;
  /** Whose move it was, for colouring. */
  readonly by?: CombatantId;
  /** Shown only once this many lobs have landed on the courts, so nothing is told before it is seen. */
  readonly afterLobs: number;
}

const isCombatant = (id: OwnerId): id is CombatantId =>
  (COMBATANT_IDS as readonly string[]).includes(id);

/** "SOVWAR", or "Canada" for a nation nobody plays. */
function whose(state: GameState, owner: OwnerId): string {
  return isCombatant(owner) ? codeOf(state.situation, owner) : UNPLAYED_NATIONS[owner].name;
}

const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** Target kinds in a watcher's words. */
const KIND_WORDS: Readonly<Record<TargetItem['type'], string>> = {
  MAMA: 'city',
  airfield: 'airfield',
  bridge: 'bridge',
  'satellite-site': 'satellite monitoring site',
  'carrier-group': 'carrier group',
  'power-plant': 'power plant',
  'rail-convergence': 'rail junction',
  CONFORCON: 'troop concentration (CONFORCON)',
  SSTRAC: 'command site (SSTRAC)',
  'enrichment-plant': 'enrichment plant',
  reactor: 'reactor',
  'fusion-lab': 'Annular Fusion lab',
  'missile-installation': 'missile installation',
  'silo-cluster': 'silo cluster',
  'antimissile-installation': 'antimissile installation',
  'bomber-squadron': 'bomber squadron',
  submarine: 'submarine',
};

/** "a SOVWAR missile installation", "an AMNAT city". */
function kindOf(state: GameState, item: TargetItem): string {
  const what = KIND_WORDS[item.type];
  const owner = whose(state, item.owner);
  return `${/^[AEIOU]/.test(owner) ? 'an' : 'a'} ${owner} ${what}`;
}

const pts = (n: number): string => (n === 0 ? '0' : n < 10 ? n.toFixed(1) : n.toFixed(0));

/** What each phase is, for someone who has never seen the game. */
export function explainPhase(phase: Phase, state: GameState): string {
  const end = clockLabel(state.situation.clock?.end ?? 16 * 60);
  switch (phase) {
    case 'worldSituation':
      return `The teams read the World Situation: the state of the world this game starts from. ${String(quorum(state.situation))} of the ${String(state.situation.combatants.length)} teams must endorse it. Its figures have already filled each team's bucket with warheads (dead tennis balls), and only the game-master knows how many each holds.`;
    case 'trigsit':
      return 'The game-master proposes a TRIGSIT, the crisis that sets the war off. A majority must agree to it before anyone talks.';
    case 'summit':
      return 'The summit: before a ball is lobbed, the teams make pacts and bluff about their strength. Each knows only its own bucket. You see everything, including the bluffs.';
    case 'play':
      return `Play: teams raise their alert and lob warheads at each other's garments, which stand for cities, bases and submarines. A team needs DEFCON ${String(LAUNCH_DEFCON)} to lob, ${String(MIRV_DEFCON)} for a MIRV jockstrap and Maximum Readiness to aim at a city. It ends when the buckets are empty, when one team is left, when all agree, or at the ${end} siren.`;
    case 'ended':
      return 'Game over. EndStat does not reward the most damage: the winner is the team with the best ratio of harm done to harm suffered.';
  }
}

const PACT_MEANING: Readonly<Record<PactKind, string>> = {
  alliance: 'neither may strike the other, and when one is struck the other matches its alert',
  humaneWar: 'neither may aim at the other’s cities',
  hotline: 'they can send each other messages during play',
  defconGradient: 'each may raise its alert only one step at a time',
  cityTrade: 'each may strike the one city the other put up',
};

function pactLine(state: GameState, p: Pact): string {
  const who = p.parties.map((id) => codeOf(state.situation, id)).join(' and ');
  return `${who} agree a ${lower(PACT_LABELS[p.kind])}: ${PACT_MEANING[p.kind]}.`;
}

function defconLine(state: GameState, by: CombatantId, from: Defcon, to: Defcon): string {
  const code = codeOf(state.situation, by);
  const verb = to > from ? 'raises' : 'lowers';
  const means =
    to < from
      ? ''
      : to >= CITY_DEFCON && from < CITY_DEFCON
        ? ': it may now aim at cities'
        : to >= MIRV_DEFCON && from < MIRV_DEFCON
          ? ': it may now fire a MIRV jockstrap of several warheads'
          : to >= LAUNCH_DEFCON && from < LAUNCH_DEFCON
            ? ': it may now lob'
            : '';
  return `${code} ${verb} its alert to ${defconLabel(to)}${means}.`;
}

/** What a team says at the summit, and what it really holds. */
function statementLine(state: GameState, by: CombatantId, text: string): string {
  const code = codeOf(state.situation, by);
  const lines = state.allocation.lines.filter((l) =>
    state.situation.combatants.includes(l.combatant),
  );
  const mine = lines.find((l) => l.combatant === by)?.warheads ?? 0;
  const mean = lines.reduce((n, l) => n + l.warheads, 0) / Math.max(1, lines.length);
  const compared = mine > mean * 1.15 ? 'more than' : mine < mean * 0.85 ? 'fewer than' : 'about';
  return `${code}: “${text}” (In fact it holds ${String(mine)} warheads, ${compared} the average of ${String(Math.round(mean))}.)`;
}

/** The means to fight back: what a SPASEX exchange goes after. */
const MILITARY: ReadonlySet<TargetItem['type']> = new Set([
  'missile-installation',
  'silo-cluster',
  'bomber-squadron',
  'submarine',
  'SSTRAC',
  'antimissile-installation',
  'CONFORCON',
  'carrier-group',
  'airfield',
  'satellite-site',
]);

/** Why a team would aim there, in a sentence. */
function purpose(state: GameState, by: CombatantId, target: TargetItem): string {
  const owner = whose(state, target.owner);
  if (!isCombatant(target.owner)) return `Nobody plays ${owner}: a strike there scores nothing.`;
  if (target.owner === by) return 'That is its own: a strike there only hurts itself.';
  if (target.type === 'MAMA')
    return `A city: striking civilians on purpose is SACPOP, and EndStat charges for it.`;
  if (MILITARY.has(target.type))
    return `SPASEX: going after ${owner}’s means to strike back, not its people.`;
  return `Industry, not people: harm to ${owner} without going for its cities.`;
}

/** The lob as the striker meant it: from where, at what, and why. */
function launchLine(prev: GameState, action: Extract<Action, { type: 'launch' }>): string {
  const { order } = action;
  const code = codeOf(prev.situation, order.combatant);
  const items = itemsOf(prev);
  const platform =
    platformsFor(order.combatant, prev.situation, items).find((p) => p.id === order.platformId)
      ?.name ?? order.platformId;
  const what =
    order.warheads === 1 ? 'one warhead' : `a jockstrap of ${String(order.warheads)} warheads`;
  const target = order.aimAt ? declaredTarget(order.aimAt, items) : undefined;
  const ground = order.aimAt ? territoryAt(order.aimAt)?.name : undefined;
  const at = target
    ? ` at ${target.name}, ${kindOf(prev, target)}`
    : ground
      ? ` at open ground in ${ground}`
      : '';
  const why = target ? ` ${purpose(prev, order.combatant, target)}` : '';
  return `${code} lobs ${what} from ${platform}${at}.${why}`;
}

/** What one warhead did, as EndStat scores it. */
function warheadLine(
  state: GameState,
  s: StrikeReport,
  many: boolean,
  aimAt: LonLat | undefined,
): string {
  const lead = many ? `Warhead ${String(s.detonation.warhead)}: ` : '';
  const d = s.detonation;
  if (d.struck)
    return `${lead}It struck ${d.struck.label}. The map is not the territory: nothing scores.`;
  if (d.offMap) return `${lead}It came down off the map and does nothing.`;
  if (s.hits.length === 0)
    return aimAt
      ? `${lead}Missed by ${km(greatCircleKm(d.lonLat, aimAt))}, ${territoryAt(d.lonLat) ? `in ${territoryAt(d.lonLat)?.name ?? ''}` : 'at sea'}.`
      : `${lead}It landed ${whereItLanded(d)}, with nothing in reach.`;
  const parts = s.hits.map((h) => {
    const name = `${h.item.name} (${whose(state, h.item.owner)})`;
    const how = h.kind === 'direct' ? 'direct hit on' : 'caught';
    const damage =
      h.item.type === 'MAMA'
        ? h.deaths > 0
          ? `, ${h.deaths >= 1 ? `${h.deaths.toFixed(1)} million` : `${String(Math.round(h.deaths * 1000))},000`} dead${h.firestorm ? ' in a firestorm' : ''}`
          : ''
        : h.destruction > 0
          ? `, ${(h.destruction * 100).toFixed(0)}% destroyed`
          : '';
    const scoring =
      h.scoring === 'mistargeting'
        ? `; nobody plays ${whose(state, h.item.owner)}, so it is a regrettable mistargeting and scores nothing`
        : h.scoring === 'own-goal'
          ? '; it is the thrower’s own, so it only hurts itself'
          : '';
    return `${how} ${name}${damage}${scoring}`;
  });
  const first = parts[0] ?? '';
  const fallout = s.fallout.filter((f) => !s.hits.some((h) => h.item.id === f.city.id));
  return [
    `${lead}${first.charAt(0).toUpperCase()}${first.slice(1)}${parts.length > 1 ? `; ${parts.slice(1).join('; ')}` : ''}.`,
    fallout.length > 0 ? ` Fallout drifts over ${fallout.map((f) => f.city.name).join(', ')}.` : '',
    s.sacpop
      ? ` That was a city, on purpose: ${codeOf(state.situation, s.combatant)} has gone SACPOP, and EndStat charges it a penalty.`
      : '',
  ].join('');
}

const km = (n: number): string => `${n < 10 ? n.toFixed(1) : n.toFixed(0)} km`;

/** How a lob moved the score: harm done by the striker, harm suffered by everyone it hurt. */
function scoreLine(prev: GameState, next: GameState, by: CombatantId): string | undefined {
  const parts: string[] = [];
  const was = (id: CombatantId) => prev.endstat.tallies[id];
  const now = (id: CombatantId) => next.endstat.tallies[id];
  const done = [now(by)?.inddir ?? 0, was(by)?.inddir ?? 0] as const;
  if (Math.abs(done[0] - done[1]) >= 0.05)
    parts.push(`harm done by ${codeOf(next.situation, by)} ${pts(done[1])} → ${pts(done[0])}`);
  for (const id of next.situation.combatants) {
    const after = now(id)?.sufddir ?? 0;
    const before = was(id)?.sufddir ?? 0;
    if (Math.abs(after - before) >= 0.05)
      parts.push(`harm suffered by ${codeOf(next.situation, id)} ${pts(before)} → ${pts(after)}`);
  }
  if (parts.length === 0) return undefined;
  const text = parts.join('; ');
  return `Score: ${text}.`;
}

/** The best ratio, said plainly. */
export function leaderLine(state: GameState): string {
  const w = state.endstat.winner;
  if (!w) return 'Nobody leads: no team has done any harm to another yet.';
  const t = state.endstat.tallies[w];
  const code = codeOf(state.situation, w);
  if (!t) return `${code} leads.`;
  return t.ratio === Infinity
    ? `${code} leads: it has done harm (${pts(t.inddir)}) and suffered none.`
    : `${code} leads, with the best ratio of harm done to harm suffered: ${pts(t.inddir)} to ${pts(t.sufddir)}, or ${formatRatio(t)}.`;
}

/** Why the winner won, and why the biggest hitter did not. */
export function verdict(state: GameState): string {
  const w = state.endstat.winner;
  if (!w) return 'Nobody wins: no team did any harm to another.';
  const t = state.endstat.tallies[w];
  const code = codeOf(state.situation, w);
  if (!t) return `${code} wins.`;
  const why =
    t.ratio === Infinity
      ? state.endstat.standings.some((x) => x.combatant !== w && x.ratio === Infinity)
        ? `${code} wins: it did harm (${pts(t.inddir)}) and suffered none, and of the teams that suffered nothing it did the most harm.`
        : `${code} wins: it did harm (${pts(t.inddir)}) and suffered none, so nobody can beat its ratio.`
      : `${code} wins with the best ratio of harm done to harm suffered: ${pts(t.inddir)} to ${pts(t.sufddir)}, or ${formatRatio(t)}.`;
  const most = state.endstat.standings.reduce<Tally | undefined>(
    (best, x) => (!best || x.inddir > best.inddir ? x : best),
    undefined,
  );
  const biggest =
    most && most.combatant !== w && most.inddir > t.inddir
      ? ` ${codeOf(state.situation, most.combatant)} did the most harm (${pts(most.inddir)}) but suffered ${pts(most.sufddir)} in return, a ratio of ${formatRatio(most)}.`
      : '';
  return why + biggest;
}

/**
 * What a watcher is told about one action: `prev` is the game before it,
 * `next` after. Outcomes of a lob wait until its ball has landed.
 */
export function commentOn(prev: GameState, action: Action, next: GameState): Comment[] {
  const out: Comment[] = [];
  const now = next.lobs.length;
  const add = (
    text: string,
    kind: CommentKind,
    by?: CombatantId,
    afterLobs = now,
    at = prev.clock,
  ): void => {
    out.push({ at, text, kind, afterLobs, ...(by ? { by } : {}) });
  };
  let log =
    next.log.length >= prev.log.length && next.log[0] === prev.log[0]
      ? next.log.slice(prev.log.length)
      : [];

  if (action.type === 'launch' && next.lobs.length > prev.lobs.length) {
    add(launchLine(prev, action), 'lob', action.order.combatant, prev.lobs.length);
    const n = next.lobs.length;
    const strikes = next.endstat.strikes.filter((s) => s.order === n);
    for (const s of strikes)
      add(
        warheadLine(next, s, strikes.length > 1, action.order.aimAt),
        'outcome',
        action.order.combatant,
      );
    const score = scoreLine(prev, next, action.order.combatant);
    if (score) add(score, 'outcome', action.order.combatant);
    for (const id of next.endstat.destroyedPlatforms)
      if (!prev.endstat.destroyedPlatforms.includes(id)) {
        const item = itemsOf(next).find((t) => t.id === id);
        if (item) add(`${item.name} can no longer launch.`, 'outcome', action.order.combatant);
      }
    // The first log line only says who lobbed from where; the rest (rulings, alliances, broken pacts) stand.
    log = log.slice(1);
    // The apparatus line says the same as the outcome above.
    log = log.filter((e) => !e.text.includes('the apparatus of the game, not the territory'));
  } else if (action.type === 'statement' && next.statements.length > prev.statements.length) {
    add(statementLine(next, action.by, action.text.trim()), 'talk', action.by);
    log = log.slice(1);
  } else if (action.type === 'setDefcon' && next.defcon !== prev.defcon) {
    const from = prev.defcon[action.by];
    const to = next.defcon[action.by];
    if (from !== undefined && to !== undefined && from !== to) {
      add(defconLine(next, action.by, from, to), 'note', action.by);
      log = log.slice(1);
    }
  } else if (action.type === 'message' && next.messages.length > prev.messages.length) {
    const m = next.messages.at(-1);
    if (m) {
      add(
        `${codeOf(next.situation, m.from)} to ${codeOf(next.situation, m.to)}, down the hotline: “${m.text}”`,
        'talk',
        m.from,
      );
      log = log.filter((e) => !e.text.startsWith('The game-master carries a message'));
    }
  } else if (action.type === 'agreeToEnd' && next.agreedToEnd.length > prev.agreedToEnd.length) {
    const live = next.situation.combatants.filter((id) => inContention(next, id));
    const agreed = live.filter((id) => next.agreedToEnd.includes(id));
    add(
      `${codeOf(next.situation, action.by)} agrees to end the game: ${String(agreed.length)} of the ${String(live.length)} teams still able to fight have agreed, and it ends when all of them do.`,
      'note',
      action.by,
    );
    log = log.slice(1);
  } else if (action.type === 'advanceClock' && log.length === 0 && next.phase !== 'ended') {
    add(
      `Nobody moves. The game-master advances the clock to ${clockLabel(next.clock)}.`,
      'note',
      undefined,
      now,
      next.clock,
    );
  }

  // A newly agreed pact is said once, with what it means, instead of the log's bare record of it.
  const agreed = next.pacts.filter(
    (p) => p.active && !p.broken && !prev.pacts.find((q) => q.id === p.id)?.active,
  );
  log = log.filter((e) => !agreed.some((p) => e.text.startsWith(`${PACT_LABELS[p.kind]} agreed:`)));

  const ended = next.phase === 'ended' && prev.phase !== 'ended';
  for (const e of log) {
    // The end of the game gets its own line below.
    if (ended && e.text.includes('EndStat confirms')) continue;
    const by = COMBATANT_IDS.find((id) => e.text.startsWith(`${codeOf(next.situation, id)} `));
    add(e.text, 'note', by, now, e.at);
  }
  for (const p of agreed) add(pactLine(next, p), 'talk');

  if (next.phase !== prev.phase && !ended)
    add(explainPhase(next.phase, next), 'phase', undefined, now, next.clock);

  if (ended) {
    const detail = next.ended?.detail ?? '';
    add(`${detail} ${verdict(next)}`.trim(), 'end', next.endstat.winner, now, next.clock);
  } else if (next.endstat.winner !== prev.endstat.winner)
    add(leaderLine(next), 'score', next.endstat.winner, now, next.clock);

  return out;
}

/** One row of the watcher's scoreboard. */
export interface ScoreRow {
  readonly combatant: CombatantId;
  readonly code: string;
  readonly defcon: Defcon | undefined;
  readonly left: number;
  readonly done: number;
  readonly suffered: number;
  readonly ratio: string;
  readonly leads: boolean;
  readonly sacpop: boolean;
}

/** Every team, best ratio first. */
export function scoreboard(state: GameState): ScoreRow[] {
  const ids = state.situation.combatants;
  const order = [
    ...state.endstat.standings.map((t) => t.combatant).filter((id) => ids.includes(id)),
    ...ids.filter((id) => !state.endstat.standings.some((t) => t.combatant === id)),
  ];
  return order.map((id) => {
    const t = state.endstat.tallies[id];
    return {
      combatant: id,
      code: codeOf(state.situation, id),
      defcon: state.defcon[id],
      left: bucketOf(state, id),
      done: t?.inddir ?? 0,
      suffered: t?.sufddir ?? 0,
      ratio: t ? formatRatio(t) : '—',
      leads: state.endstat.winner === id,
      sacpop: t?.wentSacpop ?? false,
    };
  });
}
