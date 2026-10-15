/**
 * The game-master's game: the whole flow from the World Situation to the
 * winner, as a pure reducer over actions. A game is its seed plus its action
 * log, so it replays exactly.
 *
 * Phases: the World Situation is endorsed by a quorum, a TRIGSIT is agreed by
 * a quorum, the summit records pacts, then play is order-driven (A8): each
 * order is declared to the game-master, validated, lobbed and adjudicated
 * before the next. Messages go through the game-master over the hotline.
 *
 * Throughout, the map is not the territory (section 1.7): a ball that strikes
 * the apparatus scores nothing, weather on the courts never reaches EndStat,
 * and only submarines and carrier groups ever move.
 */
import { ALLOCATION_METHOD_LABELS, allocate, type Allocation } from './allocation';
import { distanceToRect, garmentRects } from './apparatus';
import { checkMove, itemsNow } from './axiom';
import { fillBuckets, takeFromBucket, type BallSupply } from './buckets';
import { COMBATANTS } from './data/combatants';
import { TARGETS } from './data/targets';
import type { Trigsit } from './data/trigsits';
import { endstatKillRadius } from './effects';
import { computeEndStat, type EndStatReport } from './endstat';
import {
  FLAT_KILL_RADIUS_KM,
  platformsFor,
  resolveLob,
  validateLaunch,
  type LaunchOrder,
  type LobResult,
} from './lob';
import { kmToCourtMetres, project } from './projection';
import { createRng } from './rng';
import { ownerAt } from './territory';
import type {
  AllocationMethod,
  CombatantId,
  LonLat,
  OwnerId,
  Precipitation,
  TargetItem,
  WorldSituation,
} from './types';

export type Phase = 'worldSituation' | 'trigsit' | 'summit' | 'play' | 'ended';

/** DEFCON as the book numbers it (A7): higher is more alert; 6 is Maximum Readiness. */
export type Defcon = 1 | 2 | 3 | 4 | 5 | 6;
export const MAXIMUM_READINESS: Defcon = 6;
export const STARTING_DEFCON: Defcon = 2;
/** Lowest DEFCON at which a Combatant may lob at all. */
export const LAUNCH_DEFCON: Defcon = 4;
/** Lowest DEFCON for a MIRV jockstrap. */
export const MIRV_DEFCON: Defcon = 5;
/** Aiming at a city takes Maximum Readiness. */
export const CITY_DEFCON: Defcon = 6;

export function defconLabel(d: Defcon): string {
  return d === MAXIMUM_READINESS ? 'Maximum Readiness' : `DEFCON ${String(d)}`;
}

/**
 * The game-master's everyday beanie is gray and declares nothing. White
 * declares a cessation between two Combatants; red declares Utter Global
 * Crisis; black does nothing at all (A4).
 */
export type Beanie = 'gray' | 'white' | 'red' | 'black';

export type PactKind = 'alliance' | 'humaneWar' | 'hotline' | 'defconGradient' | 'cityTrade';

export const PACT_LABELS: Readonly<Record<PactKind, string>> = {
  alliance: 'Mutual-defence alliance',
  humaneWar: 'Humane-war pact',
  hotline: 'Hotline',
  defconGradient: 'DEFCON gradient',
  cityTrade: 'City trade',
};

export interface Pact {
  readonly id: number;
  readonly kind: PactKind;
  readonly parties: readonly CombatantId[];
  readonly proposedBy: CombatantId;
  readonly acceptedBy: readonly CombatantId[];
  readonly active: boolean;
  /** For a city trade: the city each party puts up. */
  readonly cities?: Readonly<Partial<Record<CombatantId, string>>>;
  readonly broken?: string;
}

export interface Message {
  readonly id: number;
  readonly at: number;
  readonly from: CombatantId;
  readonly to: CombatantId;
  readonly text: string;
}

/** Who may read a log entry. */
export type Audience = 'all' | 'gameMaster' | readonly CombatantId[];

export interface LogEntry {
  readonly at: number;
  readonly text: string;
  readonly audience: Audience;
}

export interface OrderRecord {
  readonly n: number;
  readonly at: number;
  readonly order: LaunchOrder;
  readonly accepted: boolean;
  readonly problems: readonly string[];
  /** Index into `lobs` when it was flown. */
  readonly lob?: number;
  /** Set when a human game-master ruled on it. */
  readonly ruledBy?: 'god';
}

export interface Problem {
  readonly text: string;
  /** Hard problems no ruling can wave through: no such platform, no balls left, wrong phase. */
  readonly hard: boolean;
}

export type Action =
  | { readonly type: 'setMethod'; readonly method: AllocationMethod }
  | { readonly type: 'endorse'; readonly by: CombatantId }
  | { readonly type: 'setTrigsit'; readonly trigsit: Trigsit }
  | { readonly type: 'agreeTrigsit'; readonly by: CombatantId }
  | {
      readonly type: 'proposePact';
      readonly by: CombatantId;
      readonly kind: PactKind;
      readonly parties: readonly CombatantId[];
      readonly cities?: Readonly<Partial<Record<CombatantId, string>>>;
    }
  | { readonly type: 'acceptPact'; readonly by: CombatantId; readonly pact: number }
  | { readonly type: 'closeSummit' }
  | { readonly type: 'setDefcon'; readonly by: CombatantId; readonly level: Defcon }
  | { readonly type: 'launch'; readonly order: LaunchOrder }
  | {
      readonly type: 'message';
      readonly from: CombatantId;
      readonly to: CombatantId;
      readonly text: string;
    }
  | {
      readonly type: 'beanie';
      readonly beanie: Beanie;
      readonly between?: readonly [CombatantId, CombatantId];
    }
  | { readonly type: 'advanceClock'; readonly minutes: number }
  | { readonly type: 'agreeToEnd'; readonly by: CombatantId }
  | { readonly type: 'setHumanGod'; readonly on: boolean }
  | { readonly type: 'rule'; readonly pending: number; readonly allow: boolean }
  | {
      readonly type: 'moveItem';
      readonly by: CombatantId;
      readonly item: string;
      readonly to: LonLat;
    }
  | { readonly type: 'courtWeather'; readonly precipitation: Precipitation }
  | { readonly type: 'weatherAppeal'; readonly by: CombatantId };

/** An order or message waiting for a human game-master's ruling (A14). */
export interface PendingRuling {
  readonly id: number;
  readonly action: Extract<Action, { type: 'launch' } | { type: 'message' }>;
  /** What the engine would say: an empty list means it would allow it. */
  readonly problems: readonly string[];
}

export type EndReason = 'bucketsEmpty' | 'lastInContention' | 'agreed' | 'clock';

export interface GameEnd {
  readonly reason: EndReason;
  readonly detail: string;
  readonly winner: CombatantId | undefined;
}

export interface GameState {
  readonly situation: WorldSituation;
  readonly method: AllocationMethod;
  readonly allocation: Allocation;
  readonly supply: BallSupply;
  readonly phase: Phase;
  readonly endorsedBy: readonly CombatantId[];
  readonly trigsit: Trigsit | undefined;
  readonly trigsitAgreedBy: readonly CombatantId[];
  readonly pacts: readonly Pact[];
  readonly defcon: Readonly<Partial<Record<CombatantId, Defcon>>>;
  readonly beanie: Beanie;
  /** The pair under the white beanie, if any. */
  readonly cessation: readonly [CombatantId, CombatantId] | undefined;
  readonly messages: readonly Message[];
  readonly lobs: readonly LobResult[];
  readonly orders: readonly OrderRecord[];
  readonly log: readonly LogEntry[];
  readonly agreedToEnd: readonly CombatantId[];
  /** Minutes after midnight. */
  readonly clock: number;
  readonly humanGod: boolean;
  readonly pending: readonly PendingRuling[];
  readonly nextId: number;
  readonly rng: readonly [number, number, number, number];
  readonly endstat: EndStatReport;
  readonly ended: GameEnd | undefined;
  /** Where moved submarines and carrier groups now lie; everything else is where the map puts it. */
  readonly positions: Readonly<Record<string, LonLat>>;
  /** The real weather over the East Courts. EndStat never reads it. */
  readonly courtWeather: Precipitation;
}

export interface Outcome {
  readonly state: GameState;
  readonly ok: boolean;
  readonly problems: readonly string[];
  /** Set when a launch was flown. */
  readonly lob?: LobResult;
  /** Set when the action went to the game-master for a ruling. */
  readonly pending?: number;
}

/** Minutes the clock moves for each accepted order and each message. */
export const MINUTES_PER_ORDER = 5;
export const MINUTES_PER_MESSAGE = 1;

const DEFAULT_CLOCK = { start: 13 * 60 + 30, end: 16 * 60 };

export function clockLabel(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}h`;
}

export function quorum(ws: WorldSituation): number {
  return Math.floor(ws.combatants.length / 2) + 1;
}

const code = (id: CombatantId): string => COMBATANTS[id].code;

export function newGame(
  situation: WorldSituation,
  method: AllocationMethod = situation.allocationMethod,
): GameState {
  const allocation = allocate(situation, COMBATANTS, { method, rng: createRng(situation.seed) });
  const defcon: Partial<Record<CombatantId, Defcon>> = {};
  for (const id of situation.combatants) defcon[id] = STARTING_DEFCON;
  const clock = situation.clock ?? DEFAULT_CLOCK;
  return {
    situation,
    method,
    allocation,
    supply: fillBuckets(allocation),
    phase: 'worldSituation',
    endorsedBy: [],
    trigsit: undefined,
    trigsitAgreedBy: [],
    pacts: [],
    defcon,
    beanie: 'gray',
    cessation: undefined,
    messages: [],
    lobs: [],
    orders: [],
    log: [
      {
        at: clock.start,
        text: `World Situation: ${situation.title}. A quorum of ${String(quorum(situation))} of the ${String(situation.combatants.length)} Combatants must endorse it.`,
        audience: 'all',
      },
    ],
    agreedToEnd: [],
    clock: clock.start,
    humanGod: false,
    pending: [],
    nextId: 1,
    rng: createRng(situation.seed + 1).state(),
    endstat: computeEndStat(situation, COMBATANTS, allocation, []),
    ended: undefined,
    positions: {},
    courtWeather: 'none',
  };
}

/** The garments as they lie in this game. */
export function itemsOf(state: GameState): TargetItem[] {
  return itemsNow(TARGETS, state.positions);
}

const refuse = (state: GameState, ...problems: string[]): Outcome => ({
  state,
  ok: false,
  problems,
});
const done = (state: GameState, extra: Partial<Outcome> = {}): Outcome => ({
  state,
  ok: true,
  problems: [],
  ...extra,
});
const say = (state: GameState, text: string, audience: Audience = 'all'): GameState => ({
  ...state,
  log: [...state.log, { at: state.clock, text, audience }],
});

function isPlaying(state: GameState, id: OwnerId | undefined): id is CombatantId {
  return id !== undefined && (state.situation.combatants as readonly string[]).includes(id);
}

const activePacts = (state: GameState, kind: PactKind): Pact[] =>
  state.pacts.filter((p) => p.kind === kind && p.active && !p.broken);
const bothIn = (p: Pact, a: CombatantId, b: CombatantId): boolean =>
  p.parties.includes(a) && p.parties.includes(b);

/** The target item a declared aim point names: the garment under it, or the nearest within a flat kill radius. */
export function declaredTarget(
  aim: LonLat,
  items: readonly TargetItem[] = TARGETS,
): TargetItem | undefined {
  const p = project(aim);
  let best: TargetItem | undefined;
  let bestD = kmToCourtMetres(FLAT_KILL_RADIUS_KM);
  for (const r of garmentRects(items)) {
    const d = distanceToRect(p, r);
    if (d <= bestD) {
      bestD = d;
      best = r.item;
    }
  }
  return best;
}

/** Whom a declared aim is against: the owner of the target it names, or of the ground under it. */
export function declaredVictim(
  aim: LonLat,
  items: readonly TargetItem[] = TARGETS,
): OwnerId | undefined {
  return declaredTarget(aim, items)?.owner ?? ownerAt(aim);
}

export function bucketOf(state: GameState, id: CombatantId): number {
  return state.supply.buckets[id] ?? 0;
}

/** Still able to change the outcome: balls, somewhere to lob them from, and not ruined by its own SACPOP. */
export function inContention(state: GameState, id: CombatantId): boolean {
  if (bucketOf(state, id) === 0) return false;
  const usable = platformsFor(id, state.situation).filter(
    (p) => !state.endstat.destroyedPlatforms.includes(p.id),
  );
  if (usable.length === 0) return false;
  const t = state.endstat.tallies[id];
  return !(t?.wentSacpop && t.ratio !== undefined && t.ratio < 1);
}

/** Every problem the game-master sees with a launch order, hard and soft. */
export function launchProblems(state: GameState, order: LaunchOrder): Problem[] {
  const hard = (text: string): Problem => ({ text, hard: true });
  const soft = (text: string): Problem => ({ text, hard: false });
  if (state.phase !== 'play') return [hard('Lobs are allowed only once play has started')];
  const problems = validateLaunch(
    order,
    state.situation,
    COMBATANTS,
    bucketOf(state, order.combatant),
    state.endstat.destroyedPlatforms,
  ).map(hard);
  if (problems.length > 0) return problems;
  const by = order.combatant;
  const ugc = state.beanie === 'red';
  const level = state.defcon[by] ?? STARTING_DEFCON;
  if (!order.aimAt) return [hard('Declare an aim point to the game-master first')];
  const target = declaredTarget(order.aimAt, itemsOf(state));
  const victim = target?.owner ?? ownerAt(order.aimAt);
  const atCity = target?.type === 'MAMA';
  if (level < LAUNCH_DEFCON)
    problems.push(
      soft(
        `${code(by)} is at ${defconLabel(level)}; a lob needs ${defconLabel(LAUNCH_DEFCON)} or higher`,
      ),
    );
  if (order.warheads > 1 && level < MIRV_DEFCON)
    problems.push(soft(`a MIRV jockstrap needs ${defconLabel(MIRV_DEFCON)} or higher`));
  if (atCity && level < CITY_DEFCON)
    problems.push(soft(`aiming at a city needs ${defconLabel(CITY_DEFCON)}`));
  if (!ugc && isPlaying(state, victim) && victim !== by) {
    const c = state.cessation;
    if (c && c.includes(by) && c.includes(victim))
      problems.push(
        soft(`the white beanie is on: ${code(c[0])} and ${code(c[1])} are in cessation`),
      );
    for (const p of activePacts(state, 'alliance'))
      if (bothIn(p, by, victim)) problems.push(soft(`${code(victim)} is ${code(by)}'s ally`));
    if (atCity)
      for (const p of activePacts(state, 'humaneWar')) {
        if (!bothIn(p, by, victim)) continue;
        const licensed = activePacts(state, 'cityTrade').some(
          (t) => bothIn(t, by, victim) && t.cities?.[victim] === target.id,
        );
        if (!licensed)
          problems.push(soft(`${code(by)} and ${code(victim)} have a humane-war pact: no cities`));
      }
  }
  return problems;
}

export function messageProblems(
  state: GameState,
  from: CombatantId,
  to: CombatantId,
  text: string,
): Problem[] {
  const problems: Problem[] = [];
  if (state.phase === 'ended') return [{ text: 'The game is over', hard: true }];
  if (from === to) return [{ text: 'A Combatant cannot send itself a message', hard: true }];
  if (!isPlaying(state, to)) return [{ text: `${code(to)} is not playing`, hard: true }];
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return [{ text: 'The message is empty', hard: true }];
  const parley = state.cessation?.includes(from) && state.cessation.includes(to);
  const hotline = activePacts(state, 'hotline').some((p) => bothIn(p, from, to));
  if (!hotline && !parley && state.phase === 'play')
    problems.push({ text: `${code(from)} has no hotline to ${code(to)}`, hard: false });
  const limit = Math.min(
    state.endstat.comm[from]?.words ?? 80,
    state.endstat.comm[to]?.words ?? 80,
  );
  if (words > limit)
    problems.push({
      text: `EMP has cut the hotline to ${String(limit)} words; this message has ${String(words)}`,
      hard: limit === 0,
    });
  return problems;
}

function checkEnd(state: GameState): GameState {
  if (state.phase !== 'play') return state;
  const end = (reason: EndReason, detail: string): GameState => {
    const winner = state.endstat.winner;
    const s: GameState = { ...state, phase: 'ended', ended: { reason, detail, winner } };
    return say(
      s,
      `${detail} EndStat confirms ${winner ? `${code(winner)} as the winner` : 'no winner'}.`,
    );
  };
  const end_ = state.situation.clock?.end ?? DEFAULT_CLOCK.end;
  if (state.clock >= end_) return end(`clock`, `The ${clockLabel(end_)} siren.`);
  const ids = state.situation.combatants;
  if (ids.every((id) => bucketOf(state, id) === 0))
    return end('bucketsEmpty', 'Every bucket is empty.');
  const live = ids.filter((id) => inContention(state, id));
  if (state.lobs.length > 0 && live.length <= 1)
    return end(
      'lastInContention',
      live.length === 1
        ? `Only ${code(live[0] as CombatantId)} is still in contention.`
        : 'Nobody is still in contention.',
    );
  if (live.length > 0 && live.every((id) => state.agreedToEnd.includes(id)))
    return end('agreed', 'Every Combatant still in contention has agreed to end it.');
  return state;
}

function flyLaunch(state: GameState, order: LaunchOrder, ruledBy?: 'god'): Outcome {
  const rng = createRng(state.rng);
  const items = itemsOf(state);
  const lob = resolveLob(order, state.situation, rng, endstatKillRadius(state.situation), {
    items,
  });
  const lobs = [...state.lobs, lob];
  const endstat = computeEndStat(state.situation, COMBATANTS, state.allocation, lobs, items);
  let s: GameState = {
    ...state,
    rng: rng.state(),
    supply: takeFromBucket(state.supply, order.combatant, order.warheads),
    lobs,
    endstat,
    clock: state.clock + MINUTES_PER_ORDER,
    orders: [
      ...state.orders,
      {
        n: state.orders.length + 1,
        at: state.clock,
        order,
        accepted: true,
        problems: [],
        lob: lobs.length - 1,
        ...(ruledBy ? { ruledBy } : {}),
      },
    ],
  };
  const platform = platformsFor(order.combatant, state.situation).find(
    (p) => p.id === order.platformId,
  );
  s = say(
    s,
    `${code(order.combatant)} lobs ${order.warheads === 1 ? 'a warhead' : `a jockstrap of ${String(order.warheads)}`} from ${platform?.name ?? order.platformId}.`,
  );
  const struck = lob.detonations.filter((d) => d.struck);
  const first = struck[0]?.struck;
  if (first)
    s = say(
      s,
      `${struck.length === 1 ? 'The ball' : `${String(struck.length)} warheads`} struck ${first.label}: the apparatus of the game, not the territory. Logged off the map; nothing scores.`,
    );

  // Pacts the strike sets off or breaks.
  const newStrikes = endstat.strikes.filter((x) => x.order === lobs.length);
  const victims = new Set<CombatantId>();
  for (const x of newStrikes)
    for (const h of x.hits)
      if (isPlaying(s, h.item.owner) && h.item.owner !== order.combatant) victims.add(h.item.owner);
  for (const v of victims) {
    for (const p of activePacts(s, 'alliance')) {
      if (!p.parties.includes(v)) continue;
      const level = s.defcon[v] ?? STARTING_DEFCON;
      for (const ally of p.parties) {
        if (ally === v || ally === order.combatant) continue;
        if ((s.defcon[ally] ?? STARTING_DEFCON) < level) {
          s = { ...s, defcon: { ...s.defcon, [ally]: level } };
          s = say(
            s,
            `${code(ally)} honours its alliance with ${code(v)} and goes to ${defconLabel(level)}.`,
          );
        }
      }
    }
    const traded = (cityId: string): boolean =>
      activePacts(s, 'cityTrade').some(
        (t) => bothIn(t, order.combatant, v) && t.cities?.[v] === cityId,
      );
    const sacpopOnV = newStrikes.some(
      (x) =>
        x.sacpop &&
        x.hits.some(
          (h) =>
            h.item.owner === v && h.item.type === 'MAMA' && h.severity >= 0.5 && !traded(h.item.id),
        ),
    );
    if (sacpopOnV)
      s = {
        ...s,
        pacts: s.pacts.map((p) =>
          p.kind === 'humaneWar' && p.active && !p.broken && bothIn(p, order.combatant, v)
            ? {
                ...p,
                broken: `${code(order.combatant)} struck a ${code(v)} city at ${clockLabel(state.clock)}`,
              }
            : p,
        ),
      };
  }
  for (const p of s.pacts)
    if (p.broken && !state.pacts.find((q) => q.id === p.id)?.broken)
      s = say(
        s,
        `The humane-war pact between ${p.parties.map(code).join(' and ')} is broken: ${p.broken}.`,
      );
  return done(checkEnd(s), { lob });
}

function sendMessage(
  state: GameState,
  from: CombatantId,
  to: CombatantId,
  text: string,
): GameState {
  const m: Message = { id: state.nextId, at: state.clock, from, to, text: text.trim() };
  const s: GameState = {
    ...state,
    nextId: state.nextId + 1,
    messages: [...state.messages, m],
    clock: state.phase === 'play' ? state.clock + MINUTES_PER_MESSAGE : state.clock,
  };
  return checkEnd(
    say(s, `The game-master carries a message from ${code(from)} to ${code(to)}.`, 'gameMaster'),
  );
}

export function apply(state: GameState, action: Action): Outcome {
  const ws = state.situation;
  const needCombatant = (id: CombatantId): string[] =>
    isPlaying(state, id) ? [] : [`${code(id)} is not playing`];

  switch (action.type) {
    case 'setMethod': {
      if (state.phase !== 'worldSituation')
        return refuse(state, 'Allocation is settled once the World Situation is endorsed');
      const fresh = newGame(ws, action.method);
      return done(
        say(
          { ...fresh, humanGod: state.humanGod },
          `Allocation method changed to ${ALLOCATION_METHOD_LABELS[action.method]}.`,
        ),
      );
    }

    case 'endorse': {
      if (state.phase !== 'worldSituation')
        return refuse(state, 'The World Situation is already endorsed');
      const p = needCombatant(action.by);
      if (p.length) return refuse(state, ...p);
      if (state.endorsedBy.includes(action.by))
        return refuse(state, `${code(action.by)} has already endorsed it`);
      let s: GameState = { ...state, endorsedBy: [...state.endorsedBy, action.by] };
      s = say(s, `${code(action.by)} endorses the World Situation.`);
      if (s.endorsedBy.length >= quorum(ws)) {
        s = say(
          { ...s, phase: 'trigsit' },
          'A quorum has endorsed the World Situation. The game-master proposes a TRIGSIT.',
        );
      }
      return done(s);
    }

    case 'setTrigsit': {
      if (state.phase !== 'trigsit')
        return refuse(state, 'A TRIGSIT is set after the World Situation and before the summit');
      const s = say(
        { ...state, trigsit: action.trigsit, trigsitAgreedBy: [] },
        `TRIGSIT proposed: ${action.trigsit.title}. ${action.trigsit.events.join(' ')}`,
      );
      return done(s);
    }

    case 'agreeTrigsit': {
      if (state.phase !== 'trigsit' || !state.trigsit)
        return refuse(state, 'There is no TRIGSIT to agree to');
      const p = needCombatant(action.by);
      if (p.length) return refuse(state, ...p);
      if (state.trigsitAgreedBy.includes(action.by))
        return refuse(state, `${code(action.by)} has already agreed`);
      let s: GameState = { ...state, trigsitAgreedBy: [...state.trigsitAgreedBy, action.by] };
      s = say(s, `${code(action.by)} agrees to the TRIGSIT.`);
      if (s.trigsitAgreedBy.length >= quorum(ws)) {
        const raised = (s.trigsit?.raise ?? []).filter((id) => ws.combatants.includes(id));
        const defcon = { ...s.defcon };
        for (const id of raised)
          defcon[id] = Math.min(MAXIMUM_READINESS, (defcon[id] ?? STARTING_DEFCON) + 1) as Defcon;
        s = say(
          { ...s, phase: 'summit', defcon },
          'The TRIGSIT stands. The summit opens over purified water and unfatted chips.',
        );
        if (raised.length)
          s = say(s, `As the TRIGSIT has it, ${raised.map(code).join(' and ')} go up one DEFCON.`);
      }
      return done(s);
    }

    case 'proposePact': {
      if (state.phase !== 'summit') return refuse(state, 'Pacts are made at the summit');
      const parties = [...new Set([action.by, ...action.parties])];
      const problems = parties.flatMap(needCombatant);
      if (parties.length < 2) problems.push('A pact needs at least two Combatants');
      if ((action.kind === 'hotline' || action.kind === 'cityTrade') && parties.length !== 2)
        problems.push(
          `A ${PACT_LABELS[action.kind].toLowerCase()} is between exactly two Combatants`,
        );
      if (action.kind === 'cityTrade')
        for (const id of parties) {
          const city = TARGETS.find((t) => t.id === action.cities?.[id]);
          if (!city || city.type !== 'MAMA' || city.owner !== id)
            problems.push(`${code(id)} must put up one of its own cities`);
        }
      if (problems.length) return refuse(state, ...problems);
      const pact: Pact = {
        id: state.nextId,
        kind: action.kind,
        parties,
        proposedBy: action.by,
        acceptedBy: [action.by],
        active: false,
        ...(action.cities ? { cities: action.cities } : {}),
      };
      return done(
        say(
          { ...state, nextId: state.nextId + 1, pacts: [...state.pacts, pact] },
          `${code(action.by)} proposes a ${PACT_LABELS[action.kind].toLowerCase()} with ${parties
            .filter((p) => p !== action.by)
            .map(code)
            .join(', ')}.`,
          parties,
        ),
      );
    }

    case 'acceptPact': {
      if (state.phase !== 'summit') return refuse(state, 'Pacts are made at the summit');
      const pact = state.pacts.find((p) => p.id === action.pact);
      if (!pact) return refuse(state, 'No such proposal');
      if (!pact.parties.includes(action.by))
        return refuse(state, `${code(action.by)} is not party to it`);
      if (pact.acceptedBy.includes(action.by))
        return refuse(state, `${code(action.by)} has already accepted`);
      const acceptedBy = [...pact.acceptedBy, action.by];
      const active = pact.parties.every((p) => acceptedBy.includes(p));
      let s: GameState = {
        ...state,
        pacts: state.pacts.map((p) => (p.id === pact.id ? { ...p, acceptedBy, active } : p)),
      };
      s = say(
        s,
        active
          ? `${PACT_LABELS[pact.kind]} agreed: ${pact.parties.map(code).join(', ')}. The game-master records it.`
          : `${code(action.by)} accepts the proposed ${PACT_LABELS[pact.kind].toLowerCase()}.`,
        [...pact.parties],
      );
      return done(s);
    }

    case 'closeSummit': {
      if (state.phase !== 'summit') return refuse(state, 'There is no summit in session');
      return done(
        say(
          { ...state, phase: 'play' },
          'The summit closes. Play begins: declare every order to the game-master.',
        ),
      );
    }

    case 'setDefcon': {
      if (state.phase !== 'play' && state.phase !== 'summit')
        return refuse(state, 'DEFCON moves during the summit and play');
      const p = needCombatant(action.by);
      if (p.length) return refuse(state, ...p);
      const now = state.defcon[action.by] ?? STARTING_DEFCON;
      if (action.level === now)
        return refuse(state, `${code(action.by)} is already at ${defconLabel(now)}`);
      if (state.beanie !== 'red')
        for (const g of activePacts(state, 'defconGradient'))
          if (g.parties.includes(action.by) && action.level > now + 1)
            return refuse(
              state,
              `Under its DEFCON gradient ${code(action.by)} may rise one step at a time`,
            );
      const s = say(
        { ...state, defcon: { ...state.defcon, [action.by]: action.level } },
        `${code(action.by)} ${action.level > now ? 'raises' : 'lowers'} its alert to ${defconLabel(action.level)}.`,
      );
      return done(s);
    }

    case 'launch': {
      const problems = launchProblems(state, action.order);
      const hard = problems.filter((x) => x.hard).map((x) => x.text);
      if (hard.length) return refuse(state, ...hard);
      if (state.humanGod) return toGod(state, action, problems);
      if (problems.length) {
        const texts = problems.map((x) => x.text);
        const s = say(
          {
            ...state,
            orders: [
              ...state.orders,
              {
                n: state.orders.length + 1,
                at: state.clock,
                order: action.order,
                accepted: false,
                problems: texts,
              },
            ],
          },
          `The game-master refuses ${code(action.order.combatant)}'s order: ${texts.join('; ')}.`,
          [action.order.combatant],
        );
        return { state: s, ok: false, problems: texts };
      }
      return flyLaunch(state, action.order);
    }

    case 'message': {
      const problems = messageProblems(state, action.from, action.to, action.text);
      const hard = problems.filter((x) => x.hard).map((x) => x.text);
      if (hard.length) return refuse(state, ...hard);
      if (state.humanGod) return toGod(state, action, problems);
      if (problems.length) return refuse(state, ...problems.map((x) => x.text));
      return done(sendMessage(state, action.from, action.to, action.text));
    }

    case 'beanie': {
      if (state.phase === 'ended') return refuse(state, 'The game is over');
      if (action.beanie === 'white') {
        const pair = action.between;
        if (!pair || pair[0] === pair[1])
          return refuse(state, 'The white beanie names two Combatants');
        const p = [...needCombatant(pair[0]), ...needCombatant(pair[1])];
        if (p.length) return refuse(state, ...p);
        return done(
          say(
            { ...state, beanie: 'white', cessation: [pair[0], pair[1]] },
            `White beanie: a cessation of SPASEX between ${code(pair[0])} and ${code(pair[1])} while their leaders parley. Everyone else carries on.`,
          ),
        );
      }
      if (action.beanie === 'red') {
        const defcon: Partial<Record<CombatantId, Defcon>> = {};
        for (const id of ws.combatants) defcon[id] = MAXIMUM_READINESS;
        return done(
          say(
            { ...state, beanie: 'red', cessation: undefined, defcon },
            'Red beanie: Utter Global Crisis. Every Combatant goes to Maximum Readiness; pacts and cessations no longer bind.',
          ),
        );
      }
      if (action.beanie === 'black')
        return done(
          say(
            { ...state, beanie: 'black', cessation: undefined },
            'The game-master puts on the black beanie. Nobody knows what it means, and nothing changes.',
          ),
        );
      return done(
        say(
          { ...state, beanie: 'gray', cessation: undefined },
          'The game-master is back in the everyday beanie.',
        ),
      );
    }

    case 'moveItem': {
      if (state.phase !== 'play') return refuse(state, 'Ships move only once play has started');
      const p = needCombatant(action.by);
      if (p.length) return refuse(state, ...p);
      const item = itemsOf(state).find((t) => t.id === action.item);
      if (!item) return refuse(state, 'There is no such garment on the map');
      const check = checkMove(item, action.by, item.at, action.to);
      if (!check.ok) return refuse(state, check.reason);
      const s = say(
        {
          ...state,
          positions: { ...state.positions, [item.id]: action.to },
          clock: state.clock + MINUTES_PER_ORDER,
        },
        `${code(action.by)} moves ${item.name} to ${Math.abs(action.to.lat).toFixed(1)}°${action.to.lat >= 0 ? 'N' : 'S'} ${Math.abs(action.to.lon).toFixed(1)}°${action.to.lon >= 0 ? 'E' : 'W'}.`,
      );
      return done(checkEnd(s));
    }

    case 'courtWeather': {
      if (state.phase === 'ended') return refuse(state, 'The game is over');
      if (state.courtWeather === action.precipitation) return done(state);
      const text =
        action.precipitation === 'none'
          ? 'The weather over the East Courts clears.'
          : `${action.precipitation === 'snow' ? 'Snow starts' : 'Rain starts'} falling on the East Courts. It is falling on the map, not the territory: EndStat's weather is the World Situation's, and nothing changes.`;
      return done(say({ ...state, courtWeather: action.precipitation }, text));
    }

    case 'weatherAppeal': {
      if (state.phase === 'ended') return refuse(state, 'The game is over');
      const p = needCombatant(action.by);
      if (p.length) return refuse(state, ...p);
      if (state.courtWeather === 'none')
        return refuse(state, 'There is no weather on the courts to appeal about');
      return done(
        say(
          state,
          `${code(action.by)} demands that every kill radius be recalculated for the ${state.courtWeather}. Ruling: it is ${state.courtWeather === 'snow' ? 'snowing' : 'raining'} on the map, not the territory. Nothing is recalculated.`,
        ),
      );
    }

    case 'advanceClock': {
      if (state.phase === 'ended') return refuse(state, 'The game is over');
      if (!(action.minutes > 0)) return refuse(state, 'The clock only goes forward');
      return done(checkEnd({ ...state, clock: state.clock + action.minutes }));
    }

    case 'agreeToEnd': {
      if (state.phase !== 'play')
        return refuse(state, 'Only a game in play can be ended by agreement');
      const p = needCombatant(action.by);
      if (p.length) return refuse(state, ...p);
      if (state.agreedToEnd.includes(action.by))
        return refuse(state, `${code(action.by)} has already agreed`);
      const s = say(
        { ...state, agreedToEnd: [...state.agreedToEnd, action.by] },
        `${code(action.by)} agrees to end the game.`,
      );
      return done(checkEnd(s));
    }

    case 'setHumanGod': {
      if (state.humanGod === action.on) return done(state);
      return done(
        say(
          { ...state, humanGod: action.on, pending: action.on ? state.pending : [] },
          action.on
            ? 'Human God mode: a person wears the beanie and rules on every order and message, with EndStat showing the numbers.'
            : 'The computer wears the beanie again.',
        ),
      );
    }

    case 'rule': {
      const p = state.pending.find((x) => x.id === action.pending);
      if (!p) return refuse(state, 'Nothing is waiting for that ruling');
      const rest: GameState = { ...state, pending: state.pending.filter((x) => x.id !== p.id) };
      const a = p.action;
      if (!action.allow) {
        const who = a.type === 'launch' ? a.order.combatant : a.from;
        return done(
          say(rest, `God refuses ${code(who)}'s ${a.type === 'launch' ? 'order' : 'message'}.`, [
            who,
          ]),
        );
      }
      if (a.type === 'launch') {
        const hard = launchProblems(rest, a.order).filter((x) => x.hard);
        if (hard.length) return refuse(state, ...hard.map((x) => x.text));
        return flyLaunch(rest, a.order, 'god');
      }
      const hard = messageProblems(rest, a.from, a.to, a.text).filter((x) => x.hard);
      if (hard.length) return refuse(state, ...hard.map((x) => x.text));
      return done(sendMessage(rest, a.from, a.to, a.text));
    }
  }
}

function toGod(
  state: GameState,
  action: PendingRuling['action'],
  problems: readonly Problem[],
): Outcome {
  const id = state.nextId;
  const s = say(
    {
      ...state,
      nextId: id + 1,
      pending: [...state.pending, { id, action, problems: problems.map((p) => p.text) }],
    },
    `${action.type === 'launch' ? `${code(action.order.combatant)} declares an order` : `${code(action.from)} hands over a message`}; God will rule.`,
  );
  return { state: s, ok: true, problems: [], pending: id };
}

/** Replay a game from its World Situation and action log. */
export function replay(situation: WorldSituation, actions: readonly Action[]): GameState {
  return actions.reduce((s, a) => apply(s, a).state, newGame(situation));
}

/** May this viewer read this log entry? */
export function canRead(
  audience: Audience,
  viewer: { kind: 'gameMaster' } | { kind: 'combatant'; id: CombatantId },
): boolean {
  if (viewer.kind === 'gameMaster') return true;
  if (audience === 'all') return true;
  if (audience === 'gameMaster') return false;
  return audience.includes(viewer.id);
}
