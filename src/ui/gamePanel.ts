/**
 * The game-master's clipboard: the game's phase, clock, beanie and DEFCONs,
 * and whatever the person at the screen can do next. The World Situation
 * and TRIGSIT need a quorum; the summit records pacts; in play a Combatant
 * sets its DEFCON, uses the hotline and can agree to end, while the
 * game-master changes beanies, runs the clock and, as Human God, rules.
 */
import { COMBATANTS } from '../engine/data/combatants';
import { MOBILE_RANGE_KM, TARGETS } from '../engine/data/targets';
import { TRIGSIT_PRECEDENTS } from '../engine/data/trigsits';
import {
  MAXIMUM_READINESS,
  PACT_LABELS,
  STARTING_DEFCON,
  canRead,
  clockLabel,
  itemsOf,
  defconLabel,
  quorum,
  type Action,
  type Beanie,
  type Defcon,
  type GameState,
  type Pact,
  type PactKind,
  type PendingRuling,
} from '../engine/game';
import { platformsFor } from '../engine/lob';
import type { CombatantId, LonLat, Precipitation } from '../engine/types';
import { el } from './dom';
import { dispatch, getState, onStateChange } from './store';
import { getViewer, onViewerChange } from './viewer';

const PHASE_LABELS: Readonly<Record<GameState['phase'], string>> = {
  worldSituation: 'World Situation',
  trigsit: 'TRIGSIT',
  summit: 'Summit',
  play: 'Play',
  ended: 'Game over',
};

const BEANIE_LABELS: Readonly<Record<Beanie, string>> = {
  gray: 'everyday gray',
  white: 'white (cessation)',
  red: 'red (Utter Global Crisis)',
  black: 'black',
};

const DEFCONS: readonly Defcon[] = [1, 2, 3, 4, 5, 6];
const code = (id: CombatantId): string => COMBATANTS[id].code;
const list = (ids: readonly CombatantId[]): string =>
  ids.length ? ids.map(code).join(', ') : 'nobody yet';

function button(
  label: string,
  id: string,
  onClick: () => void,
  disabled = false,
): HTMLButtonElement {
  const b = el('button', { type: 'button', id, disabled }, [label]);
  b.addEventListener('click', onClick);
  return b;
}

function select<T extends string | number>(
  id: string,
  options: readonly { value: T; label: string; disabled?: boolean }[],
  value: T | undefined,
): HTMLSelectElement {
  return el(
    'select',
    { id },
    options.map((o) =>
      el(
        'option',
        { value: String(o.value), selected: o.value === value, disabled: !!o.disabled },
        [o.label],
      ),
    ),
  );
}

export interface GamePanelOptions {
  /** Open EndStat's crunch on the Yushityu. */
  crunch(): void;
  /** Ask the person at the screen to click a spot on the courts. */
  pickPoint(): Promise<LonLat | undefined>;
}

export function mountGamePanel(host: HTMLElement, options: GamePanelOptions): void {
  const body = el('div', { className: 'game-body' });
  const summary = el('summary', {});
  const panel = el('details', { className: 'panel game-panel', id: 'game-panel', open: true }, [
    summary,
    body,
  ]);
  host.append(panel);

  let feedback = '';
  // Form state that survives re-rendering.
  let pactKind: PactKind = 'hotline';
  let pactPartner: CombatantId | undefined;
  let myCity: string | undefined;
  let theirCity: string | undefined;
  let messageTo: CombatantId | undefined;
  let draft = '';
  let trigsitPick = TRIGSIT_PRECEDENTS[0]?.id ?? '';
  let shipPick: string | undefined;
  let cessationA: CombatantId | undefined;
  let cessationB: CombatantId | undefined;

  const act = (action: Action): void => {
    const o = dispatch(action);
    feedback = o.ok ? '' : `${o.problems.join('. ')}.`;
    render();
  };

  const statusLine = (s: GameState): HTMLElement => {
    const end = s.situation.clock?.end;
    return el('p', { className: 'game-status', id: 'game-status' }, [
      `${PHASE_LABELS[s.phase]} · ${clockLabel(s.clock)}${end === undefined ? '' : ` (siren at ${clockLabel(end)})`} · Beanie: ${BEANIE_LABELS[s.beanie]}`,
    ]);
  };

  const defconRow = (s: GameState): HTMLElement =>
    el(
      'ul',
      {
        className: 'defcon-row',
        id: 'defcon-row',
        title: 'DEFCON counts up with alert, as the book has it (A7)',
      },
      s.situation.combatants.map((id) => {
        const d = s.defcon[id] ?? STARTING_DEFCON;
        const li = el('li', { className: d === MAXIMUM_READINESS ? 'max' : '' }, [
          `${code(id)} ${d === MAXIMUM_READINESS ? 'MAX' : String(d)}`,
        ]);
        li.dataset['combatant'] = id;
        return li;
      }),
    );

  const profile = (id: CombatantId, s: GameState): HTMLElement => {
    const def = COMBATANTS[id];
    const line = s.allocation.lines.find((l) => l.combatant === id);
    const h = def.headOfState;
    const pct = (x: number): string => `${String(Math.round(x * 100))}%`;
    return el('details', { className: 'profile', id: 'profile' }, [
      el('summary', {}, [`Your profile: ${def.code}, ${def.name}`]),
      el('ul', {}, [
        el('li', {}, [`${h.title}: ${h.summary}`]),
        el('li', {}, [
          `Resolve ${pct(h.resolve)}, risk tolerance ${pct(h.riskTolerance)}, pact fidelity ${pct(h.pactFidelity)}, bluffing ${pct(h.bluffing)}, SACPOP readiness ${pct(h.sacpopReadiness)}.`,
        ]),
        el('li', {}, [
          `Population ${String(def.demographics.population)} million, ${String(def.demographics.populationDensity)} per km².`,
        ]),
        el('li', {}, [
          `Delivery: land ${pct(def.landSeaAir.land)}, sea ${pct(def.landSeaAir.sea)}, air ${pct(def.landSeaAir.air)}; up to ${String(def.mirvCap)} warheads per jockstrap.`,
        ]),
        el('li', {}, [
          line
            ? `Megatonnage: ${String(line.warheads)} warheads, ${String(line.megatons)} Mt. Nobody else knows this.`
            : 'Not allocated.',
        ]),
      ]),
    ]);
  };

  const pactLine = (p: Pact, s: GameState, viewer: CombatantId | undefined): HTMLElement => {
    const cities = p.cities
      ? ` (${p.parties.map((id) => `${code(id)} puts up ${TARGETS.find((t) => t.id === p.cities?.[id])?.name ?? '?'}`).join('; ')})`
      : '';
    const waiting = p.parties.filter((id) => !p.acceptedBy.includes(id));
    const state = p.broken
      ? `broken: ${p.broken}`
      : p.active
        ? 'agreed'
        : `proposed by ${code(p.proposedBy)}, waiting for ${list(waiting)}`;
    const li = el('li', {}, [`${PACT_LABELS[p.kind]}: ${list(p.parties)}${cities}, ${state}.`]);
    if (viewer && waiting.includes(viewer) && s.phase === 'summit')
      li.append(
        ' ',
        button('Accept', `accept-pact-${String(p.id)}`, () => {
          act({ type: 'acceptPact', by: viewer, pact: p.id });
        }),
      );
    return li;
  };

  const pactsSection = (s: GameState, viewer: CombatantId | undefined): HTMLElement[] => {
    const visible = s.pacts.filter((p) => !viewer || p.parties.includes(viewer));
    return [
      el('h3', {}, [viewer ? 'Your pacts' : 'Pacts on record']),
      visible.length
        ? el(
            'ul',
            { id: 'pacts' },
            visible.map((p) => pactLine(p, s, viewer)),
          )
        : el('p', { className: 'panel-note', id: 'pacts' }, ['None.']),
    ];
  };

  const proposeForm = (s: GameState, me: CombatantId): HTMLElement => {
    const others = s.situation.combatants.filter((id) => id !== me);
    if (!pactPartner || !others.includes(pactPartner)) pactPartner = others[0];
    const kind = select(
      'pact-kind',
      (Object.keys(PACT_LABELS) as PactKind[]).map((k) => ({ value: k, label: PACT_LABELS[k] })),
      pactKind,
    );
    kind.addEventListener('change', () => {
      pactKind = kind.value as PactKind;
      render();
    });
    const partner = select(
      'pact-partner',
      others.map((id) => ({ value: id, label: code(id) })),
      pactPartner,
    );
    partner.addEventListener('change', () => {
      pactPartner = partner.value as CombatantId;
      render();
    });
    const rows: (HTMLElement | string)[] = [
      el('label', { htmlFor: 'pact-kind' }, ['Pact ']),
      kind,
      el('label', { htmlFor: 'pact-partner' }, [' with ']),
      partner,
    ];
    if (pactKind === 'cityTrade' && pactPartner) {
      const cities = (id: CombatantId) =>
        TARGETS.filter((t) => t.type === 'MAMA' && t.owner === id).map((t) => ({
          value: t.id,
          label: t.name,
        }));
      const mine = cities(me);
      const theirs = cities(pactPartner);
      if (!myCity || !mine.some((c) => c.value === myCity)) myCity = mine[0]?.value;
      if (!theirCity || !theirs.some((c) => c.value === theirCity)) theirCity = theirs[0]?.value;
      const mySel = select('pact-my-city', mine, myCity);
      const theirSel = select('pact-their-city', theirs, theirCity);
      mySel.addEventListener('change', () => {
        myCity = mySel.value;
      });
      theirSel.addEventListener('change', () => {
        theirCity = theirSel.value;
      });
      rows.push(
        el('div', {}, [el('label', { htmlFor: 'pact-my-city' }, ['You put up ']), mySel]),
        el('div', {}, [el('label', { htmlFor: 'pact-their-city' }, ['for ']), theirSel]),
      );
    }
    rows.push(
      ' ',
      button('Propose', 'pact-propose', () => {
        if (!pactPartner) return;
        act({
          type: 'proposePact',
          by: me,
          kind: pactKind,
          parties: [pactPartner],
          ...(pactKind === 'cityTrade' && myCity && theirCity
            ? { cities: { [me]: myCity, [pactPartner]: theirCity } }
            : {}),
        });
      }),
    );
    const notes: Readonly<Record<PactKind, string>> = {
      alliance: 'Neither may strike the other; when one is struck, the other matches its DEFCON.',
      humaneWar: 'Neither may aim at the other’s cities, except cities traded.',
      hotline: 'Lets the two send messages through the game-master during play.',
      defconGradient: 'Each may raise its DEFCON only one step at a time.',
      cityTrade:
        'Each gives the other leave to strike one named city, even under a humane-war pact.',
    };
    return el('div', { className: 'pact-form' }, [
      ...rows,
      el('p', { className: 'panel-note' }, [notes[pactKind]]),
    ]);
  };

  const defconControl = (s: GameState, me: CombatantId): HTMLElement => {
    const sel = select(
      'defcon',
      DEFCONS.map((d) => ({ value: d, label: defconLabel(d) })),
      s.defcon[me] ?? STARTING_DEFCON,
    );
    sel.addEventListener('change', () => {
      act({ type: 'setDefcon', by: me, level: Number(sel.value) as Defcon });
    });
    return el('div', { className: 'game-row' }, [
      el('label', { htmlFor: 'defcon' }, ['Your alert ']),
      sel,
    ]);
  };

  const hotline = (s: GameState, me: CombatantId): HTMLElement[] => {
    const others = s.situation.combatants.filter((id) => id !== me);
    if (!messageTo || !others.includes(messageTo)) messageTo = others[0];
    const to = select(
      'message-to',
      others.map((id) => ({ value: id, label: code(id) })),
      messageTo,
    );
    to.addEventListener('change', () => {
      messageTo = to.value as CombatantId;
    });
    const text = el('textarea', { id: 'message-text', rows: 2, value: draft });
    text.addEventListener('input', () => {
      draft = text.value;
    });
    const words = s.endstat.comm[me]?.words ?? 80;
    const inbox = s.messages.filter((m) => m.from === me || m.to === me);
    return [
      el('h3', {}, ['Hotline']),
      el('div', { className: 'game-row' }, [el('label', { htmlFor: 'message-to' }, ['To ']), to]),
      text,
      el('p', { className: 'panel-note' }, [
        `The game-master carries it. Your hotline takes ${String(words)} words a message after EMP.`,
      ]),
      button('Send', 'message-send', () => {
        if (!messageTo) return;
        const o = dispatch({ type: 'message', from: me, to: messageTo, text: draft });
        feedback = o.ok
          ? o.pending !== undefined
            ? 'Handed to God, who will rule on it.'
            : ''
          : `${o.problems.join('. ')}.`;
        if (o.ok) draft = '';
        render();
      }),
      inbox.length
        ? el(
            'ul',
            { id: 'inbox', className: 'inbox' },
            inbox.map((m) =>
              el('li', {}, [`${clockLabel(m.at)} ${code(m.from)} → ${code(m.to)}: ${m.text}`]),
            ),
          )
        : el('p', { className: 'panel-note', id: 'inbox' }, ['No messages.']),
    ];
  };

  const rulings = (s: GameState): HTMLElement[] => {
    if (!s.humanGod) return [];
    const item = (p: PendingRuling): HTMLElement => {
      const a = p.action;
      const what =
        a.type === 'launch'
          ? `${code(a.order.combatant)} orders ${a.order.warheads === 1 ? 'a lob' : `a jockstrap of ${String(a.order.warheads)}`} from ${platformsFor(a.order.combatant, s.situation).find((x) => x.id === a.order.platformId)?.name ?? a.order.platformId}.`
          : `${code(a.from)} to ${code(a.to)}: “${a.text}”`;
      return el('li', {}, [
        what,
        el('br', {}),
        p.problems.length
          ? `EndStat would refuse: ${p.problems.join('; ')}.`
          : 'EndStat sees no problem.',
        ' ',
        button('Allow', `rule-allow-${String(p.id)}`, () => {
          act({ type: 'rule', pending: p.id, allow: true });
        }),
        ' ',
        button('Refuse', `rule-refuse-${String(p.id)}`, () => {
          act({ type: 'rule', pending: p.id, allow: false });
        }),
      ]);
    };
    return [
      el('h3', {}, ['Waiting for your ruling']),
      s.pending.length
        ? el('ul', { id: 'rulings' }, s.pending.map(item))
        : el('p', { className: 'panel-note', id: 'rulings' }, ['Nothing.']),
    ];
  };

  const WEATHER_LABELS: Readonly<Record<Precipitation, string>> = {
    none: 'Dry',
    rain: 'Rain',
    snow: 'Snow',
  };

  const courtWeather = (s: GameState): HTMLElement => {
    const sel = select(
      'court-weather',
      (['none', 'rain', 'snow'] as const).map((w) => ({ value: w, label: WEATHER_LABELS[w] })),
      s.courtWeather,
    );
    sel.addEventListener('change', () => {
      act({ type: 'courtWeather', precipitation: sel.value as Precipitation });
    });
    return el('div', { className: 'game-row' }, [
      el('label', { htmlFor: 'court-weather' }, ['Real weather on the courts ']),
      sel,
    ]);
  };

  const weatherAppeal = (s: GameState, me: CombatantId): HTMLElement[] =>
    s.courtWeather === 'none'
      ? []
      : [
          el('p', { className: 'panel-note' }, [
            `${WEATHER_LABELS[s.courtWeather]} is falling on the courts. EndStat uses only the World Situation's weather.`,
          ]),
          button('Demand the kill radii be recalculated', 'weather-appeal', () => {
            act({ type: 'weatherAppeal', by: me });
          }),
        ];

  const ships = (s: GameState, me: CombatantId): HTMLElement[] => {
    const mine = itemsOf(s).filter((t) => t.owner === me && t.mobile);
    if (mine.length === 0) return [];
    if (!shipPick || !mine.some((t) => t.id === shipPick)) shipPick = mine[0]?.id;
    const sel = select(
      'move-item',
      mine.map((t) => ({ value: t.id, label: t.name })),
      shipPick,
    );
    sel.addEventListener('change', () => {
      shipPick = sel.value;
    });
    return [
      el('h3', {}, ['Your ships']),
      el('div', { className: 'game-row' }, [
        el('label', { htmlFor: 'move-item' }, ['Move ']),
        sel,
        ' ',
        button('Pick where it goes', 'move-pick', () => {
          const item = shipPick;
          if (!item) return;
          feedback = 'Click a spot at sea on the map (Escape cancels).';
          render();
          void options.pickPoint().then((to) => {
            if (!to) {
              feedback = '';
              render();
              return;
            }
            act({ type: 'moveItem', by: me, item, to });
          });
        }),
      ]),
      el('p', { className: 'panel-note' }, [
        `Submarines move up to ${String(MOBILE_RANGE_KM.submarine ?? 0)} km a move, carrier groups ${String(MOBILE_RANGE_KM['carrier-group'] ?? 0)} km, and only at sea. Nothing else on the map ever moves.`,
      ]),
    ];
  };

  const humanGodToggle = (s: GameState): HTMLElement => {
    const box = el('input', { type: 'checkbox', id: 'human-god', checked: s.humanGod });
    box.addEventListener('change', () => {
      act({ type: 'setHumanGod', on: box.checked });
    });
    return el('label', { htmlFor: 'human-god', className: 'game-row' }, [
      box,
      ' Human God: a person rules on every order and message',
    ]);
  };

  const beanies = (s: GameState): HTMLElement[] => {
    const ids = s.situation.combatants;
    if (!cessationA || !ids.includes(cessationA)) cessationA = ids[0];
    if (!cessationB || !ids.includes(cessationB) || cessationB === cessationA)
      cessationB = ids.find((id) => id !== cessationA);
    const a = select(
      'cessation-a',
      ids.map((id) => ({ value: id, label: code(id) })),
      cessationA,
    );
    const b = select(
      'cessation-b',
      ids.map((id) => ({ value: id, label: code(id) })),
      cessationB,
    );
    a.addEventListener('change', () => {
      cessationA = a.value as CombatantId;
    });
    b.addEventListener('change', () => {
      cessationB = b.value as CombatantId;
    });
    return [
      el('h3', {}, ['Beanies']),
      el('div', { className: 'game-row' }, [
        button('White', 'beanie-white', () => {
          if (cessationA && cessationB)
            act({ type: 'beanie', beanie: 'white', between: [cessationA, cessationB] });
        }),
        ' between ',
        a,
        ' and ',
        b,
      ]),
      el('div', { className: 'game-row' }, [
        button('Red: Utter Global Crisis', 'beanie-red', () => {
          act({ type: 'beanie', beanie: 'red' });
        }),
        ' ',
        button('Black', 'beanie-black', () => {
          act({ type: 'beanie', beanie: 'black' });
        }),
        ' ',
        button('Everyday gray', 'beanie-gray', () => {
          act({ type: 'beanie', beanie: 'gray' });
        }),
      ]),
    ];
  };

  const logSection = (s: GameState): HTMLElement => {
    const viewer = getViewer();
    const entries = s.log
      .filter((e) => canRead(e.audience, viewer))
      .slice(-15)
      .reverse();
    return el('details', { className: 'game-log', id: 'game-log', open: true }, [
      el('summary', {}, ['The game-master’s log']),
      el(
        'ul',
        {},
        entries.map((e) => el('li', {}, [`${clockLabel(e.at)} ${e.text}`])),
      ),
    ]);
  };

  const skipToPlay = (s: GameState): void => {
    const ids = s.situation.combatants;
    const q = quorum(s.situation);
    const actions: Action[] = [];
    if (s.phase === 'worldSituation')
      for (const by of ids
        .filter((id) => !s.endorsedBy.includes(id))
        .slice(0, q - s.endorsedBy.length))
        actions.push({ type: 'endorse', by });
    const precedent = TRIGSIT_PRECEDENTS[0];
    if (precedent && (s.phase === 'worldSituation' || (s.phase === 'trigsit' && !s.trigsit)))
      actions.push({ type: 'setTrigsit', trigsit: precedent });
    if (s.phase !== 'summit')
      for (const by of ids.slice(0, q)) actions.push({ type: 'agreeTrigsit', by });
    actions.push({ type: 'closeSummit' });
    for (const a of actions) dispatch(a);
    feedback = '';
    render();
  };

  function render(): void {
    const s = getState();
    const viewer = getViewer();
    const me =
      viewer.kind === 'combatant' && s.situation.combatants.includes(viewer.id)
        ? viewer.id
        : undefined;
    const isGm = viewer.kind === 'gameMaster';
    summary.textContent = `The game: ${PHASE_LABELS[s.phase]}`;
    panel.dataset['phase'] = s.phase;
    const parts: (HTMLElement | string)[] = [statusLine(s), defconRow(s)];
    if (me) parts.push(profile(me, s));
    if (viewer.kind === 'combatant' && !me)
      parts.push(
        el('p', { className: 'panel-note' }, [`${code(viewer.id)} is not playing this game.`]),
      );

    const q = quorum(s.situation);
    switch (s.phase) {
      case 'worldSituation':
        parts.push(
          el('h3', {}, [s.situation.title]),
          el('p', {}, [s.situation.summary]),
          el('p', { id: 'endorsements' }, [
            `Endorsed by ${list(s.endorsedBy)} (${String(s.endorsedBy.length)} of the ${String(q)} needed).`,
          ]),
        );
        if (me)
          parts.push(
            button(
              'Endorse the World Situation',
              'endorse',
              () => {
                act({ type: 'endorse', by: me });
              },
              s.endorsedBy.includes(me),
            ),
          );
        break;
      case 'trigsit':
        if (isGm) {
          const pick = select(
            'trigsit-pick',
            TRIGSIT_PRECEDENTS.map((t) => ({ value: t.id, label: t.title })),
            trigsitPick,
          );
          pick.addEventListener('change', () => {
            trigsitPick = pick.value;
          });
          parts.push(
            el('div', { className: 'game-row' }, [
              el('label', { htmlFor: 'trigsit-pick' }, ['Precedent ']),
              pick,
              ' ',
              button('Propose this TRIGSIT', 'propose-trigsit', () => {
                const t = TRIGSIT_PRECEDENTS.find((x) => x.id === trigsitPick);
                if (t) act({ type: 'setTrigsit', trigsit: t });
              }),
            ]),
          );
        }
        if (s.trigsit) {
          parts.push(
            el('h3', { id: 'trigsit-title' }, [`TRIGSIT: ${s.trigsit.title}`]),
            el(
              'ul',
              {},
              s.trigsit.events.map((e) => el('li', {}, [e])),
            ),
            el('p', {}, [
              `Agreed by ${list(s.trigsitAgreedBy)} (${String(s.trigsitAgreedBy.length)} of the ${String(q)} needed).`,
            ]),
          );
          if (me)
            parts.push(
              button(
                'Agree to the TRIGSIT',
                'agree-trigsit',
                () => {
                  act({ type: 'agreeTrigsit', by: me });
                },
                s.trigsitAgreedBy.includes(me),
              ),
            );
        } else
          parts.push(
            el('p', { className: 'panel-note' }, [
              'Waiting for the game-master to propose a TRIGSIT.',
            ]),
          );
        break;
      case 'summit':
        parts.push(
          el('p', {}, [
            'The summit: purified water, unfatted chips, and bluffing. Each team knows only its own profile and megatonnage.',
          ]),
        );
        parts.push(...pactsSection(s, me));
        if (me) parts.push(proposeForm(s, me), defconControl(s, me));
        if (isGm)
          parts.push(
            button('Close the summit and begin play', 'close-summit', () => {
              act({ type: 'closeSummit' });
            }),
          );
        break;
      case 'play':
        if (me) {
          parts.push(
            defconControl(s, me),
            ...weatherAppeal(s, me),
            ...hotline(s, me),
            ...ships(s, me),
            ...pactsSection(s, me),
          );
          parts.push(
            button(
              'Agree to end the game',
              'agree-end',
              () => {
                act({ type: 'agreeToEnd', by: me });
              },
              s.agreedToEnd.includes(me),
            ),
          );
        }
        if (isGm) {
          parts.push(...rulings(s), ...beanies(s));
          parts.push(
            el('div', { className: 'game-row' }, [
              button('Advance the clock 15 minutes', 'advance-clock', () => {
                act({ type: 'advanceClock', minutes: 15 });
              }),
            ]),
            ...pactsSection(s, undefined),
          );
          if (s.messages.length)
            parts.push(
              el('h3', {}, ['Messages carried']),
              el(
                'ul',
                { className: 'inbox' },
                s.messages.map((m) =>
                  el('li', {}, [`${clockLabel(m.at)} ${code(m.from)} → ${code(m.to)}: ${m.text}`]),
                ),
              ),
            );
        }
        break;
      case 'ended':
        parts.push(
          el('p', { id: 'game-over' }, [
            `${s.ended?.detail ?? ''} ${s.ended?.winner ? `EndStat confirms ${code(s.ended.winner)} as the winner.` : 'EndStat confirms no winner.'}`,
          ]),
          button('Show EndStat’s crunch', 'show-crunch', () => {
            options.crunch();
          }),
        );
        break;
    }
    if (isGm && s.phase !== 'ended') {
      parts.push(courtWeather(s), humanGodToggle(s));
      if (s.phase !== 'play')
        parts.push(
          button('Practice: skip to play', 'skip-to-play', () => {
            skipToPlay(getState());
          }),
        );
    }
    const fb = el('p', { className: 'game-feedback', id: 'game-feedback' }, [feedback]);
    fb.setAttribute('role', 'status');
    parts.push(fb, logSection(s));
    body.replaceChildren(...parts);
  }

  onStateChange(() => {
    render();
  });
  onViewerChange(() => {
    feedback = '';
    draft = '';
    render();
  });
  render();
}
