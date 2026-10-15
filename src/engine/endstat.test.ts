import { describe, expect, it } from 'vitest';
import { allocate } from './allocation';
import { COMBATANTS } from './data/combatants';
import { TARGETS } from './data/targets';
import { DEFAULT_WORLD_SITUATION } from './data/worldSituation';
import { endstatKillRadius } from './effects';
import {
  BLAST_DEATHS_DIRECT,
  SACPOP_PENALTY,
  computeEndStat,
  triadDiversity,
  type EndStatLaunch,
} from './endstat';
import { adjudicateImpact } from './lob';
import { kmToCourtMetres, project, type CourtPoint } from './projection';
import type { CombatantId, TargetItem, WorldSituation } from './types';

const ws = DEFAULT_WORLD_SITUATION;
const allocation = allocate(ws, COMBATANTS);
const find = (name: string): TargetItem => {
  const t = TARGETS.find((x) => x.name === name);
  if (!t) throw new Error(name);
  return t;
};
const on = (name: string): CourtPoint => project(find(name).at);
const lob = (combatant: CombatantId, ...points: CourtPoint[]): EndStatLaunch => ({
  order: { combatant },
  detonations: points.map((p, i) => adjudicateImpact(p, i + 1, endstatKillRadius(ws))),
});
const run = (launches: EndStatLaunch[], situation: WorldSituation = ws) =>
  computeEndStat(situation, COMBATANTS, allocation, launches);
const tally = (r: ReturnType<typeof run>, id: CombatantId) => {
  const t = r.tallies[id];
  if (!t) throw new Error(`no tally for ${id}`);
  return t;
};
const city = (r: ReturnType<typeof run>, name: string) => {
  const c = r.cities.find((x) => x.item.name === name);
  if (!c) throw new Error(`${name} untouched`);
  return c;
};

describe('a quiet game', () => {
  it('has no winner until somebody inflicts something', () => {
    const r = run([]);
    expect(r.winner).toBeUndefined();
    expect(r.standings.every((t) => t.ratio === undefined)).toBe(true);
    expect(r.audit.at(-1)).toMatch(/No winner/);
    expect(r.comm.AMNAT?.capacity).toBe(1);
  });
});

describe('INDDIR and SUFDDIR', () => {
  const r = run([lob('AMNAT', on('Moscow'))]);

  it('score a direct hit on Moscow for AMNAT and against SOVWAR', () => {
    const hit = r.strikes[0]?.hits.find((h) => h.item.name === 'Moscow');
    expect(hit?.kind).toBe('direct');
    expect(hit?.scoring).toBe('inddir');
    expect(hit?.deaths).toBeGreaterThan(9 * BLAST_DEATHS_DIRECT);
    expect(tally(r, 'AMNAT').inddirRaw).toBeGreaterThanOrEqual(hit?.points ?? Infinity); // and its fallout
    expect(tally(r, 'SOVWAR').sufddirRaw).toBeGreaterThanOrEqual(hit?.points ?? Infinity);
  });

  it('make the striker the winner when nobody has struck back', () => {
    expect(r.winner).toBe('AMNAT');
    expect(r.standings[0]?.combatant).toBe('AMNAT');
  });

  it('show their working', () => {
    expect(r.audit.join('\n')).toMatch(/Moscow: Open flat ground: 10\.10 km/);
    expect(r.audit.join('\n')).toMatch(/Firestorm/);
  });

  it('are deterministic', () => {
    expect(run([lob('AMNAT', on('Moscow'))])).toEqual(r);
  });
});

describe('firestorms', () => {
  it('take two strikes on Toronto', () => {
    const one = run([lob('SOVWAR', on('Toronto'))]);
    expect(city(one, 'Toronto').firestorm).toBe(false);
    expect(one.audit.join('\n')).toMatch(/No firestorm yet: 1 of the 2/);
    const two = run([lob('SOVWAR', on('Toronto')), lob('SOVWAR', on('Toronto'))]);
    expect(city(two, 'Toronto').firestorm).toBe(true);
    expect(two.strikes[1]?.hits.find((h) => h.item.name === 'Toronto')?.firestorm).toBe(true);
  });

  it('take one strike on a city without skyscrapers', () => {
    const r = run([lob('SOVWAR', on('Detroit'))]);
    expect(city(r, 'Detroit').firestorm).toBe(true);
  });

  it('do not start from a strike at the edge of the kill radius', () => {
    const d = on('Detroit');
    const r = run([lob('SOVWAR', { x: d.x + kmToCourtMetres(9.5) + 0.15, y: d.y })]);
    expect(r.strikes[0]?.hits.find((h) => h.item.name === 'Detroit')?.kind).toBe('indirect');
    expect(city(r, 'Detroit').firestorm).toBe(false);
  });
});

describe('regrettable mistargetings (A13)', () => {
  it('score nothing for anybody when the target belongs to nobody playing', () => {
    const r = run([lob('SOVWAR', on('Toronto'))]);
    expect(r.mistargetings.map((m) => m.item.name)).toContain('Toronto');
    expect(tally(r, 'SOVWAR').inddirRaw).toBe(0);
    expect(r.winner).toBeUndefined();
    expect(r.audit.join('\n')).toMatch(/regrettable mistargeting/);
  });

  it('include strikes on a Combatant that is not playing this game', () => {
    const twoPlayer: WorldSituation = { ...ws, combatants: ['AMNAT', 'SOVWAR'] };
    const r = run([lob('AMNAT', on('Beijing'))], twoPlayer);
    expect(r.strikes[0]?.hits.find((h) => h.item.name === 'Beijing')?.scoring).toBe('mistargeting');
    expect(tally(r, 'AMNAT').inddirRaw).toBe(0);
  });
});

describe('own goals', () => {
  it('count only as suffering', () => {
    const r = run([lob('AMNAT', on('Detroit'))]);
    expect(tally(r, 'AMNAT').inddirRaw).toBe(0);
    expect(tally(r, 'AMNAT').sufddirRaw).toBeGreaterThan(0);
  });
});

describe('SACPOP', () => {
  it('costs the striker SUFDDIR for every point it inflicts on cities', () => {
    const r = run([lob('AMNAT', on('Moscow'))]);
    const t = tally(r, 'AMNAT');
    expect(t.wentSacpop).toBe(true);
    expect(t.sacpopPenalty).toBeCloseTo(SACPOP_PENALTY * t.cityInddirRaw, 10);
    expect(t.ratio).toBeLessThan(2);
  });

  it('is not what a strike on a silo field is', () => {
    const r = run([lob('AMNAT', on('Dombarovsky silos'))]);
    expect(tally(r, 'AMNAT').wentSacpop).toBe(false);
    expect(tally(r, 'AMNAT').ratio).toBe(Infinity);
  });

  it('leaves both sides of an exchange of cities out of contention', () => {
    const r = run([lob('AMNAT', on('Moscow')), lob('SOVWAR', on('New York'))]);
    for (const id of ['AMNAT', 'SOVWAR'] as const) expect(tally(r, id).ratio).toBeLessThan(1);
  });
});

describe('launch platforms', () => {
  it('cannot launch once struck', () => {
    const r = run([lob('SOVWAR', on('Minot missile field'))]);
    expect(r.destroyedPlatforms).toContain(find('Minot missile field').id);
  });
});

describe('EMP', () => {
  it('takes communication capacity from the Combatant whose territory is struck', () => {
    const r = run([lob('AMNAT', on('Dombarovsky silos'))]);
    expect(r.comm.SOVWAR?.capacity).toBeLessThan(1);
    expect(r.comm.AMNAT?.capacity).toBe(1);
    expect(r.comm.SOVWAR?.words).toBeLessThan(80);
  });

  it('takes more when a command site is hit', () => {
    const silo = run([lob('AMNAT', on('Dombarovsky silos'))]);
    const command = run([lob('SOVWAR', on('Cheyenne Mountain'))]);
    expect(1 - (command.comm.AMNAT?.capacity ?? 1)).toBeGreaterThan(
      1 - (silo.comm.SOVWAR?.capacity ?? 1),
    );
  });
});

describe('fallout', () => {
  it('reaches cities downwind and is scored for the striker', () => {
    const r = run([lob('AMNAT', on('Moscow'))]);
    const strike = r.strikes[0];
    expect(strike?.plume).toBeDefined();
    expect(strike?.fallout.some((f) => f.city.name === 'Moscow' && f.roentgens >= 1000)).toBe(true);
  });
});

describe('the four corrections', () => {
  const r = run([lob('AMNAT', on('Moscow')), lob('SOVWAR', on('Minot missile field'))]);

  it('are applied to every Combatant, with reasons', () => {
    const names = tally(r, 'AMNAT').corrections.map((c) => c.name);
    expect(names).toEqual([
      'Initial megatonnage',
      'Population density',
      'Land-Sea-Air distribution',
      'EMP-resistant civil defence',
    ]);
    for (const c of tally(r, 'AMNAT').corrections) expect(c.reason.length).toBeGreaterThan(10);
  });

  it('take INDDIR down for a big arsenal and up for a small one', () => {
    const mt = (id: CombatantId) => tally(r, id).corrections[0]?.factor ?? NaN;
    expect(mt('AMNAT')).toBeLessThan(1);
    expect(mt('SOUTHAF')).toBeGreaterThan(1);
  });

  it('give a spread triad less suffering than a single leg', () => {
    expect(triadDiversity({ land: 1, sea: 0, air: 0 })).toBe(0);
    expect(triadDiversity({ land: 1 / 3, sea: 1 / 3, air: 1 / 3 })).toBeCloseTo(2 / 3, 10);
    const lsa = (id: CombatantId) => tally(r, id).corrections[2]?.factor ?? NaN;
    expect(lsa('AMNAT')).toBeLessThan(lsa('INSURGENT'));
  });

  it('combine into the corrected tallies', () => {
    const t = tally(r, 'SOVWAR');
    const [mt, dens, lsa, cd] = t.corrections.map((c) => c.factor);
    expect(t.inddir).toBeCloseTo(t.inddirRaw * (mt ?? NaN) * (dens ?? NaN), 9);
    expect(t.sufddir).toBeCloseTo(t.sufddirRaw * (lsa ?? NaN) * (cd ?? NaN) + t.sacpopPenalty, 9);
  });
});

describe('the winner', () => {
  it('is the Combatant with the most favourable ratio', () => {
    const r = run([
      lob('AMNAT', on('Dombarovsky silos')),
      lob('SOVWAR', on('Minot missile field')),
      lob('SOVWAR', on('Malmstrom missile field')),
    ]);
    const ratios = r.standings.filter((t) => t.ratio !== undefined).map((t) => t.ratio ?? 0);
    expect(ratios).toEqual([...ratios].sort((a, b) => b - a));
    expect(r.winner).toBe(r.standings[0]?.combatant);
    expect(r.winner).toBe('SOVWAR');
  });
});
