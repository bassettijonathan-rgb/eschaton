import { describe, expect, it } from 'vitest';
import { TARGETS } from './data/targets';
import { COMBATANTS } from './data/combatants';
import { TERRITORIES, ownerAt, territoryAt } from './territory';

describe('the political map', () => {
  it('loads the world', () => {
    expect(TERRITORIES.length).toBeGreaterThan(150);
  });

  it('knows whose territory a place is', () => {
    expect(ownerAt({ lon: -98, lat: 39 })).toBe('AMNAT'); // Kansas
    expect(ownerAt({ lon: 37.62, lat: 55.75 })).toBe('SOVWAR'); // Moscow
    expect(ownerAt({ lon: 104, lat: 35 })).toBe('REDCHI');
    expect(ownerAt({ lon: -79.38, lat: 43.7 })).toBe('CANADA');
    expect(ownerAt({ lon: -40, lat: 30 })).toBeUndefined(); // the Atlantic
    expect(territoryAt({ lon: 2.35, lat: 48.86 })?.name).toBe('France');
  });

  it('draws the inner-German border back in', () => {
    expect(ownerAt({ lon: 13.4, lat: 52.52 })).toBe('SOVWAR'); // East Berlin
    expect(ownerAt({ lon: 11.62, lat: 52.13 })).toBe('SOVWAR'); // Magdeburg
    expect(ownerAt({ lon: 10.0, lat: 53.55 })).toBe('AMNAT'); // Hamburg
    expect(ownerAt({ lon: 11.58, lat: 48.14 })).toBe('AMNAT'); // Munich
  });

  it('puts every inland target item in its owner’s territory', () => {
    const wrong = TARGETS.filter((t) => t.terrain !== 'sea' && t.terrain !== 'coastal')
      .map((t) => ({ t, owner: ownerAt(t.at) }))
      .filter(({ t, owner }) => owner !== t.owner)
      .map(({ t, owner }) => `${t.id} lies in ${String(owner)}`);
    expect(wrong).toEqual([]);
  });

  it('keeps sea items at sea', () => {
    for (const t of TARGETS.filter((x) => x.terrain === 'sea'))
      expect(ownerAt(t.at), t.id).toBeUndefined();
  });

  it('stands every Combatant in its own territory, except the cell, which has none', () => {
    for (const c of Object.values(COMBATANTS)) {
      if (c.id === 'INSURGENT') expect(ownerAt(c.stand)).toBe('CANADA');
      else expect(ownerAt(c.stand), c.id).toBe(c.id);
    }
  });
});

describe('across the antimeridian', () => {
  it('finds Chukotka on both sides of 180°', () => {
    expect(ownerAt({ lon: 175, lat: 66 })).toBe('SOVWAR');
    expect(ownerAt({ lon: -175, lat: 66 })).toBe('SOVWAR');
    expect(ownerAt({ lon: -170, lat: 60 })).toBeUndefined(); // the Bering Sea
  });
});
