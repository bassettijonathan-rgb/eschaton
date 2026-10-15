import { describe, expect, it } from 'vitest';
import { TARGETS } from './data/targets';
import { TRIGSIT_PRECEDENTS } from './data/trigsits';
import { DEFAULT_WORLD_SITUATION } from './data/worldSituation';
import {
  MAXIMUM_READINESS,
  MINUTES_PER_ORDER,
  STARTING_DEFCON,
  apply,
  canRead,
  clockLabel,
  declaredVictim,
  defconLabel,
  inContention,
  newGame,
  quorum,
  replay,
  type Action,
  type Defcon,
  type GameState,
} from './game';
import { platformsFor, solveSpeed, type LaunchOrder } from './lob';
import { project } from './projection';
import type { CombatantId } from './types';

const ws = DEFAULT_WORLD_SITUATION;
const find = (name: string) => {
  const t = TARGETS.find((x) => x.name === name);
  if (!t) throw new Error(name);
  return t;
};
const PLATFORM: Partial<Record<CombatantId, string>> = {
  AMNAT: 'Minot missile field',
  SOVWAR: 'Dombarovsky silos',
  REDCHI: 'Delingha missile field',
};

function aimed(by: CombatantId, target: string, warheads = 1): LaunchOrder {
  const platform = platformsFor(by, ws).find((p) => p.name === PLATFORM[by]);
  if (!platform) throw new Error(`no platform for ${by}`);
  const to = find(target).at;
  const elevation = (55 * Math.PI) / 180;
  const spin = warheads > 1 ? 0 : 1500;
  const aim = solveSpeed(project(platform.at), project(to), elevation, spin, warheads);
  if (!aim) throw new Error('out of reach');
  return {
    combatant: by,
    platformId: platform.id,
    warheads,
    swing: { bearing: aim.bearing, elevation, speed: aim.speed, topspinRpm: spin, timing: 0 },
    aimAt: to,
  };
}

function run(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce((s, a) => {
    const o = apply(s, a);
    if (!o.ok) throw new Error(`${a.type} refused: ${o.problems.join('; ')}`);
    return o.state;
  }, state);
}

const ENDORSERS: CombatantId[] = ['AMNAT', 'SOVWAR', 'REDCHI', 'LIBSYR'];

function toSummit(): GameState {
  return run(
    newGame(ws),
    ...ENDORSERS.map((by): Action => ({ type: 'endorse', by })),
    { type: 'setTrigsit', trigsit: TRIGSIT_PRECEDENTS[0] ?? { id: 'x', title: 'x', events: [] } },
    ...ENDORSERS.map((by): Action => ({ type: 'agreeTrigsit', by })),
  );
}

const toPlay = (...summit: Action[]): GameState =>
  run(toSummit(), ...summit, { type: 'closeSummit' });
const defcon = (by: CombatantId, level: Defcon): Action => ({ type: 'setDefcon', by, level });
const lob = (order: LaunchOrder): Action => ({ type: 'launch', order });

describe('the World Situation and TRIGSIT', () => {
  it('need a quorum of the day’s Combatants', () => {
    expect(quorum(ws)).toBe(4);
    let s = newGame(ws);
    s = run(s, ...ENDORSERS.slice(0, 3).map((by): Action => ({ type: 'endorse', by })));
    expect(s.phase).toBe('worldSituation');
    s = run(s, { type: 'endorse', by: 'LIBSYR' });
    expect(s.phase).toBe('trigsit');
  });

  it('refuse a second endorsement and Combatants who are not playing', () => {
    const s = run(newGame(ws), { type: 'endorse', by: 'AMNAT' });
    expect(apply(s, { type: 'endorse', by: 'AMNAT' }).ok).toBe(false);
    const two = newGame({ ...ws, combatants: ['AMNAT', 'SOVWAR'] });
    expect(apply(two, { type: 'endorse', by: 'REDCHI' }).problems).toEqual([
      'REDCHI is not playing',
    ]);
  });

  it('lets the game-master change the allocation method only before endorsement', () => {
    const s = run(newGame(ws), { type: 'setMethod', method: 'yahtzee' });
    expect(s.allocation.method).toBe('yahtzee');
    expect(apply(toSummit(), { type: 'setMethod', method: 'literal' }).ok).toBe(false);
  });

  it('opens the summit once a quorum agrees the TRIGSIT', () => {
    const s = toSummit();
    expect(s.phase).toBe('summit');
    expect(s.trigsit?.title).toBe(TRIGSIT_PRECEDENTS[0]?.title);
  });

  it('raises the DEFCONs its events raise once it stands', () => {
    const s = toSummit();
    // Trouble on the Canadian border: both superpowers go up a step.
    expect(s.defcon.AMNAT).toBe(STARTING_DEFCON + 1);
    expect(s.defcon.SOVWAR).toBe(STARTING_DEFCON + 1);
    expect(s.defcon.REDCHI ?? STARTING_DEFCON).toBe(STARTING_DEFCON);
  });
});

describe('summits', () => {
  it('record a pact once every party accepts it', () => {
    let s = run(toSummit(), {
      type: 'proposePact',
      by: 'AMNAT',
      kind: 'hotline',
      parties: ['SOVWAR'],
    });
    const pact = s.pacts[0];
    expect(pact?.active).toBe(false);
    s = run(s, { type: 'acceptPact', by: 'SOVWAR', pact: pact?.id ?? 0 });
    expect(s.pacts[0]?.active).toBe(true);
  });

  it('refuse malformed pacts', () => {
    const s = toSummit();
    expect(
      apply(s, { type: 'proposePact', by: 'AMNAT', kind: 'hotline', parties: ['SOVWAR', 'REDCHI'] })
        .ok,
    ).toBe(false);
    expect(
      apply(s, {
        type: 'proposePact',
        by: 'AMNAT',
        kind: 'cityTrade',
        parties: ['SOVWAR'],
        cities: { AMNAT: find('Moscow').id, SOVWAR: find('Kiev').id },
      }).problems,
    ).toContain('AMNAT must put up one of its own cities');
  });

  it('show a proposal only to its parties and the game-master', () => {
    const s = run(toSummit(), {
      type: 'proposePact',
      by: 'AMNAT',
      kind: 'alliance',
      parties: ['REDCHI'],
    });
    const entry = s.log.at(-1);
    if (!entry) throw new Error('no log');
    expect(canRead(entry.audience, { kind: 'combatant', id: 'REDCHI' })).toBe(true);
    expect(canRead(entry.audience, { kind: 'combatant', id: 'SOVWAR' })).toBe(false);
    expect(canRead(entry.audience, { kind: 'gameMaster' })).toBe(true);
  });
});

function pact(
  s: GameState,
  by: CombatantId,
  kind: Parameters<typeof pactAction>[1],
  parties: CombatantId[],
  cities?: Partial<Record<CombatantId, string>>,
): GameState {
  s = run(s, pactAction(by, kind, parties, cities));
  const id = s.pacts.at(-1)?.id ?? 0;
  return run(s, ...parties.map((p): Action => ({ type: 'acceptPact', by: p, pact: id })));
}
function pactAction(
  by: CombatantId,
  kind: 'alliance' | 'humaneWar' | 'hotline' | 'defconGradient' | 'cityTrade',
  parties: CombatantId[],
  cities?: Partial<Record<CombatantId, string>>,
): Action {
  return { type: 'proposePact', by, kind, parties, ...(cities ? { cities } : {}) };
}

describe('DEFCON (A7)', () => {
  it('counts up toward Maximum Readiness', () => {
    expect(defconLabel(5)).toBe('DEFCON 5');
    expect(defconLabel(MAXIMUM_READINESS)).toBe('Maximum Readiness');
  });

  it('must be high enough for a lob, higher for a MIRV, highest for a city', () => {
    let s = toPlay();
    expect(apply(s, lob(aimed('AMNAT', 'Dombarovsky silos'))).problems.join()).toMatch(
      /needs DEFCON 4/,
    );
    s = run(s, defcon('AMNAT', 4));
    expect(apply(s, lob(aimed('AMNAT', 'Dombarovsky silos', 3))).problems.join()).toMatch(/MIRV/);
    expect(apply(s, lob(aimed('AMNAT', 'Moscow'))).problems.join()).toMatch(
      /city needs Maximum Readiness/,
    );
    const ok = apply(s, lob(aimed('AMNAT', 'Dombarovsky silos')));
    expect(ok.ok).toBe(true);
    expect(ok.state.clock).toBe(s.clock + MINUTES_PER_ORDER);
    expect(ok.state.supply.buckets.AMNAT).toBe((s.supply.buckets.AMNAT ?? 0) - 1);
  });

  it('rises one step at a time under a DEFCON gradient', () => {
    const free = toPlay();
    expect(apply(free, defcon('AMNAT', 5)).ok).toBe(true);
    const s = run(pact(toSummit(), 'AMNAT', 'defconGradient', ['SOVWAR']), { type: 'closeSummit' });
    expect(apply(s, defcon('AMNAT', 5)).problems.join()).toMatch(/one step at a time/);
    expect(apply(s, defcon('AMNAT', 4)).ok).toBe(true);
  });
});

describe('orders', () => {
  it('need a declared aim point', () => {
    const s = run(toPlay(), defcon('AMNAT', 4));
    const { combatant, platformId, warheads, swing } = aimed('AMNAT', 'Dombarovsky silos');
    expect(apply(s, lob({ combatant, platformId, warheads, swing })).problems).toEqual([
      'Declare an aim point to the game-master first',
    ]);
  });

  it('are refused before play starts', () => {
    expect(apply(toSummit(), lob(aimed('AMNAT', 'Dombarovsky silos'))).problems).toEqual([
      'Lobs are allowed only once play has started',
    ]);
  });

  it('name their victim by the target at the aim point or the ground under it', () => {
    expect(declaredVictim(find('Moscow').at)).toBe('SOVWAR');
    expect(declaredVictim({ lon: 100, lat: 35 })).toBe('REDCHI');
    expect(declaredVictim({ lon: -40, lat: 30 })).toBeUndefined();
  });
});

describe('beanies', () => {
  const play = () => run(toPlay(), defcon('AMNAT', 4), defcon('SOVWAR', 4));

  it('white: a cessation between two Combatants while everyone else carries on', () => {
    const s = run(play(), { type: 'beanie', beanie: 'white', between: ['AMNAT', 'SOVWAR'] });
    expect(apply(s, lob(aimed('AMNAT', 'Dombarovsky silos'))).problems.join()).toMatch(/cessation/);
    expect(apply(s, lob(aimed('AMNAT', 'Beijing'))).problems.join()).not.toMatch(/cessation/);
  });

  it('red: Utter Global Crisis, Maximum Readiness everywhere and no pact binds', () => {
    let s = pact(toSummit(), 'AMNAT', 'alliance', ['SOVWAR']);
    s = run(s, { type: 'closeSummit' }, defcon('AMNAT', 4));
    expect(apply(s, lob(aimed('AMNAT', 'Dombarovsky silos'))).problems.join()).toMatch(/ally/);
    s = run(s, { type: 'beanie', beanie: 'red' });
    expect(Object.values(s.defcon).every((d) => d === MAXIMUM_READINESS)).toBe(true);
    expect(apply(s, lob(aimed('AMNAT', 'Dombarovsky silos'))).ok).toBe(true);
  });

  it('black: no effect (A4)', () => {
    const before = play();
    const s = run(before, { type: 'beanie', beanie: 'black' });
    expect(s.beanie).toBe('black');
    expect(s.defcon).toEqual(before.defcon);
    expect(s.cessation).toBeUndefined();
    expect(s.log.at(-1)?.text).toMatch(/nothing changes/);
  });
});

describe('pacts in play', () => {
  it('an alliance forbids striking an ally and raises allies when a member is struck', () => {
    let s = pact(toSummit(), 'AMNAT', 'alliance', ['REDCHI']);
    s = run(s, { type: 'closeSummit' }, defcon('SOVWAR', 5), defcon('AMNAT', 4));
    s = run(s, lob(aimed('SOVWAR', 'Minot missile field')));
    expect(s.defcon.REDCHI).toBe(4);
    expect(s.log.some((e) => /REDCHI honours its alliance with AMNAT/.test(e.text))).toBe(true);
  });

  it('a humane-war pact forbids cities, except the ones traded at the summit', () => {
    let s = pact(toSummit(), 'AMNAT', 'humaneWar', ['SOVWAR']);
    s = pact(s, 'AMNAT', 'cityTrade', ['SOVWAR'], {
      AMNAT: find('Detroit').id,
      SOVWAR: find('Kiev').id,
    });
    s = run(s, { type: 'closeSummit' }, defcon('AMNAT', 6), defcon('SOVWAR', 6));
    expect(apply(s, lob(aimed('AMNAT', 'Moscow'))).problems.join()).toMatch(/humane-war/);
    expect(apply(s, lob(aimed('SOVWAR', 'Chicago'))).problems.join()).toMatch(/humane-war/);
    s = run(s, lob(aimed('AMNAT', 'Kiev')), lob(aimed('SOVWAR', 'Detroit')));
    expect(s.lobs).toHaveLength(2);
    expect(s.pacts.find((p) => p.kind === 'humaneWar')?.broken).toBeUndefined();
  });

  it('is broken by a SACPOP strike on the partner', () => {
    let s = pact(toSummit(), 'AMNAT', 'humaneWar', ['SOVWAR']);
    s = run(
      s,
      { type: 'closeSummit' },
      { type: 'beanie', beanie: 'red' },
      lob(aimed('AMNAT', 'Moscow')),
    );
    expect(s.pacts[0]?.broken).toMatch(/AMNAT struck a SOVWAR city/);
  });
});

describe('the hotline', () => {
  it('needs a hotline pact, or a parley under the white beanie', () => {
    const s = toPlay();
    expect(
      apply(s, { type: 'message', from: 'AMNAT', to: 'SOVWAR', text: 'Stand down.' }).problems,
    ).toEqual(['AMNAT has no hotline to SOVWAR']);
    const parley = run(s, { type: 'beanie', beanie: 'white', between: ['AMNAT', 'SOVWAR'] });
    expect(
      apply(parley, { type: 'message', from: 'AMNAT', to: 'SOVWAR', text: 'Stand down.' }).ok,
    ).toBe(true);
    const line = run(pact(toSummit(), 'AMNAT', 'hotline', ['SOVWAR']), { type: 'closeSummit' });
    const sent = run(line, { type: 'message', from: 'AMNAT', to: 'SOVWAR', text: 'Stand down.' });
    expect(sent.messages.map((m) => m.text)).toEqual(['Stand down.']);
  });

  it('carries fewer words once EMP has degraded it', () => {
    let s = run(
      pact(toSummit(), 'AMNAT', 'hotline', ['SOVWAR']),
      { type: 'closeSummit' },
      { type: 'beanie', beanie: 'red' },
    );
    for (const target of ['Dombarovsky silos', 'Moscow', 'Kiev', 'Leningrad'])
      s = run(s, lob(aimed('AMNAT', target)));
    const words = s.endstat.comm.SOVWAR?.words ?? 80;
    expect(words).toBeLessThan(80);
    const long = Array.from({ length: words + 1 }, () => 'word').join(' ');
    expect(
      apply(s, { type: 'message', from: 'SOVWAR', to: 'AMNAT', text: long }).problems.join(),
    ).toMatch(/EMP has cut the hotline/);
  });
});

describe('Human God mode (A14)', () => {
  it('sends orders to a person, who may wave through what EndStat would refuse', () => {
    let s = run(toPlay(), { type: 'setHumanGod', on: true });
    const o = apply(s, lob(aimed('AMNAT', 'Dombarovsky silos')));
    expect(o.pending).toBeDefined();
    expect(o.state.pending[0]?.problems.join()).toMatch(/needs DEFCON 4/);
    s = run(o.state, { type: 'rule', pending: o.pending ?? 0, allow: true });
    expect(s.lobs).toHaveLength(1);
    expect(s.orders[0]?.ruledBy).toBe('god');
  });

  it('can refuse, and cannot wave through what is physically impossible', () => {
    const s = run(toPlay(), { type: 'setHumanGod', on: true });
    const o = apply(s, lob(aimed('AMNAT', 'Dombarovsky silos')));
    const refused = run(o.state, { type: 'rule', pending: o.pending ?? 0, allow: false });
    expect(refused.lobs).toHaveLength(0);
    expect(apply(s, lob({ ...aimed('AMNAT', 'Dombarovsky silos'), warheads: 9 })).ok).toBe(false);
  });
});

describe('the end of the game (A12)', () => {
  it('comes with the siren', () => {
    const s = run(toPlay(), { type: 'advanceClock', minutes: 16 * 60 - (ws.clock?.start ?? 0) });
    expect(s.phase).toBe('ended');
    expect(s.ended?.reason).toBe('clock');
    expect(clockLabel(16 * 60)).toBe('1600h');
  });

  it('comes when every Combatant still in contention agrees', () => {
    let s = toPlay();
    for (const by of ws.combatants) s = run(s, { type: 'agreeToEnd', by });
    expect(s.ended?.reason).toBe('agreed');
  });

  it('comes when every bucket is empty', () => {
    const s = toPlay();
    const empty: GameState = { ...s, supply: { ...s.supply, buckets: {} } };
    expect(run(empty, { type: 'advanceClock', minutes: 1 }).ended?.reason).toBe('bucketsEmpty');
  });

  it('comes when only one Combatant is left in contention, and EndStat names the winner', () => {
    const s = run(toPlay(), defcon('AMNAT', 4));
    const lonely: GameState = { ...s, supply: { ...s.supply, buckets: { AMNAT: 5 } } };
    const after = run(lonely, lob(aimed('AMNAT', 'Dombarovsky silos')));
    expect(after.ended?.reason).toBe('lastInContention');
    expect(after.ended?.winner).toBe('AMNAT');
    expect(inContention(after, 'SOVWAR')).toBe(false);
  });
});

describe('replay', () => {
  it('rebuilds the same game from its action log', () => {
    const actions: Action[] = [
      ...ENDORSERS.map((by): Action => ({ type: 'endorse', by })),
      { type: 'setTrigsit', trigsit: TRIGSIT_PRECEDENTS[1] ?? { id: 'x', title: 'x', events: [] } },
      ...ENDORSERS.map((by): Action => ({ type: 'agreeTrigsit', by })),
      { type: 'closeSummit' },
      defcon('AMNAT', 5),
      lob(aimed('AMNAT', 'Dombarovsky silos', 3)),
    ];
    const a = replay(ws, actions);
    const b = replay(ws, actions);
    expect(a).toEqual(b);
    expect(a.lobs[0]?.detonations).toHaveLength(3);
  });
});
