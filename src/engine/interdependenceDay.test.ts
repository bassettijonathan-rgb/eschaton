import { describe, expect, it } from 'vitest';
import { decisionTree, nextComputerAction, playOut, positFor, type Controllers } from './ai';
import { layoutApparatus } from './apparatus';
import { apparatusSolids } from './axiom';
import { COMBATANTS } from './data/combatants';
import { INTERDEPENDENCE_DAY, INTERDEPENDENCE_DAY_TRIGSIT } from './data/interdependenceDay';
import { scenarioById } from './data/scenarios';
import { TARGETS } from './data/targets';
import { apply, itemsOf, newGame, replay, type Action, type GameState } from './game';
import { platformsFor, solveSpeed } from './lob';
import { project } from './projection';
import { through } from './testing';
import type { CombatantId } from './types';

const ws = INTERDEPENDENCE_DAY;

function run(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce((s, a) => {
    const o = apply(s, a);
    if (!o.ok) throw new Error(`${a.type} refused: ${o.problems.join('; ')}`);
    return o.state;
  }, state);
}

const QUORUM: CombatantId[] = ['AMNAT', 'SOVWAR', 'REDCHI', 'LIBSYR'];
const afterTrigsit = (): GameState =>
  run(
    newGame(ws),
    ...QUORUM.map((by): Action => ({ type: 'endorse', by })),
    { type: 'setTrigsit', trigsit: INTERDEPENDENCE_DAY_TRIGSIT },
    ...QUORUM.map((by): Action => ({ type: 'agreeTrigsit', by })),
  );
const inPlay = (): GameState => run(afterTrigsit(), { type: 'closeSummit' });

const find = (name: string) => {
  const t = TARGETS.find((x) => x.name === name);
  if (!t) throw new Error(name);
  return t;
};

/** A perfect single-warhead lob from a named platform at a named garment. */
function perfect(by: CombatantId, platformName: string, target: string): Action {
  const platform = platformsFor(by, ws).find((p) => p.name === platformName);
  const to = find(target).at;
  const elevation = (55 * Math.PI) / 180;
  const aim = solveSpeed(project(platform?.at ?? to), project(to), elevation, 1500);
  if (!platform || !aim) throw new Error('no shot');
  return {
    type: 'launch',
    order: {
      combatant: by,
      platformId: platform.id,
      warheads: 1,
      swing: { bearing: aim.bearing, elevation, speed: aim.speed, topspinRpm: 1500, timing: 0 },
      aimAt: to,
    },
  };
}

describe('the World Situation of Interdependence Day', () => {
  const s = newGame(ws);

  it('is the chapter’s six Combatants, allocated by this game only (A19)', () => {
    expect(scenarioById('interdependence-day')).toBe(ws);
    expect(ws.combatants).toEqual(['AMNAT', 'SOVWAR', 'REDCHI', 'LIBSYR', 'SOUTHAF', 'INDPAK']);
    expect(s.method).toBe('literal');
    const line = (id: CombatantId) => s.allocation.lines.find((l) => l.combatant === id);
    expect(line('SOUTHAF')?.warheads).toBe(16);
    for (const id of ['AMNAT', 'SOVWAR'] as const)
      expect(Math.abs((line(id)?.megatons ?? 0) - 400)).toBeLessThan(25);
    expect(ws.clock).toEqual({ start: 13 * 60 + 30, end: 16 * 60 });
  });

  it('puts the chapter’s cast on the courts', () => {
    const labels = layoutApparatus(ws, COMBATANTS).map((a) => a.label);
    for (const name of [
      'LaMont Chu',
      'Todd “Postal Weight” Possalthwaite',
      'Kieran McKenna',
      'Timmy “Sleepy T.P.” Peterson',
      'Ann Kittenplan',
      'Evan Ingersoll',
      'Josh Gopnik',
      'J. J. Penn',
      'Otis P. Lord',
    ])
      expect(labels.some((l) => l.startsWith(name))).toBe(true);
    expect(labels).toContain('Ann Kittenplan, SOVWAR Air Marshal (launcher)');
    expect(labels).toContain('REDCHI General Secretary');
  });
});

describe('the TRIGSIT', () => {
  const s = afterTrigsit();
  const trigsitLines = s.log.filter((e) => /^TRIGSIT \d+:/.test(e.text)).map((e) => e.text);

  it('happens in the chapter’s order', () => {
    const order = [
      'satellite-receiver stations',
      'Volgograd',
      'Cape Flattery',
      'on all sides',
      'Sakhalin',
      'uranium',
      'six counties',
      'Red Sea',
      'Italy invades Albania',
      'Tel Aviv',
      'IRLIBSYR',
      'MAMA evacuations',
      'Provo',
      'Decision Tree',
    ];
    expect(trigsitLines).toHaveLength(order.length);
    order.forEach((words, i) => {
      expect(trigsitLines[i]).toContain(`TRIGSIT ${String(i + 1)}:`);
      expect(trigsitLines[i]).toContain(words);
    });
    expect(s.phase).toBe('summit');
  });

  it('raises DEFCON as it goes, highest for AMNAT', () => {
    expect(s.defcon).toEqual({
      AMNAT: 6,
      SOVWAR: 5,
      REDCHI: 3,
      LIBSYR: 4,
      SOUTHAF: 3,
      INDPAK: 3,
    });
  });

  it('turns LIBSYR into IRLIBSYR, with Tehran and Baghdad behind it', () => {
    expect(s.situation.codes?.LIBSYR).toBe('IRLIBSYR');
    const tehran = itemsOf(s).find((t) => t.name === 'Tehran');
    expect(tehran?.owner).toBe('LIBSYR');
    const later = run(s, { type: 'statement', by: 'LIBSYR', text: 'We are three now.' });
    expect(later.log.at(-1)?.text).toMatch(/^IRLIBSYR/);
    // Before the TRIGSIT stood, Tehran was nobody's to score.
    expect(itemsOf(newGame(ws)).find((t) => t.name === 'Tehran')?.owner).toBe('IRAN');
  });

  it('leaves what it destroyed worth nothing, and Provo silent', () => {
    const p = run(
      inPlay(),
      { type: 'setDefcon', by: 'SOVWAR', level: 6 },
      perfect('SOVWAR', 'Dombarovsky silos', 'Provo'),
    );
    const provo = p.endstat.strikes[0]?.hits.find((h) => h.item.name === 'Provo');
    expect(provo?.kind).toBe('direct');
    expect(provo?.deaths).toBe(0);
    expect(provo?.points).toBe(0);
    const struck = run(
      inPlay(),
      perfect('AMNAT', 'Minot missile field', 'Big Ear station, Sakhalin'),
    );
    const hit = struck.endstat.strikes[0]?.hits.find((h) => h.item.name.startsWith('Big Ear'));
    expect(hit?.points).toBe(0);
    expect(hit?.steps.join(' ')).toContain('Already 100% destroyed before play');
  });

  it('evacuates cities by civil defence, so a strike there kills fewer', () => {
    expect(newGame(ws).situation.evacuated).toBeUndefined();
    const moscow = find('Moscow').id;
    expect(s.situation.evacuated?.[moscow]).toBeGreaterThan(0);
    expect(s.situation.evacuated?.[moscow]).toBeLessThanOrEqual(0.3);
  });

  it('has EndStat’s Decision Tree posit a SPASEX response from AMNAT', () => {
    const d = decisionTree(s, 'AMNAT');
    expect(d.posture).toBe('counterforce');
    expect(d.against).toEqual(['LIBSYR']);
    expect(d.steps.join(' ')).toContain('In the TRIGSIT, IRLIBSYR sank our minesweeper');
    const computerLord: Controllers = { combatants: {}, gameMaster: true };
    const posit = nextComputerAction(s, computerLord);
    expect(posit).toEqual(positFor(s, 'AMNAT'));
    const after = run(s, posit ?? { type: 'closeSummit' });
    expect(after.log.at(-1)?.text).toMatch(
      /^Otis P\. Lord runs EndStat's Decision Tree for AMNAT, and it dictates: a SPASEX response against IRLIBSYR/,
    );
    expect(after.posited).toEqual(['AMNAT']);
    expect(nextComputerAction(after, computerLord)).toBeUndefined();
  });
});

describe('the afternoon', () => {
  it('brings the first snow of the year at 1500h, and it changes nothing', () => {
    let s = inPlay();
    s = run(s, perfect('AMNAT', 'Minot missile field', 'Damascus'));
    const before = s.endstat;
    while (s.clock < 15 * 60) s = run(s, { type: 'advanceClock', minutes: 15 });
    expect(s.courtWeather).toBe('snow');
    expect(s.log.map((e) => e.text).join(' ')).toContain('The first snow of the year');
    expect(s.endstat).toEqual(before);
    // J. J. Penn's INDPAK demands a recalculation; Pemulis rules from outside the fence.
    const appeal = nextComputerAction(s, {
      combatants: { INDPAK: { skill: 1 } },
      gameMaster: false,
    });
    expect(appeal).toEqual({ type: 'weatherAppeal', by: 'INDPAK' });
    s = run(s, appeal ?? { type: 'closeSummit' });
    expect(s.log.at(-1)?.text).toContain(
      'Ruling from Michael Pemulis, outside the fence: it is snowing on the map, not the territory.',
    );
    expect(s.endstat).toEqual(before);
  });

  it('ends with Pemulis winning the argument: Ingersoll’s ball at Kittenplan scores nothing, and play goes on', () => {
    let s = run(inPlay(), { type: 'beanie', beanie: 'white', between: ['AMNAT', 'SOVWAR'] });
    const solids = apparatusSolids(layoutApparatus(ws, COMBATANTS));
    const ann = solids.find((x) => x.kind === 'player' && x.label.startsWith('Ann Kittenplan'));
    if (!ann) throw new Error('no Kittenplan');
    const tallies = s.endstat.tallies;
    s = run(s, {
      type: 'launch',
      order: through('LIBSYR', 'Palmyra bomber squadron', ann, 1.0, ws),
    });
    const d = s.lobs.at(-1)?.detonations[0];
    expect(d?.struck?.label).toBe(ann.label);
    expect(d?.hits).toEqual([]);
    expect(s.endstat.tallies).toEqual(tallies);
    const text = s.log.map((e) => e.text).join('\n');
    expect(text).toContain('IRLIBSYR lobs a warhead from Palmyra bomber squadron.');
    expect(text).toContain('struck Ann Kittenplan');
    expect(text).toContain('Ruling from Michael Pemulis, outside the fence');
    expect(text).toContain('a parley under the white beanie makes nobody a target');
    expect(s.beanie).toBe('white');
    expect(s.phase).toBe('play');
    // Nothing breaks up the game: it runs on to the siren.
    while (s.phase === 'play') s = run(s, { type: 'advanceClock', minutes: 15 });
    expect(s.ended?.reason).toBe('clock');
    expect(s.log.at(-1)?.text).toMatch(/^The 1600h siren\./);
  });
});

describe('a whole Interdependence Day of computers', () => {
  const everyone: Controllers = {
    combatants: Object.fromEntries(ws.combatants.map((id) => [id, { skill: 0.8 }])),
    gameMaster: true,
  };
  const { state, actions } = playOut(newGame(ws), everyone);

  it('plays the scenario through to a winner EndStat confirms', () => {
    expect(state.phase).toBe('ended');
    expect(state.ended?.winner).toBeDefined();
    expect(state.log.at(-1)?.text).toMatch(/EndStat confirms \w+ as the winner/);
    const text = state.log.map((e) => e.text).join('\n');
    expect(text).toContain('TRIGSIT 14:');
    expect(text).toContain('a SPASEX response against IRLIBSYR');
    expect(actions[0]?.type).not.toBe('setMethod');
  });

  it('replays exactly', () => {
    expect(replay(ws, actions).log).toEqual(state.log);
  });
});
