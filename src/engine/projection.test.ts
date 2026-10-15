import { describe, expect, it } from 'vitest';
import {
  KM_PER_COURT_METRE,
  courtForLonLat,
  greatCircleKm,
  kmToCourtMetres,
  project,
  unproject,
} from './projection';
import { THEATER_BOUNDS } from './theater';

describe('A6 projection', () => {
  it('puts the map corners on the theater corners and Greenwich at the centre', () => {
    expect(project({ lon: -180, lat: -90 })).toEqual({
      x: THEATER_BOUNDS.minX,
      y: THEATER_BOUNDS.minY,
    });
    const ne = project({ lon: 180, lat: 90 });
    expect(ne.x).toBeCloseTo(THEATER_BOUNDS.maxX, 9);
    expect(ne.y).toBeCloseTo(THEATER_BOUNDS.maxY, 9);
    expect(project({ lon: 0, lat: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('round-trips', () => {
    const p = { lon: -89.6, lat: 40.7 };
    const back = unproject(project(p));
    expect(back.lon).toBeCloseTo(p.lon, 9);
    expect(back.lat).toBeCloseTo(p.lat, 9);
  });

  it('assigns the quarter-worlds to Courts 6 to 9', () => {
    expect(courtForLonLat({ lon: -120, lat: 40 })).toBe(6); // the American west
    expect(courtForLonLat({ lon: -77, lat: 39 })).toBe(7); // Washington
    expect(courtForLonLat({ lon: -13.2, lat: 8.5 })).toBe(7); // Sierra Leone, the parley
    expect(courtForLonLat({ lon: 37.6, lat: 55.8 })).toBe(8); // Moscow
    expect(courtForLonLat({ lon: 116.4, lat: 39.9 })).toBe(9); // Beijing
  });

  it('is about 548 km per court metre, so the Peoria radius is about 1.8 cm', () => {
    expect(KM_PER_COURT_METRE).toBeCloseTo(547.85, 1);
    expect(kmToCourtMetres(10.1)).toBeCloseTo(0.0184, 4);
  });

  it('measures great-circle distances', () => {
    // New York to London is about 5,570 km.
    expect(greatCircleKm({ lon: -74.0, lat: 40.7 }, { lon: -0.13, lat: 51.5 })).toBeCloseTo(
      5570,
      -2,
    );
  });
});
