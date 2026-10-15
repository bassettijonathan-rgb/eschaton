import { describe, expect, it } from 'vitest';
import { TARGETS } from './data/targets';
import { DEFAULT_WORLD_SITUATION } from './data/worldSituation';
import {
  RADIATION_THRESHOLD_ROENTGENS,
  empHardening,
  endstatKillRadius,
  falloutDose,
  firestormThreshold,
  hotlineWords,
  killRadiusKm,
  plumeFor,
  plumeOutline,
  radiationCasualties,
  weatherAt,
} from './effects';
import { courtMetresToKm, kmToCourtMetres, project } from './projection';
import type { ScenarioWeather, TargetItem } from './types';

const ws = DEFAULT_WORLD_SITUATION;
const find = (name: string): TargetItem => {
  const t = TARGETS.find((x) => x.name === name);
  if (!t) throw new Error(name);
  return t;
};
const dry: ScenarioWeather = { windToward: 90, windKmh: 20, precipitation: 'none', cloud: 0 };

describe('kill radius', () => {
  it('is 10.1 km for a 5 Mt strike on Peoria, flat ground', () => {
    const peoria = find('Peoria');
    expect(peoria.terrain).toBe('flat');
    expect(killRadiusKm(peoria, weatherAt(ws, peoria.at)).value).toBeCloseTo(10.1, 10);
    expect(courtMetresToKm(endstatKillRadius(ws)(peoria))).toBeCloseTo(10.1, 10);
  });

  it('is about 1.8 cm of court at the A6 scale', () => {
    expect(kmToCourtMetres(10.1)).toBeCloseTo(0.0184, 4);
  });

  it('shrinks over broken ground: flat > coastal > rolling > mountainous', () => {
    const r = (name: string) => killRadiusKm(find(name), dry).value;
    expect(r('Peoria')).toBeGreaterThan(r('New York') / 0.9); // New York is coastal and high-rise
    expect(r('Kiev')).toBeLessThan(r('Peoria'));
    expect(r('Provo')).toBeLessThan(r('Kiev'));
  });

  it('shrinks under scenario rain or snow over the target', () => {
    const peoria = find('Peoria');
    const snow = killRadiusKm(peoria, { ...dry, precipitation: 'snow' });
    expect(snow.value).toBeLessThan(10.1);
    expect(snow.steps.join(' ')).toMatch(/Scenario snow/);
  });
});

describe('firestorms', () => {
  it('need two strikes in Toronto because of its skyscrapers, one elsewhere', () => {
    expect(firestormThreshold(find('Toronto'))).toBe(2);
    expect(firestormThreshold(find('Detroit'))).toBe(1);
  });
});

describe('radiation', () => {
  it('kills 6.36 per hundred at 1,000 roentgens and shortens the other 93.64 lives', () => {
    const r = radiationCasualties(100, 1000);
    expect(r.deaths).toBeCloseTo(6.36, 10);
    expect(r.shortened).toBeCloseTo(93.64, 10);
  });

  it('counts nobody below the 100-roentgen threshold', () => {
    expect(radiationCasualties(100, RADIATION_THRESHOLD_ROENTGENS - 1)).toEqual({
      deaths: 0,
      shortened: 0,
    });
    expect(radiationCasualties(100, RADIATION_THRESHOLD_ROENTGENS).deaths).toBeCloseTo(0.636, 10);
  });

  it('scales linearly with dose and never kills more than are there', () => {
    expect(radiationCasualties(100, 2000).deaths).toBeCloseTo(12.72, 10);
    expect(radiationCasualties(5, 1e7).deaths).toBe(5);
  });
});

describe('fallout', () => {
  const at = project(find('Moscow').at);
  const plume = plumeFor(at, dry); // wind toward the east
  const east = (km: number) => ({ x: at.x + kmToCourtMetres(km), y: at.y });

  it('drifts downwind', () => {
    expect(falloutDose(plume, east(100))).toBeGreaterThan(falloutDose(plume, east(-100)));
    expect(falloutDose(plume, east(100))).toBeGreaterThan(RADIATION_THRESHOLD_ROENTGENS);
    expect(falloutDose(plume, { x: at.x, y: at.y + kmToCourtMetres(100) })).toBeLessThan(1);
  });

  it('falls off with distance', () => {
    expect(falloutDose(plume, east(50))).toBeGreaterThan(falloutDose(plume, east(200)));
  });

  it('comes down sooner in scenario rain', () => {
    const wet = plumeFor(at, { ...dry, precipitation: 'rain' });
    expect(falloutDose(wet, east(50))).toBeGreaterThan(falloutDose(plume, east(50)));
    expect(falloutDose(wet, east(400))).toBeLessThan(falloutDose(plume, east(400)));
  });

  it('has an outline that runs downwind of ground zero', () => {
    const outline = plumeOutline(plume);
    expect(outline.length).toBeGreaterThan(10);
    const maxX = Math.max(...outline.map((p) => p.x));
    expect(courtMetresToKm(maxX - at.x)).toBeGreaterThan(150);
  });
});

describe('EMP', () => {
  it('is shielded by civil-defence spending, up to a cap', () => {
    expect(empHardening(0, 100)).toBe(0);
    expect(empHardening(2, 100)).toBeCloseTo(0.2, 10);
    expect(empHardening(50, 100)).toBe(0.6);
    expect(empHardening(1, 0)).toBe(0);
  });

  it('limits what the hotline carries', () => {
    expect(hotlineWords(1)).toBe(80);
    expect(hotlineWords(0.5)).toBe(40);
    expect(hotlineWords(-1)).toBe(0);
  });
});
