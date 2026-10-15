import { describe, expect, it } from 'vitest';
import {
  decisionTree,
  endorses,
  nextComputerAction,
  playOut,
  summitStatement,
  swingTiming,
  type Controllers,
} from './ai';
import { TARGETS } from './data/targets';
import { TRIGSIT_PRECEDENTS } from './data/trigsits';
import { DEFAULT_WORLD_SITUATION } from './data/worldSituation';
import { apply, newGame, replay, type Action, type GameState } from './game';
import { platformsFor, solveSpeed } from './lob';
import { project } from './projection';
import { createRng } from './rng';
import { COMBATANT_IDS, type AllocationMethod, type CombatantId } from './types';

const ws = DEFAULT_WORLD_SITUATION;
const everyone = (skill: number): Controllers => ({
  combatants: Object.fromEntries(COMBATANT_IDS.map((id) => [id, { skill }])),
  gameMaster: true,
});

function run(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce((s, a) => {
    const o = apply(s, a);
    if (!o.ok) throw new Error(`${a.type} refused: ${o.problems.join('; ')}`);
    return o.state;
  }, state);
}

const ENDORSERS: CombatantId[] = ['AMNAT', 'SOVWAR', 'REDCHI', 'LIBSYR'];
const toPlay = (...summit: Action[]): GameState =>
  run(
    newGame(ws),
    ...ENDORSERS.map((by): Action => ({ type: 'endorse', by })),
    { type: 'setTrigsit', trigsit: TRIGSIT_PRECEDENTS[1] ?? { id: 'x', title: 'x', events: [] } },
    ...ENDORSERS.map((by): Action => ({ type: 'agreeTrigsit', by })),
    ...summit,
    { type: 'closeSummit' },
  );

describe('a game of computer Combatants', () => {
  const { state, actions } = playOut(newGame(ws), everyone(0.8));

  it('runs headless from the World Situation to a winner EndStat confirms', () => {
    expect(state.phase).toBe('ended');
    expect(state.ended?.winner).toBeDefined();
    expect(state.lobs.length).toBeGreaterThan(5);
    expect(state.log.at(-1)?.text).toMatch(/EndStat confirms \w+ as the winner/);
  });

  it('goes through every phase on the way', () => {
    const kinds = new Set(actions.map((a) => a.type));
    for (const k of ['endorse', 'setTrigsit', 'agreeTrigsit', 'statement', 'proposePact'])
      expect(kinds).toContain(k);
    expect(kinds).toContain('launch');
  });

  it('replays exactly from its action log', () => {
    const again = replay(ws, actions);
    expect(again.endstat).toEqual(state.endstat);
    expect(again.log).toEqual(state.log);
  });
});

describe('the World Situation', () => {
  const methods: AllocationMethod[] = ['meanValue', 'literal', 'pemulisShortcut', 'yahtzee'];

  it('is rejected by a resolute Combatant whose draft shortchanges it', () => {
    const rejections = methods.flatMap((m) =>
      COMBATANT_IDS.filter((id) => !endorses(newGame(ws, m), id)).map((id) => `${m}:${id}`),
    );
    expect(rejections.length).toBeGreaterThan(0);
  });

  it('fails without a quorum, and the computer game-master redrafts it', () => {
    let s = newGame(ws);
    for (const by of ['AMNAT', 'SOVWAR', 'REDCHI', 'LIBSYR'] as const)
      s = run(s, { type: 'reject', by });
    expect(s.failedDrafts).toBe(1);
    expect(s.endorsedBy).toEqual([]);
    expect(nextComputerAction(s, everyone(1))).toEqual({ type: 'setMethod', method: 'literal' });
    const redrafted = run(s, { type: 'setMethod', method: 'literal' });
    expect(redrafted.failedDrafts).toBe(1);
    expect(redrafted.log.map((e) => e.text).join(' ')).toContain(
      'this draft of the World Situation fails',
    );
  });

  it('is endorsed by everyone once the drafting has dragged on', () => {
    const s = { ...newGame(ws, 'yahtzee'), failedDrafts: 2 };
    for (const id of COMBATANT_IDS) expect(endorses(s, id)).toBe(true);
  });
});

describe('the summit', () => {
  it('hears bluffs from bluffers and the plain truth from the rest', () => {
    expect(summitStatement('REDCHI')).toContain('fuller than anyone here supposes');
    expect(summitStatement('AMNAT')).toContain('what the World Situation says it is');
  });

  it('turns down pacts the head of state would not keep', () => {
    // The insurgent cell is ready to go SACPOP: it will not sign away cities.
    const s = run(
      newGame(ws),
      ...ENDORSERS.map((by): Action => ({ type: 'endorse', by })),
      { type: 'setTrigsit', trigsit: TRIGSIT_PRECEDENTS[1] ?? { id: 'x', title: 'x', events: [] } },
      ...ENDORSERS.map((by): Action => ({ type: 'agreeTrigsit', by })),
      { type: 'proposePact', by: 'AMNAT', kind: 'humaneWar', parties: ['INSURGENT'] },
      { type: 'proposePact', by: 'SOVWAR', kind: 'hotline', parties: ['AMNAT'] },
    );
    const controllers: Controllers = {
      combatants: { INSURGENT: { skill: 1 }, AMNAT: { skill: 1 } },
      gameMaster: false,
    };
    const after = playOut(s, controllers).state;
    expect(after.pacts.find((p) => p.kind === 'humaneWar')?.declined).toBe('INSURGENT');
    expect(after.pacts.find((p) => p.kind === 'hotline')?.active).toBe(true);
  });
});

describe('the Decision Tree', () => {
  it('holds when the head of state lacks the nerve to strike first', () => {
    const d = decisionTree(toPlay(), 'AMNAT');
    expect(d.posture).toBe('hold');
    expect(d.steps.join(' ')).toMatch(/hold, and let the other side move first/);
  });

  it('strikes first at the rival when resolve and risk tolerance allow, at military targets', () => {
    const d = decisionTree(toPlay(), 'LIBSYR');
    expect(d.posture).toBe('counterforce');
    expect(d.target?.type).not.toBe('MAMA');
    expect(d.against).toHaveLength(1);
    expect(d.target?.owner).toBe(d.against[0]);
    expect(d.defcon).toBe(4);
    expect(d.warheads).toBe(1);
  });

  it('answers a strike against whoever made it', () => {
    let s = toPlay({ type: 'setDefcon', by: 'LIBSYR', level: 4 });
    const first = decisionTree(s, 'LIBSYR');
    s = run(s, {
      type: 'launch',
      order: {
        combatant: 'LIBSYR',
        platformId: first.platform?.id ?? '',
        warheads: 1,
        swing: {
          bearing: first.aim?.bearing ?? 0,
          elevation: first.aim?.elevation ?? 0,
          speed: first.aim?.speed ?? 0,
          topspinRpm: 1500,
          timing: 0,
        },
        aimAt: first.target?.at ?? { lon: 0, lat: 0 },
      },
    });
    const victim = first.target?.owner as CombatantId;
    // A perfect launchman hits what the tree picked.
    expect(
      s.lobs[0]?.detonations[0]?.hits.some(
        (h) => h.item.id === first.target?.id && h.kind === 'direct',
      ),
    ).toBe(true);
    const answer = decisionTree(s, victim);
    expect(answer.posture).toBe('counterforce');
    expect(answer.against[0]).toBe('LIBSYR');
    expect(answer.target?.owner).toBe('LIBSYR');
  });

  it('goes after cities under the red beanie when the profile is ready to', () => {
    const s = run(toPlay(), { type: 'beanie', beanie: 'red' });
    const d = decisionTree(s, 'SOVWAR');
    expect(d.posture).toBe('countervalue');
    expect(d.target?.type).toBe('MAMA');
    expect(d.warheads).toBeGreaterThan(1);
    expect(d.steps[2]).toMatch(/Utter Global Crisis/);
  });

  it('renounces an alliance with a Combatant that struck it, unless the head of state keeps faith', () => {
    // An ally strikes under Human God, who waves the order through.
    const betrayed = (victim: CombatantId, target: string): GameState => {
      let s = toPlay(
        { type: 'proposePact', by: victim, kind: 'alliance', parties: ['SOVWAR'] },
        { type: 'acceptPact', by: 'SOVWAR', pact: 1 },
      );
      s = run(s, { type: 'setDefcon', by: 'SOVWAR', level: 4 }, { type: 'setHumanGod', on: true });
      const platform = platformsFor('SOVWAR', ws).find((p) => p.name === 'Dombarovsky silos');
      const item = TARGETS.find((t) => t.name === target);
      if (!platform || !item) throw new Error('no shot');
      const aim = solveSpeed(project(platform.at), project(item.at), (55 * Math.PI) / 180, 1500);
      if (!aim) throw new Error('out of reach');
      s = run(s, {
        type: 'launch',
        order: {
          combatant: 'SOVWAR',
          platformId: platform.id,
          warheads: 1,
          swing: {
            bearing: aim.bearing,
            elevation: (55 * Math.PI) / 180,
            speed: aim.speed,
            topspinRpm: 1500,
            timing: 0,
          },
          aimAt: item.at,
        },
      });
      return run(
        s,
        { type: 'rule', pending: s.pending[0]?.id ?? 0, allow: true },
        { type: 'setHumanGod', on: false },
      );
    };
    // LIBSYR's pact fidelity is 35%: it renounces the alliance to answer.
    const lib = decisionTree(betrayed('LIBSYR', 'Palmyra bomber squadron'), 'LIBSYR');
    expect(lib.against[0]).toBe('SOVWAR');
    expect(lib.renounce).toBe(1);
    expect(lib.steps.join(' ')).toContain('renounce it first');
    // AMNAT's is 75%: it will not strike its ally, so it holds.
    const am = decisionTree(betrayed('AMNAT', 'Minot missile field'), 'AMNAT');
    expect(am.renounce).toBeUndefined();
    expect(am.posture).toBe('hold');
  });

  it('lets a party renounce a pact, which then binds nobody, and tells only the parties', () => {
    const s = toPlay(
      { type: 'proposePact', by: 'LIBSYR', kind: 'alliance', parties: ['SOVWAR'] },
      { type: 'acceptPact', by: 'SOVWAR', pact: 1 },
    );
    expect(apply(s, { type: 'renouncePact', by: 'AMNAT', pact: 1 }).ok).toBe(false);
    const after = run(s, { type: 'renouncePact', by: 'LIBSYR', pact: 1 });
    expect(after.pacts[0]?.broken).toBe('renounced by LIBSYR');
    expect(after.log.at(-1)?.text).toBe('LIBSYR renounces its mutual-defence alliance with SOVWAR.');
    expect(after.log.at(-1)?.audience).toEqual(['LIBSYR', 'SOVWAR']);
    expect(apply(after, { type: 'renouncePact', by: 'SOVWAR', pact: 1 }).ok).toBe(false);
  });

  it('never looks in another Combatant’s bucket', () => {
    const s = toPlay();
    const peek: GameState = {
      ...s,
      supply: { ...s.supply, buckets: { ...s.supply.buckets, SOVWAR: 1, AMNAT: 2 } },
    };
    expect(decisionTree(peek, 'LIBSYR')).toEqual(decisionTree(s, 'LIBSYR'));
  });
});

describe('the computer launchman', () => {
  it('times a perfect swing at full skill and sprays at none', () => {
    const rng = createRng(3);
    expect(swingTiming(rng, 1)).toBe(0);
    const wild = Array.from({ length: 200 }, () => Math.abs(swingTiming(rng, 0)));
    expect(Math.max(...wild)).toBeGreaterThan(0.5);
  });
});
