import { describe, expect, it } from 'vitest';
import {
  COURTS,
  COURT_CELL_LENGTH,
  COURT_CELL_WIDTH,
  THEATER_LENGTH,
  THEATER_WIDTH,
  courtAtPoint,
} from './theater';

describe('theater', () => {
  it('is four courts with run-off, 73.15 m by 36.575 m, exactly 2:1', () => {
    expect(COURTS.map((c) => c.number)).toEqual([6, 7, 8, 9]);
    expect(THEATER_WIDTH).toBeCloseTo(73.15, 6);
    expect(THEATER_LENGTH).toBeCloseTo(36.575, 6);
    expect(THEATER_WIDTH / THEATER_LENGTH).toBeCloseTo(2, 9);
  });

  it('lays the courts contiguously from west to east', () => {
    for (let i = 1; i < COURTS.length; i++) {
      expect(COURTS[i]?.cell.minX).toBeCloseTo(COURTS[i - 1]?.cell.maxX ?? NaN, 9);
    }
    expect(COURTS[0]?.cell.minX).toBeCloseTo(-THEATER_WIDTH / 2, 9);
    expect(COURTS[3]?.cell.maxX).toBeCloseTo(THEATER_WIDTH / 2, 9);
  });

  it('centres each doubles court in its cell with its long axis north-south', () => {
    for (const court of COURTS) {
      const { playingArea: p, cell } = court;
      expect(p.maxY - p.minY).toBeCloseTo(23.77, 6);
      expect(p.maxX - p.minX).toBeCloseTo(10.97, 6);
      expect(p.minX - cell.minX).toBeCloseTo(cell.maxX - p.maxX, 9);
      expect(cell.maxX - cell.minX).toBeCloseTo(COURT_CELL_WIDTH, 9);
      expect(cell.maxY - cell.minY).toBeCloseTo(COURT_CELL_LENGTH, 9);
    }
  });

  it('finds the court under a point, and none off the theater', () => {
    expect(courtAtPoint(-30, 0)?.number).toBe(6);
    expect(courtAtPoint(-1, 10)?.number).toBe(7);
    expect(courtAtPoint(1, -10)?.number).toBe(8);
    expect(courtAtPoint(30, 0)?.number).toBe(9);
    expect(courtAtPoint(40, 0)).toBeUndefined();
    expect(courtAtPoint(0, 20)).toBeUndefined();
  });
});
