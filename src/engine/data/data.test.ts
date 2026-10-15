import { describe, expect, it } from 'vitest';
import { project } from '../projection';
import { THEATER_BOUNDS, contains } from '../theater';
import {
  COMBATANT_IDS,
  GARMENT_KINDS,
  TARGET_TYPES,
  UNPLAYED_NATION_IDS,
  type TargetItem,
} from '../types';
import { validateWorldSituation } from '../validate';
import { COMBATANTS } from './combatants';
import { pointValue } from './points';
import { GARMENTS, GARMENT_FOR_TARGET, TARGETS, garmentFor } from './targets';
import { DEFAULT_WORLD_SITUATION } from './worldSituation';

const owners = new Set<string>([...COMBATANT_IDS, ...UNPLAYED_NATION_IDS]);
const PLATFORM_FOR_TYPE = {
  'missile-installation': 'land',
  'silo-cluster': 'land',
  'bomber-squadron': 'air',
  submarine: 'sea',
} as const;

describe('Combatants', () => {
  it('are spelled as the novel spells them', () => {
    expect(Object.values(COMBATANTS).map((c) => c.code)).toEqual([
      'AMNAT',
      'SOVWAR',
      'REDCHI',
      'LIBSYR',
      'SOUTHAF',
      'INDPAK',
      'INSURGENT',
    ]);
    expect(COMBATANTS.LIBSYR.expandsTo?.code).toBe('IRLIBSYR');
  });

  it('have the team sizes of the chapter', () => {
    expect(COMBATANTS.AMNAT.teamSize).toEqual({ min: 3, max: 3 });
    expect(COMBATANTS.SOVWAR.teamSize).toEqual({ min: 3, max: 3 });
    expect(COMBATANTS.REDCHI.teamSize).toEqual({ min: 1, max: 2 });
    expect(COMBATANTS.LIBSYR.teamSize).toEqual({ min: 1, max: 2 });
  });

  it('carry eight MIRVs per launch for the superpowers and fewer for the rest (A10)', () => {
    expect(COMBATANTS.AMNAT.mirvCap).toBe(8);
    expect(COMBATANTS.SOVWAR.mirvCap).toBe(8);
    for (const id of ['REDCHI', 'LIBSYR', 'SOUTHAF', 'INDPAK', 'INSURGENT'] as const)
      expect(COMBATANTS[id].mirvCap).toBeLessThan(8);
  });

  it('have complete, consistent profiles', () => {
    for (const c of Object.values(COMBATANTS)) {
      const { land, sea, air } = c.landSeaAir;
      expect(land + sea + air).toBeCloseTo(1, 9);
      const traits = c.headOfState;
      for (const t of [
        traits.resolve,
        traits.riskTolerance,
        traits.pactFidelity,
        traits.bluffing,
        traits.sacpopReadiness,
      ]) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(1);
      }
      const ethnic = c.demographics.ethnic.reduce((s, x) => s + x.share, 0);
      const religious = c.demographics.religious.reduce((s, x) => s + x.share, 0);
      expect(ethnic).toBeCloseTo(1, 9);
      expect(religious).toBeCloseTo(1, 9);
      expect(contains(THEATER_BOUNDS, project(c.stand).x, project(c.stand).y)).toBe(true);
    }
  });

  it('own a launch platform for every leg of their Land-Sea-Air distribution, and none for legs they lack', () => {
    for (const c of Object.values(COMBATANTS)) {
      if (c.fixedWarheads !== undefined) continue; // the howitzer is not a garment
      for (const leg of ['land', 'sea', 'air'] as const) {
        const has = TARGETS.some((t) => t.owner === c.id && t.platform === leg);
        expect(has, `${c.id} ${leg}`).toBe(c.landSeaAir[leg] > 0);
      }
    }
  });
});

describe('target items', () => {
  it('map every target type to its garment as A2 and A3 read them', () => {
    expect(GARMENT_FOR_TARGET.MAMA).toBe('tshirt');
    expect(GARMENT_FOR_TARGET.CONFORCON).toBe('red-shorts');
    expect(GARMENT_FOR_TARGET.SSTRAC).toBe('gray-shorts');
    expect(GARMENT_FOR_TARGET['missile-installation']).toBe('sock-boys-tennis');
    expect(GARMENT_FOR_TARGET['silo-cluster']).toBe('sock-boys-street');
    expect(GARMENT_FOR_TARGET['antimissile-installation']).toBe('sock-girls-bunny');
    expect(GARMENT_FOR_TARGET['bomber-squadron']).toBe('sock-girls-plain');
    expect(GARMENT_FOR_TARGET.submarine).toBe('sneaker');
    for (const t of ['enrichment-plant', 'reactor', 'fusion-lab'] as const)
      expect(GARMENT_FOR_TARGET[t]).toBe('armband');
    for (const t of [
      'airfield',
      'bridge',
      'satellite-site',
      'carrier-group',
      'power-plant',
      'rail-convergence',
    ] as const)
      expect(GARMENT_FOR_TARGET[t]).toBe('towel');
    expect(new Set(Object.values(GARMENT_FOR_TARGET))).toEqual(new Set(GARMENT_KINDS));
    expect(Object.keys(GARMENT_FOR_TARGET).sort()).toEqual([...TARGET_TYPES].sort());
    expect(GARMENTS['gray-shorts'].legendNote).toMatch(/red shorts with gray trim/);
  });

  it('have unique ids and known owners', () => {
    const ids = TARGETS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TARGETS) expect(owners.has(t.owner), t.id).toBe(true);
  });

  it('lie on the theater', () => {
    for (const t of TARGETS) {
      const p = project(t.at);
      expect(contains(THEATER_BOUNDS, p.x, p.y), t.id).toBe(true);
    }
  });

  it('give MAMAs a population and nothing else one', () => {
    for (const t of TARGETS) {
      if (t.type === 'MAMA') expect(t.population, t.id).toBeGreaterThan(0);
      else expect(t.population, t.id).toBeUndefined();
    }
  });

  it('let only submarines and carrier groups move', () => {
    for (const t of TARGETS)
      if (t.mobile) expect(['submarine', 'carrier-group'], t.id).toContain(t.type);
  });

  it('launch only from silo and missile socks, bomber socks and submarine shoes (A9)', () => {
    for (const t of TARGETS) {
      if (!t.platform) continue;
      expect(Object.keys(PLATFORM_FOR_TYPE), t.id).toContain(t.type);
      expect(t.platform, t.id).toBe(PLATFORM_FOR_TYPE[t.type as keyof typeof PLATFORM_FOR_TYPE]);
    }
  });

  it('include the places the chapter names', () => {
    const names = new Set(TARGETS.map((t) => t.name));
    for (const n of [
      'Peoria',
      'Toronto',
      'Karachi',
      'Tel Aviv',
      'Volgograd',
      'Provo',
      'Ostrava',
      'Washington',
      'Portsmouth enrichment plant, Ohio',
      'Big Ear station, Sakhalin',
      'Annular Fusion lab, North Syracuse',
      'Annular Fusion lab, Presque Isle',
      'Annular Fusion lab, Chyonskrg',
      'Annular Fusion lab, Pliscu',
    ])
      expect(names.has(n), n).toBe(true);
    expect(TARGETS.find((t) => t.name === 'Toronto')?.highRise).toBe(true);
    expect(TARGETS.find((t) => t.name === 'Peoria')?.terrain).toBe('flat');
  });

  it('do not lie on top of one another', () => {
    const margin = 0.02; // two centimetres of court between garments
    const rect = (t: TargetItem) => {
      const { x, y } = project(t.at);
      const { width, depth } = garmentFor(t).footprint;
      return { x, y, hw: width / 2, hd: depth / 2 };
    };
    const rects = TARGETS.map((t) => ({ t, r: rect(t) }));
    const clashes: string[] = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        if (!a || !b) continue;
        const overlapX = Math.abs(a.r.x - b.r.x) < a.r.hw + b.r.hw + margin;
        const overlapY = Math.abs(a.r.y - b.r.y) < a.r.hd + b.r.hd + margin;
        if (overlapX && overlapY) clashes.push(`${a.t.id} / ${b.t.id}`);
      }
    }
    expect(clashes).toEqual([]);
  });
});

describe('point weights (A11)', () => {
  const byName = (name: string) => {
    const t = TARGETS.find((x) => x.name === name);
    if (!t) throw new Error(name);
    return t;
  };

  it('scale MAMAs by population: a 10-million city is worth 20', () => {
    expect(pointValue(byName('Beijing'))).toBe(20);
    expect(pointValue(byName('Peoria'))).toBeCloseTo(0.7, 9);
  });

  it('weight the other items as A11 says', () => {
    expect(pointValue(byName('Ramstein airfield'))).toBe(3);
    expect(pointValue(byName('Fort Hood'))).toBe(4);
    expect(pointValue(byName('Cheyenne Mountain'))).toBe(10);
    expect(pointValue(byName('Kursk reactor'))).toBe(8);
    expect(pointValue(byName('Annular Fusion lab, Presque Isle'))).toBe(15);
    expect(pointValue(byName('Minot missile field'))).toBe(6);
    expect(pointValue(byName('Atlantic missile submarine'))).toBe(7);
  });
});

describe('default World Situation', () => {
  it('is valid', () => {
    expect(validateWorldSituation(DEFAULT_WORLD_SITUATION, COMBATANTS)).toEqual([]);
  });

  it('catches a broken one', () => {
    const problems = validateWorldSituation(
      {
        ...DEFAULT_WORLD_SITUATION,
        combatants: ['AMNAT', 'AMNAT', 'INSURGENT'],
        economics: {
          AMNAT: { gnp: 100, militaryBudget: 200, strategicSpending: 1, civilDefenseSpending: 0 },
        },
        howitzerAt: undefined as never,
      },
      COMBATANTS,
    );
    expect(problems).toContain('AMNAT is listed twice');
    expect(problems).toContain('AMNAT: military budget must lie between 0 and GNP');
    expect(problems).toContain('the insurgent cell plays but its howitzer has no emplacement');
  });
});
