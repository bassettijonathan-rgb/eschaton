/**
 * The rulebook, in the spirit of the one Hal wrote at Pemulis's request:
 * the rules, appendices, sample EndStat decision trees, and a short essay on
 * the game theory. Written for this game in its own words. The numbers in
 * it come from the engine, so the book and the game cannot disagree.
 */
import { decisionTree } from '../engine/ai';
import { ALLOCATION_METHOD_LABELS } from '../engine/allocation';
import { COMBATANTS } from '../engine/data/combatants';
import { INTERDEPENDENCE_DAY } from '../engine/data/interdependenceDay';
import { FUSION_LAB_POINTS, MAMA_POINTS_PER_MILLION, POINTS } from '../engine/data/points';
import {
  GARMENTS,
  GARMENT_FOR_TARGET,
  MOBILE_RANGE_KM,
  TARGET_TYPE_LABELS,
} from '../engine/data/targets';
import { DEFAULT_WORLD_SITUATION } from '../engine/data/worldSituation';
import {
  CITY_DEFCON,
  LAUNCH_DEFCON,
  MINUTES_PER_MESSAGE,
  MINUTES_PER_ORDER,
  MIRV_DEFCON,
  STARTING_DEFCON,
  apply,
  defconLabel,
  newGame,
  type Action,
  type GameState,
} from '../engine/game';
import { HOWITZER_RANGE_KM } from '../engine/lob';
import {
  COMBATANT_IDS,
  GARMENT_KINDS,
  TARGET_TYPES,
  type AllocationMethod,
  type CombatantId,
} from '../engine/types';
import { el } from './dom';

export interface Rulebook {
  open(section?: string): void;
}

type Block = string | readonly string[];
interface Section {
  readonly id: string;
  readonly title: string;
  readonly body: () => readonly Block[];
}

const FIDELITY_URL = 'https://github.com/bassettijonathan-rgb/eschaton/blob/main/docs/FIDELITY.md';

function run(state: GameState, actions: readonly Action[]): GameState {
  return actions.reduce((s, a) => apply(s, a).state, state);
}

/** A game run up to the start of play, so the sample trees have something to reason about. */
function toPlay(ws = DEFAULT_WORLD_SITUATION, extra: readonly Action[] = []): GameState {
  const quorum = ws.combatants.slice(0, Math.floor(ws.combatants.length / 2) + 1);
  const trigsit = ws.trigsit ?? { id: 'sample', title: 'A quiet afternoon', events: [] };
  return run(newGame(ws), [
    ...quorum.map((by): Action => ({ type: 'endorse', by })),
    { type: 'setTrigsit', trigsit },
    ...quorum.map((by): Action => ({ type: 'agreeTrigsit', by })),
    { type: 'closeSummit' },
    ...extra,
  ]);
}

function sampleTree(title: string, state: GameState, id: CombatantId): Block[] {
  const d = decisionTree(state, id);
  return [title, d.steps.map((s, i) => `${String(i + 1)}. ${s}`)];
}

const SECTIONS: readonly Section[] = [
  {
    id: 'rules-game',
    title: '1. The game',
    body: () => [
      'Eschaton is played on four tennis courts laid side by side, Courts 6 to 9, which together are a map of the world. Dead tennis balls are 5-megaton warheads, and the only way to deliver one is to hit it with a racquet. Old shirts, towels, shorts, armbands, socks and sneakers laid on the courts are the cities, airfields, command sites, missile fields and submarines a war would be fought over.',
      'Each team plays a Combatant. One person, the game-master, wears the beanie, runs EndStat on the Yushityu laptop in the cart, carries messages and rules on every order. The courts are a map, and a map is not the territory: the players, their racquets, the buckets and the cart are not on it.',
      'On this screen, "Viewing as" says who is at the screen. Changing it goes through a hand-off screen, so a Combatant’s bucket, profile and messages are only shown to that Combatant. Any Combatant, and the game-master, can be handed to the computer.',
    ],
  },
  {
    id: 'rules-before',
    title: '2. Before the first lob',
    body: () => [
      'The World Situation. The game-master writes it: each Combatant’s economy, forces, demographics and head of state, and the weather over each court. It also sets how many warheads each Combatant gets. A quorum, more than half of the day’s Combatants, must endorse it. If so many reject it that a quorum is out of reach, the draft fails and the game-master redrafts it.',
      'Megatonnage. Each Combatant’s strategic spending as a share of its GNP decides its share of the 400 balls, scaled so that AMNAT and SOVWAR each get about 400 Mt. The game-master picks one of four methods:',
      (Object.keys(ALLOCATION_METHOD_LABELS) as AllocationMethod[]).map(
        (m) => ALLOCATION_METHOD_LABELS[m],
      ),
      'Pemulis’s shortcut takes the midpoint of a Combatant’s highest and lowest recorded ratios. It is offered because the game has always used it, and labelled because it does not follow from the theorem it leans on: the mean value exists between those two numbers, but nothing says it is their midpoint.',
      'The TRIGSIT. The Triggering Situation is the story of how the crisis started, usually drawn from precedent. It is the slowest part to agree, and a quorum must agree to it. Its events stand once agreed: DEFCONs go up, and in a scenario like Interdependence Day, garments are damaged, cities emptied and allegiances changed. None of that scores; only balls lobbed in play do.',
      'The summit. Over water and chips, Combatants make pacts, which the game-master records once every party accepts:',
      [
        'An alliance: members may not strike each other, and when one is struck its allies come up to its DEFCON.',
        'A humane-war pact: neither side may aim at the other’s cities.',
        'A hotline: the pair may send each other messages during play.',
        'A DEFCON gradient: each party raises its DEFCON one step at a time.',
        'A city trade: each side gives the other leave to strike one named city.',
      ],
      'Each team knows only its own profile and its own bucket. Everything said at the summit about resolve and readiness may be a bluff.',
    ],
  },
  {
    id: 'rules-play',
    title: '3. Play',
    body: () => [
      `DEFCON. In this game the numbers go up with alert: everyone starts at ${defconLabel(STARTING_DEFCON)}, a lob needs ${defconLabel(LAUNCH_DEFCON)}, a MIRV jockstrap ${defconLabel(MIRV_DEFCON)}, and aiming at a city ${defconLabel(CITY_DEFCON)}. Every Combatant’s DEFCON is public.`,
      `Orders. A Combatant declares an order to the game-master: which launch platform, how many warheads, and the aim point. The game-master checks it against the DEFCON, the pacts and any cessation, then the launchman swings. Each order takes ${String(MINUTES_PER_ORDER)} game minutes and each message ${String(MINUTES_PER_MESSAGE)}.`,
      'The lob. Pick a platform, aim on the map, set elevation, topspin and racquet pace, and swing against the timing meter (the Swing button, or the space bar while the meter runs). The ball flies like a real tennis ball, with drag and the Magnus effect, and goes off where it first touches the court. Several warheads in a jockstrap tumble up together and open at the top of the arc.',
      `Where you lob from. Missile fields and silos, bomber squadrons and submarines are launch platforms. The insurgent cell’s howitzer reaches only ${String(HOWITZER_RANGE_KM)} km. Submarines may move up to ${String(MOBILE_RANGE_KM.submarine ?? 0)} km a move and carrier groups ${String(MOBILE_RANGE_KM['carrier-group'] ?? 0)} km, at sea, by their owners. Nothing else on the map ever moves.`,
      'Messages. They go through the game-master, between hotline partners or a pair under the white beanie. EMP from detonations shortens how many words get through.',
      'The beanies. Gray is the everyday beanie. White declares a cessation between two named Combatants while their leaders talk; everyone else carries on. Red declares Utter Global Crisis: everyone goes to maximum readiness and no pact binds. There is also a black beanie. The book never says what it means, so here it means nothing.',
      'Human God. If a person, not the computer, is to be God, every order and message goes to them with what EndStat would object to, and they rule. God may wave through the game-master’s rules (DEFCON, pacts, cessations) but not the physical ones: a destroyed platform, an empty bucket, an overfull jockstrap.',
    ],
  },
  {
    id: 'rules-endstat',
    title: '4. EndStat',
    body: () => [
      'A warhead inside a garment is a direct hit. Outside it but within the kill radius is an indirect hit, which does less the further out it lands. The radius starts at 10.1 km for open, flat ground and shrinks with coast, hills, mountains, skyscrapers and the World Situation’s rain or snow over that court.',
      `Cities lose people to blast and heat, and close strikes can start a firestorm. Ground bursts lay fallout downwind, and detonations cost communication capacity. A city scores ${String(MAMA_POINTS_PER_MILLION)} points per million dead and a quarter of that per million injured. Other targets are worth fixed points:`,
      TARGET_TYPES.filter((t) => t !== 'MAMA').map(
        (t) =>
          `${TARGET_TYPE_LABELS[t]}: ${String(t === 'fusion-lab' ? FUSION_LAB_POINTS : POINTS[t])} points`,
      ),
      'INDDIR is what a Combatant inflicts on the others; SUFDDIR is what it suffers. Four corrections adjust them for arsenal size, population density, the spread of land, sea and air forces, and civil defence. The score is INDDIR divided by SUFDDIR.',
      'SACPOP, a strike against a city of another playing Combatant, costs the striker a point of SUFDDIR for every point it scores on cities. An exchange of cities leaves both sides below a ratio of one.',
      'Striking a nation nobody plays scores nothing for anyone, and the strike is logged as a regrettable mistargeting.',
      'The Yushityu shows EndStat’s working, the tallies (a Combatant sees only its own), the Decision Tree’s suggestion and an "Appeal to Pemulis" button that opens the full audit trail.',
    ],
  },
  {
    id: 'rules-axiom',
    title: '5. The map is not the territory',
    body: () => [
      'You can launch only against the territory. A ball that strikes a player, a racquet, a bucket or the cart stops there, is logged off the map and scores nothing. No player is a target, because EndStat has no INDDIR or SUFDDIR for anybody real. A parley under the white beanie makes nobody a target either.',
      'Real weather on the courts is drawn but never counted. If it snows, it is snowing on the map, not the territory.',
    ],
  },
  {
    id: 'rules-end',
    title: '6. The end',
    body: () => [
      'The game ends when every bucket is empty, when only one Combatant is still in contention, when all those still in contention agree to stop, or when the clock reaches the siren. A Combatant is out of contention when it has no balls, no launch platform, or has gone SACPOP and fallen below a ratio of one.',
      'EndStat then confirms the winner: the best ratio among Combatants that inflicted something. "Confirm a winner" shows the crunch line by line. Tick "Authentic three hours" to wait as long as the original machine did.',
    ],
  },
  {
    id: 'appendix-garments',
    title: 'Appendix A. Garments',
    body: () => [
      'What each garment stands for. One reading differs from the novel and says so: the strategic command sites are gray shorts with red trim, so they can be told from the CONFORCONs.',
      GARMENT_KINDS.map((kind) => {
        const g = GARMENTS[kind];
        const types = TARGET_TYPES.filter((t) => GARMENT_FOR_TARGET[t] === kind).map(
          (t) => TARGET_TYPE_LABELS[t],
        );
        return `${g.label}: ${types.join('; ')}`;
      }),
    ],
  },
  {
    id: 'appendix-combatants',
    title: 'Appendix B. Combatants',
    body: () => [
      'The Combatants, and the most warheads each can pack in one jockstrap.',
      COMBATANT_IDS.map((id) => {
        const c = COMBATANTS[id];
        return `${c.code}: ${c.name}. Up to ${String(c.mirvCap)} per jockstrap. Head of state: ${c.headOfState.title}.`;
      }),
    ],
  },
  {
    id: 'appendix-trees',
    title: 'Appendix C. Sample decision trees',
    body: () => [
      'EndStat’s Decision Tree reads only what a player at the courts could know: the head of state’s profile, its own bucket, public budgets, DEFCONs, the strike log and its own pacts. It never looks in another bucket. These are run live by the game’s own engine.',
      ...sampleTree(
        'AMNAT at the start of a quiet game: nobody has struck it, and its head of state lacks the nerve to go first.',
        toPlay(),
        'AMNAT',
      ),
      ...sampleTree(
        'LIBSYR in the same game: resolve times risk tolerance is high enough to strike first, at military targets, at its rival.',
        toPlay(),
        'LIBSYR',
      ),
      ...sampleTree(
        'SOVWAR under the red beanie: Utter Global Crisis, and its profile is ready to go after cities.',
        toPlay(DEFAULT_WORLD_SITUATION, [{ type: 'beanie', beanie: 'red' }]),
        'SOVWAR',
      ),
      ...sampleTree(
        'AMNAT on Interdependence Day, after the TRIGSIT: the minesweeper counts as a strike, and the tree posits a SPASEX response.',
        toPlay(INTERDEPENDENCE_DAY),
        'AMNAT',
      ),
    ],
  },
  {
    id: 'appendix-readings',
    title: 'Appendix D. Readings of the novel',
    body: () => [
      'The novel leaves a great deal open: point values, how a sock maps to a target, what the black beanie means, what happens when it snows. Every reading this game makes is written down, with its reason, in the fidelity notes:',
      [FIDELITY_URL],
    ],
  },
  {
    id: 'essay',
    title: 'An essay on the game theory, briefly',
    body: () => [
      'Eschaton is a game about threats, and a threat is only worth what the other side believes about it. A Combatant that would never fire still wants its rivals to think it might. That is why the summit matters more than the lobbing. Pemulis’s teams won most of their games before the first ball landed, because the outcome had been fixed by what everyone believed everyone else would do.',
      'Deterrence works when striking first is worse than waiting. EndStat builds that in: SACPOP costs the striker a point of its own for every point it inflicts on cities, so a city-for-city exchange leaves both sides worse off. The rational move is a limited exchange at military targets, a SPASEX. The danger is that a limited exchange is still an exchange, and every side has a reason to escalate just before the other does.',
      'Pacts are promises, and a promise is cheap until breaking it costs something. A humane-war pact binds only as long as both sides fear what the other would do if it broke. That is why the Decision Tree looks at a head of state’s pact fidelity before it decides whether to keep one. A promise from someone who keeps promises changes what everyone else should do. A promise from someone who doesn’t changes nothing.',
      'Bluffing is the summit’s currency. Each team knows only its own bucket, so a claim of strength costs nothing to make and cannot be checked. Good players discount such claims, and the best players know that their own claims are being discounted too. In equilibrium most of the talk carries little information, and the little it does carry is what moves the game.',
      'None of this needs any mathematics beyond the counting EndStat already does. It does need the axiom that makes the game possible at all: the players are not on the map. Once someone forgets that, it is no longer a game.',
    ],
  },
];

function blockNode(b: Block): HTMLElement {
  if (typeof b === 'string') return el('p', {}, [b]);
  return el(
    'ul',
    {},
    b.map((line) =>
      el('li', {}, [
        line.startsWith('https://')
          ? el('a', { href: line, target: '_blank', rel: 'noopener' }, [line])
          : line,
      ]),
    ),
  );
}

export function mountRulebook(host: HTMLElement): Rulebook {
  const title = el('h2', { id: 'rulebook-title' }, ['Eschaton: the rules, with appendices']);
  const close = el('button', { type: 'button', className: 'close', id: 'rulebook-close' }, [
    'Close',
  ]);
  const contents = el(
    'ol',
    { className: 'rulebook-contents' },
    SECTIONS.map((s) => el('li', {}, [el('a', { href: `#${s.id}` }, [s.title])])),
  );
  const article = el('div', { className: 'rulebook-body' });
  const dialog = el('dialog', { className: 'rulebook', id: 'rulebook' }, [
    el('div', { className: 'rulebook-head' }, [title, close]),
    el('nav', { ariaLabel: 'Contents' }, [contents]),
    article,
  ]);
  dialog.setAttribute('aria-labelledby', 'rulebook-title');
  host.append(dialog);

  let written = false;
  const write = (): void => {
    if (written) return;
    written = true;
    article.replaceChildren(
      ...SECTIONS.map((s) =>
        el('section', { id: s.id }, [
          el('h3', { tabIndex: -1 }, [s.title]),
          ...s.body().map(blockNode),
        ]),
      ),
    );
  };
  contents.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a) return;
    e.preventDefault();
    const target = article.querySelector<HTMLElement>(`${a.getAttribute('href') ?? ''} h3`);
    target?.scrollIntoView({ block: 'start' });
    target?.focus();
  });
  close.addEventListener('click', () => {
    dialog.close();
  });

  return {
    open(section) {
      write();
      if (!dialog.open) dialog.showModal();
      const target = section ? article.querySelector<HTMLElement>(`#${section} h3`) : title;
      target?.scrollIntoView({ block: 'start' });
      if (section) target?.focus();
      else close.focus();
    },
  };
}
