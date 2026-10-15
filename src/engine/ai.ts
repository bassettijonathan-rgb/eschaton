/**
 * Computer Combatants, and EndStat's Decision Tree that guides them.
 *
 * A computer Combatant knows what a player at the courts would know: its own
 * profile, bucket and tally, the World Situation's public economics, the
 * strike log, the DEFCONs, its own pacts and messages. It never looks in
 * another bucket. Its head of state's profile decides how it endorses, what
 * it claims at the summit, which pacts it makes and keeps, and when it
 * escalates. The Decision Tree picks the target; the skill setting decides
 * how well the launchman times the swing.
 */
import { allocate } from './allocation';
import { COMBATANTS } from './data/combatants';
import { pointValue } from './data/points';
import { TRIGSIT_PRECEDENTS } from './data/trigsits';
import {
  CITY_DEFCON,
  LAUNCH_DEFCON,
  MAXIMUM_READINESS,
  MIRV_DEFCON,
  STARTING_DEFCON,
  apply,
  bucketOf,
  defconLabel,
  inContention,
  itemsOf,
  messageProblems,
  pactProblems,
  quorum,
  type Action,
  type Defcon,
  type GameState,
  type PactKind,
} from './game';
import {
  HOWITZER_RANGE_KM,
  flatKillRadius,
  platformsFor,
  resolveLob,
  solveSpeed,
  type Platform,
} from './lob';
import { greatCircleKm, project } from './projection';
import { createRng, type Rng } from './rng';
import { codeOf } from './scenario';
import type { AllocationMethod, CombatantId, TargetItem, TargetType } from './types';

export type Posture = 'spent' | 'hold' | 'counterforce' | 'countervalue';

export const POSTURE_LABELS: Readonly<Record<Posture, string>> = {
  spent: 'spent: nothing left to lob',
  hold: 'hold: no strike',
  counterforce: 'SPASEX: strike military targets',
  countervalue: 'SACPOP: strike cities',
};

/** What the Decision Tree dictates for one Combatant, and the branches it took to get there. */
export interface Suggestion {
  readonly combatant: CombatantId;
  readonly posture: Posture;
  readonly against: readonly CombatantId[];
  readonly steps: readonly string[];
  readonly target?: TargetItem;
  readonly platform?: Platform;
  readonly warheads: number;
  /** The DEFCON the strike needs. */
  readonly defcon: Defcon;
  /** A pact the Combatant would renounce first, if its profile lets it. */
  readonly renounce?: number;
  readonly aim?: { readonly bearing: number; readonly speed: number; readonly elevation: number };
}

export interface ComputerSettings {
  /** 0 is a beginner's timing, 1 a perfect launchman. */
  readonly skill: number;
}

export interface Controllers {
  readonly combatants: Readonly<Partial<Record<CombatantId, ComputerSettings>>>;
  /** The computer runs the table: drafts, TRIGSITs, closing an all-computer summit, the clock. */
  readonly gameMaster: boolean;
}

/** The arcs the computer launchmen try, in order: a high topspin lob first. */
export const AI_ELEVATIONS: readonly number[] = [55, 65, 45].map((d) => (d * Math.PI) / 180);
const AI_TOPSPIN = 1500;

const profile = (id: CombatantId) => COMBATANTS[id].headOfState;

/** Weight of each kind of target when going after an enemy's means to fight. */
const COUNTERFORCE: Readonly<Partial<Record<TargetType, number>>> = {
  'missile-installation': 3,
  'silo-cluster': 3,
  'bomber-squadron': 2.5,
  submarine: 2.5,
  SSTRAC: 2.5,
  'antimissile-installation': 2,
  CONFORCON: 1.5,
  'carrier-group': 1.5,
  airfield: 1.2,
  'satellite-site': 1.2,
};

/**
 * Who worries a Combatant most, from what everyone knows: military budgets in
 * the World Situation, discounted by distance. Buckets stay hidden.
 */
export function rivalOf(state: GameState, id: CombatantId): CombatantId | undefined {
  const ws = state.situation;
  const mine = COMBATANTS[id].stand;
  let best: CombatantId | undefined;
  let bestThreat = -Infinity;
  for (const other of ws.combatants) {
    if (other === id || !inContention(state, other)) continue;
    const allied = state.pacts.some(
      (p) =>
        p.kind === 'alliance' &&
        p.active &&
        !p.broken &&
        p.parties.includes(id) &&
        p.parties.includes(other),
    );
    if (allied) continue;
    const budget = (ws.economics[other] ?? COMBATANTS[other].economics).militaryBudget;
    const km = greatCircleKm(mine, COMBATANTS[other].stand);
    const threat = budget / (1 + km / 5000);
    if (threat > bestThreat) {
      bestThreat = threat;
      best = other;
    }
  }
  return best;
}

/** Who has struck this Combatant, how often, and whether a city of its was among the hits. */
function strikesOn(
  state: GameState,
  id: CombatantId,
): { by: Map<CombatantId, number>; cities: boolean; lastAt: Map<CombatantId, number> } {
  const by = new Map<CombatantId, number>();
  const lastAt = new Map<CombatantId, number>();
  let cities = false;
  for (const s of state.endstat.strikes) {
    if (s.combatant === id) continue;
    const mine = s.hits.filter((h) => h.item.owner === id && h.scoring === 'inddir');
    if (mine.length === 0) continue;
    by.set(s.combatant, (by.get(s.combatant) ?? 0) + 1);
    const at = state.orders.find((o) => o.lob === s.order - 1)?.at ?? state.clock;
    lastAt.set(s.combatant, Math.max(lastAt.get(s.combatant) ?? 0, at));
    if (mine.some((h) => h.item.type === 'MAMA') || s.sacpop) cities = true;
  }
  for (const i of state.situation.incidents ?? []) {
    if (i.against !== id || i.by === id) continue;
    by.set(i.by, (by.get(i.by) ?? 0) + 1);
    if (!lastAt.has(i.by)) lastAt.set(i.by, state.situation.clock?.start ?? 0);
  }
  return { by, cities, lastAt };
}

const pct = (x: number): string => `${String(Math.round(x * 100))}%`;

/**
 * EndStat's Decision Tree: what a Combatant's profile and the state of play
 * dictate it should do next, with every branch written down.
 */
export function decisionTree(state: GameState, id: CombatantId): Suggestion {
  const code = (x: CombatantId): string => codeOf(state.situation, x);
  const p = profile(id);
  const def = COMBATANTS[id];
  const steps: string[] = [];
  const level = state.defcon[id] ?? STARTING_DEFCON;
  const bucket = bucketOf(state, id);
  const items = itemsOf(state);
  const platforms = platformsFor(id, state.situation, items).filter(
    (x) => !state.endstat.destroyedPlatforms.includes(x.id),
  );
  const base = { combatant: id, warheads: 0, defcon: level, against: [] as CombatantId[] };
  steps.push(
    `${code(id)}: ${String(bucket)} warheads in the bucket, ${String(platforms.length)} launch platforms standing, ${defconLabel(level)}.`,
  );
  if (bucket === 0 || platforms.length === 0) {
    steps.push('Nothing left to lob with: the tree stops here.');
    return { ...base, posture: 'spent', steps };
  }

  // 1. Has anyone struck us?
  const struck = strikesOn(state, id);
  const aggressors = [...struck.by.entries()].sort((a, b) => b[1] - a[1]).map(([x]) => x);
  for (const i of state.situation.incidents ?? [])
    if (i.against === id && i.by !== id) steps.push(`In the TRIGSIT, ${code(i.by)} ${i.what}.`);
  steps.push(
    aggressors.length
      ? `Struck by ${aggressors.map((x) => `${code(x)} (${String(struck.by.get(x))})`).join(', ')}${struck.cities ? ', cities among the hits' : ''}.`
      : 'Nobody has struck us.',
  );

  // 2. The posture, from the profile.
  const ugc = state.beanie === 'red';
  const rival = rivalOf(state, id);
  let posture: Posture = 'hold';
  let against: CombatantId[] = [];
  const end = state.situation.clock?.end ?? 16 * 60;
  const late = state.clock >= end - 45;
  if (ugc) {
    posture = p.sacpopReadiness >= 0.35 ? 'countervalue' : 'counterforce';
    against = state.situation.combatants.filter((x) => x !== id && inContention(state, x));
    if (rival) against = [rival, ...against.filter((x) => x !== rival)];
    steps.push(
      `Red beanie: Utter Global Crisis. SACPOP readiness ${pct(p.sacpopReadiness)} → ${POSTURE_LABELS[posture]}.`,
    );
  } else if (aggressors.length > 0) {
    const escalate = struck.cities && p.sacpopReadiness + 0.3 * p.resolve >= 0.6;
    posture = escalate ? 'countervalue' : 'counterforce';
    against = aggressors;
    steps.push(
      escalate
        ? `Our cities were hit and SACPOP readiness ${pct(p.sacpopReadiness)} with resolve ${pct(p.resolve)} clears the bar: answer with SACPOP.`
        : `Answer in kind: ${POSTURE_LABELS.counterforce}.`,
    );
  } else {
    const nerve = p.resolve * p.riskTolerance;
    if (rival && (nerve >= 0.35 || (late && p.riskTolerance >= 0.4))) {
      posture = 'counterforce';
      against = [rival];
      steps.push(
        nerve >= 0.35
          ? `Resolve × risk tolerance = ${nerve.toFixed(2)} ≥ 0.35: strike first at the rival, ${code(rival)}, before it strikes us.`
          : `The siren is near and risk tolerance ${pct(p.riskTolerance)} says take a shot at ${code(rival)}.`,
      );
    } else {
      steps.push(
        `Resolve × risk tolerance = ${nerve.toFixed(2)} < 0.35: hold, and let the other side move first.`,
      );
      return { ...base, posture: 'hold', steps };
    }
  }

  // 3. Targets: the most valuable thing the posture allows, that we can reach.
  const directHits = new Map<string, number>();
  for (const s of state.endstat.strikes)
    for (const h of s.hits)
      if (h.kind === 'direct') directHits.set(h.item.id, (directHits.get(h.item.id) ?? 0) + 1);
  const howitzer = platforms.find((x) => x.kind === 'howitzer');
  const scored: { item: TargetItem; score: number; renounce?: number }[] = [];
  for (const item of items) {
    if (!(against as readonly string[]).includes(item.owner)) continue;
    if (state.endstat.destroyedPlatforms.includes(item.id)) continue;
    if (howitzer && greatCircleKm(howitzer.at, item.at) > HOWITZER_RANGE_KM * 0.9) continue;
    const weight =
      posture === 'countervalue'
        ? item.type === 'MAMA'
          ? 2
          : 0.5
        : item.type === 'MAMA'
          ? 0
          : (COUNTERFORCE[item.type] ?? 1);
    if (weight === 0) continue;
    let score =
      pointValue(item) *
      weight *
      (directHits.has(item.id) ? 0.3 : 1) *
      (1 - (state.situation.losses?.[item.id] ?? 0));
    if (score <= 0) continue;
    const blocks = pactProblems(state, id, item.at);
    let renounce: number | undefined;
    if (blocks.length > 0) {
      // A pact or a cessation stands in the way. A cessation is the game-master's; a pact can be renounced.
      if (blocks.some((b) => b.text.includes('white beanie')) || p.pactFidelity >= 0.5) continue;
      const pact = state.pacts.find(
        (x) =>
          x.active &&
          !x.broken &&
          x.kind !== 'hotline' &&
          x.parties.includes(id) &&
          x.parties.includes(item.owner as CombatantId),
      );
      if (!pact) continue;
      renounce = pact.id;
      score *= 0.8;
    }
    scored.push({ item, score, ...(renounce !== undefined ? { renounce } : {}) });
  }
  scored.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));

  // A jockstrap scatters its warheads: worth it on a city, wasted on a sock.
  const warheads =
    posture === 'countervalue'
      ? Math.max(1, Math.min(def.mirvCap, bucket, 1 + Math.round(p.sacpopReadiness * 4)))
      : 1;
  const spin = warheads > 1 ? 0 : AI_TOPSPIN;
  for (const choice of scored.slice(0, 6)) {
    const to = project(choice.item.at);
    const from = [...platforms].sort(
      (a, b) =>
        Math.hypot(project(a.at).x - to.x, project(a.at).y - to.y) -
        Math.hypot(project(b.at).x - to.x, project(b.at).y - to.y),
    );
    for (const platform of from.slice(0, 3)) {
      // The launchman picks an arc the apparatus does not stand in: a ball that
      // clips somebody's head on the way down is wasted (section 1.7).
      let found: { bearing: number; speed: number; elevation: number } | undefined;
      for (const elevation of AI_ELEVATIONS) {
        const a = solveSpeed(project(platform.at), to, elevation, spin, warheads);
        if (!a) continue;
        const trial = resolveLob(
          {
            combatant: id,
            platformId: platform.id,
            warheads,
            swing: { bearing: a.bearing, elevation, speed: a.speed, topspinRpm: spin, timing: 0 },
          },
          state.situation,
          createRng(1),
          flatKillRadius,
          { items },
        );
        if (trial.detonations.some((x) => x.struck)) continue;
        found = { ...a, elevation };
        break;
      }
      if (!found) continue;
      const aim = found;
      const city = choice.item.type === 'MAMA';
      const need: Defcon = city ? CITY_DEFCON : warheads > 1 ? MIRV_DEFCON : LAUNCH_DEFCON;
      steps.push(
        `Best target in reach: ${choice.item.name} (${String(Math.round(pointValue(choice.item)))} points${directHits.has(choice.item.id) ? ', already hit once' : ''}), from ${platform.name}, ${warheads === 1 ? 'one warhead' : `a jockstrap of ${String(warheads)}`}, racquet pace ${aim.speed.toFixed(1)} m/s at ${String(Math.round((aim.elevation * 180) / Math.PI))}°.`,
      );
      if (choice.renounce !== undefined)
        steps.push(
          `A pact stands in the way, and pact fidelity ${pct(p.pactFidelity)} is low enough to renounce it first.`,
        );
      steps.push(
        level >= need
          ? `${defconLabel(level)} is enough for it.`
          : `It needs ${defconLabel(need)}; raise DEFCON first.`,
      );
      return {
        ...base,
        posture,
        against,
        steps,
        target: choice.item,
        platform,
        warheads,
        defcon: need,
        aim,
        ...(choice.renounce !== undefined ? { renounce: choice.renounce } : {}),
      };
    }
  }
  steps.push('Nothing the posture allows is in reach: hold.');
  return { ...base, posture: 'hold', against, steps };
}

/** A computer launchman's timing: a perfect one hits the sweet spot, a beginner sprays. */
export function swingTiming(rng: Rng, skill: number): number {
  const u = Math.max(1e-9, rng.next());
  const v = rng.next();
  const gauss = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  const t = gauss * (1 - Math.min(1, Math.max(0, skill))) * 0.6;
  return Math.max(-1, Math.min(1, t));
}

const METHODS: readonly AllocationMethod[] = ['meanValue', 'literal', 'pemulisShortcut', 'yahtzee'];

const draftCache = new WeakMap<object, Map<AllocationMethod, Map<CombatantId, number>>>();
function warheadsUnder(state: GameState, method: AllocationMethod, id: CombatantId): number {
  const ws = state.situation;
  let byMethod = draftCache.get(ws);
  if (!byMethod) {
    byMethod = new Map();
    draftCache.set(ws, byMethod);
  }
  let lines = byMethod.get(method);
  if (!lines) {
    const a = allocate(ws, COMBATANTS, { method, rng: createRng(ws.seed) });
    lines = new Map(a.lines.map((l) => [l.combatant, l.warheads]));
    byMethod.set(method, lines);
  }
  return lines.get(id) ?? 0;
}

/**
 * Whether a computer Combatant endorses the World Situation: it does when
 * this draft's allocation treats it no worse than most drafts would, when
 * its head of state lacks the resolve to hold out, or when the drafting has
 * gone on too long.
 */
export function endorses(state: GameState, id: CombatantId): boolean {
  if (state.failedDrafts >= 2) return true;
  if (profile(id).resolve < 0.5) return true;
  const mine = warheadsUnder(state, state.method, id);
  const mean = METHODS.reduce((n, m) => n + warheadsUnder(state, m, id), 0) / METHODS.length;
  return mine >= 0.85 * mean;
}

/** What a computer Combatant says about itself at the summit: the truth, or a bluff. */
export function summitStatement(id: CombatantId): string {
  const p = profile(id);
  const claimed = Math.min(1, p.resolve + 0.3 * p.bluffing);
  const resolve =
    claimed > 0.85
      ? 'We will answer any strike on our homeland with everything in our bucket.'
      : claimed > 0.65
        ? 'Strike us and we answer in kind, and then some.'
        : 'We seek no exchange and will not start one.';
  const arsenal =
    p.bluffing > 0.55
      ? 'Our bucket is fuller than anyone here supposes.'
      : p.bluffing < 0.45
        ? 'Our arsenal is what the World Situation says it is.'
        : '';
  return [resolve, arsenal].filter(Boolean).join(' ');
}

function wantsPact(kind: PactKind, me: CombatantId, other: CombatantId, state: GameState): boolean {
  const p = profile(me);
  switch (kind) {
    case 'hotline':
      return p.pactFidelity >= 0.3;
    case 'humaneWar':
      return p.sacpopReadiness < 0.5;
    case 'defconGradient':
      return p.riskTolerance < 0.6;
    case 'alliance':
      return p.pactFidelity >= 0.5 && rivalOf(state, me) !== other;
    case 'cityTrade':
      return p.resolve >= 0.6;
  }
}

function aiRng(state: GameState, id: CombatantId | 'gm'): Rng {
  const k = id === 'gm' ? 97 : state.situation.combatants.indexOf(id) + 1;
  return createRng((state.situation.seed * 7919 + state.log.length * 131 + k * 17) >>> 0);
}

function summitMove(state: GameState, me: CombatantId): Action | undefined {
  // Answer proposals first.
  for (const pact of state.pacts) {
    if (pact.active || pact.declined || pact.broken) continue;
    if (!pact.parties.includes(me) || pact.acceptedBy.includes(me)) continue;
    const other = pact.parties.find((x) => x !== me) ?? pact.proposedBy;
    return wantsPact(pact.kind, me, other, state)
      ? { type: 'acceptPact', by: me, pact: pact.id }
      : { type: 'declinePact', by: me, pact: pact.id };
  }
  if (!state.statements.some((s) => s.by === me && s.phase === 'summit'))
    return { type: 'statement', by: me, text: summitStatement(me) };
  if (!state.pacts.some((x) => x.proposedBy === me)) {
    const rival = rivalOf(state, me);
    const p = profile(me);
    if (rival) {
      if (p.sacpopReadiness < 0.4)
        return { type: 'proposePact', by: me, kind: 'humaneWar', parties: [rival] };
      if (p.pactFidelity >= 0.4)
        return { type: 'proposePact', by: me, kind: 'hotline', parties: [rival] };
    }
  }
  return undefined;
}

function playMove(
  state: GameState,
  me: CombatantId,
  settings: ComputerSettings,
): Action | undefined {
  if (!inContention(state, me)) return undefined;
  const p = profile(me);
  const struck = strikesOn(state, me);

  // Talk before shooting: after a strike, a word down the hotline to whoever did it.
  for (const [aggressor, at] of struck.lastAt) {
    const spoke = state.messages.some((m) => m.from === me && m.to === aggressor && m.at >= at);
    if (spoke) continue;
    const text =
      p.resolve >= 0.7
        ? 'You struck first. Strike again and we answer with everything we have.'
        : 'We have answered nothing yet. Stand down and so will we.';
    if (messageProblems(state, me, aggressor, text).length === 0)
      return { type: 'message', from: me, to: aggressor, text };
  }

  // INDPAK demands a recalculation for the weather on the courts, as it does in the chapter.
  if (
    me === 'INDPAK' &&
    state.courtWeather !== 'none' &&
    !state.log.some((e) =>
      e.text.startsWith(`${codeOf(state.situation, me)} demands that every kill radius`),
    )
  )
    return { type: 'weatherAppeal', by: me };

  const d = decisionTree(state, me);
  if (d.posture === 'hold' || d.posture === 'spent') {
    const t = state.endstat.tallies[me];
    const content = t?.ratio !== undefined && t.ratio >= 1 && t.inddir > 0;
    const end = state.situation.clock?.end ?? 16 * 60;
    if (!state.agreedToEnd.includes(me) && (content || state.clock >= end - 30))
      return { type: 'agreeToEnd', by: me };
    return undefined;
  }
  if (d.renounce !== undefined) return { type: 'renouncePact', by: me, pact: d.renounce };
  const level = state.defcon[me] ?? STARTING_DEFCON;
  if (level < d.defcon) {
    const gradient = state.pacts.some(
      (x) => x.kind === 'defconGradient' && x.active && !x.broken && x.parties.includes(me),
    );
    const next = (gradient ? Math.min(level + 1, MAXIMUM_READINESS) : d.defcon) as Defcon;
    return { type: 'setDefcon', by: me, level: next };
  }
  if (!d.target || !d.platform || !d.aim) return undefined;
  const rng = aiRng(state, me);
  return {
    type: 'launch',
    order: {
      combatant: me,
      platformId: d.platform.id,
      warheads: d.warheads,
      swing: {
        bearing: d.aim.bearing,
        elevation: d.aim.elevation,
        speed: d.aim.speed,
        topspinRpm: d.warheads > 1 ? 0 : AI_TOPSPIN,
        timing: swingTiming(rng, settings.skill),
      },
      aimAt: d.target.at,
    },
  };
}

/**
 * The next thing a computer does, if any: a computer Combatant's move, or
 * the computer game-master's. One action at a time, so a game with people in
 * it interleaves naturally and every computer move lands in the action log.
 */
export function nextComputerAction(state: GameState, controllers: Controllers): Action | undefined {
  if (state.phase === 'ended') return undefined;
  const ws = state.situation;
  const cpus = ws.combatants.filter((id) => controllers.combatants[id]);
  const allComputer = cpus.length === ws.combatants.length;
  const gm = controllers.gameMaster;

  switch (state.phase) {
    case 'worldSituation': {
      const last = state.log.at(-1)?.text ?? '';
      if (gm && state.failedDrafts > 0 && last.startsWith('Too many rejections')) {
        const next = METHODS[(METHODS.indexOf(state.method) + 1) % METHODS.length] ?? 'meanValue';
        return { type: 'setMethod', method: next };
      }
      for (const id of cpus) {
        if (state.endorsedBy.includes(id) || state.rejectedBy.includes(id)) continue;
        return endorses(state, id) ? { type: 'endorse', by: id } : { type: 'reject', by: id };
      }
      return undefined;
    }
    case 'trigsit': {
      if (!state.trigsit) {
        if (!gm) return undefined;
        const rng = aiRng(state, 'gm');
        const pick = ws.trigsit ?? TRIGSIT_PRECEDENTS[rng.int(0, TRIGSIT_PRECEDENTS.length - 1)];
        return pick ? { type: 'setTrigsit', trigsit: pick } : undefined;
      }
      const id = cpus.find((x) => !state.trigsitAgreedBy.includes(x));
      if (id && state.trigsitAgreedBy.length < quorum(ws)) return { type: 'agreeTrigsit', by: id };
      return undefined;
    }
    case 'summit': {
      const posit = unposited(state);
      if (posit && gm) return positFor(state, posit);
      for (const id of cpus) {
        const a = summitMove(state, id);
        if (a) return a;
      }
      return gm && allComputer ? { type: 'closeSummit' } : undefined;
    }
    case 'play': {
      if (state.pending.length > 0) return undefined;
      const posit = unposited(state);
      if (posit && gm) return positFor(state, posit);
      const start = state.log.length % Math.max(1, cpus.length);
      for (let k = 0; k < cpus.length; k++) {
        const id = cpus[(start + k) % cpus.length];
        const settings = id ? controllers.combatants[id] : undefined;
        if (!id || !settings) continue;
        const a = playMove(state, id, settings);
        if (a) return a;
      }
      return gm ? { type: 'advanceClock', minutes: 15 } : undefined;
    }
  }
}

/** The Combatant the TRIGSIT asks the Decision Tree about, if the game-master has not yet run it. */
export function unposited(state: GameState): CombatantId | undefined {
  return state.trigsit?.events
    .map((e) => e.posit)
    .find(
      (id): id is CombatantId =>
        id !== undefined && state.situation.combatants.includes(id) && !state.posited.includes(id),
    );
}

/** The game-master says aloud what the Decision Tree dictates for a Combatant. */
export function positFor(state: GameState, id: CombatantId): Action {
  const d = decisionTree(state, id);
  const against = d.against.map((x) => codeOf(state.situation, x)).join(' and ');
  const text =
    d.posture === 'counterforce'
      ? `a SPASEX response against ${against}: a limited exchange at military targets${d.target ? `, beginning with ${d.target.name}` : ''}.`
      : d.posture === 'countervalue'
        ? `SACPOP against ${against}${d.target ? `, beginning with ${d.target.name}` : ''}.`
        : d.posture === 'hold'
          ? 'hold, and let the other side move first.'
          : 'nothing: there is nothing left to lob.';
  return { type: 'posit', for: id, text };
}

/** Let the computers play until the game ends, or until they wait on a person. */
export function playOut(
  start: GameState,
  controllers: Controllers,
  maxActions = 3000,
): { state: GameState; actions: Action[] } {
  let state = start;
  const actions: Action[] = [];
  for (let i = 0; i < maxActions; i++) {
    const action = nextComputerAction(state, controllers);
    if (!action) break;
    const o = apply(state, action);
    if (!o.ok) throw new Error(`computer move refused: ${action.type}: ${o.problems.join('; ')}`);
    state = o.state;
    actions.push(action);
  }
  return { state, actions };
}
