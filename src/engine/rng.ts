/**
 * Seeded pseudo-random numbers for the engine. Every random choice in a game
 * draws from one of these, so a game replays exactly from its seed and order log.
 *
 * sfc32, seeded through splitmix32 so that nearby seeds give unrelated streams.
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  /** The generator's internal state, for saving a game mid-play. */
  state(): readonly [number, number, number, number];
}

function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export function createRng(seed: number | readonly [number, number, number, number]): Rng {
  let a: number, b: number, c: number, d: number;
  if (typeof seed === 'number') {
    const mix = splitmix32(seed);
    a = mix();
    b = mix();
    c = mix();
    d = mix();
  } else {
    [a, b, c, d] = seed;
  }

  const nextU32 = (): number => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t;
  };

  return {
    next: () => nextU32() / 0x1_0000_0000,
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
        throw new RangeError(`bad integer range [${String(min)}, ${String(max)}]`);
      }
      return min + Math.floor((nextU32() / 0x1_0000_0000) * (max - min + 1));
    },
    state: () => [a, b, c, d] as const,
  };
}
