import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('replays the same stream from the same seed', () => {
    const a = createRng(1996);
    const b = createRng(1996);
    const xs = Array.from({ length: 50 }, () => a.next());
    const ys = Array.from({ length: 50 }, () => b.next());
    expect(xs).toEqual(ys);
  });

  it('gives different streams for neighbouring seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it('stays in [0, 1) and covers the interval roughly evenly', () => {
    const rng = createRng(8);
    const bins = new Array<number>(10).fill(0);
    for (let i = 0; i < 10_000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const bin = Math.floor(x * 10);
      bins[bin] = (bins[bin] ?? 0) + 1;
    }
    for (const count of bins) expect(count).toBeGreaterThan(900);
  });

  it('draws inclusive integers, like the old red Yahtzee dice', () => {
    const rng = createRng(11);
    const seen = new Set<number>();
    for (let i = 0; i < 600; i++) seen.add(rng.int(1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(() => rng.int(3, 2)).toThrow(RangeError);
  });

  it('resumes from a saved state', () => {
    const rng = createRng(42);
    rng.next();
    const saved = rng.state();
    const expected = [rng.next(), rng.next()];
    const resumed = createRng(saved);
    expect([resumed.next(), resumed.next()]).toEqual(expected);
  });
});
