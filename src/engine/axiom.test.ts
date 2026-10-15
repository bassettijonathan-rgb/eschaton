import { describe, expect, it } from 'vitest';
import { layoutApparatus } from './apparatus';
import { apparatusSolids, checkMove, firstStrike, type SolidKind } from './axiom';
import { COMBATANTS } from './data/combatants';
import { TARGETS } from './data/targets';
import { TRIGSIT_PRECEDENTS } from './data/trigsits';
import { DEFAULT_WORLD_SITUATION } from './data/worldSituation';
import { endstatKillRadius } from './effects';
import { apply, itemsOf, newGame, type Action, type GameState } from './game';
import { platformsFor, resolveLob, solveSpeed } from './lob';
import { vec } from './physics';
import { project } from './projection';
import { createRng } from './rng';
import { through } from './testing';
import type { CombatantId, LonLat } from './types';

const ws = DEFAULT_WORLD_SITUATION;
const solids = apparatusSolids(layoutApparatus(ws, COMBATANTS));
const solid = (id: string) => {
  const s = solids.find((x) => x.id === id);
  if (!s) throw new Error(id);
  return s;
};
const find = (name: string) => {
  const t = TARGETS.find((x) => x.name === name);
  if (!t) throw new Error(name);
  return t;
};
const ELEVATION = (55 * Math.PI) / 180;
const SPIN = 1500;

function run(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce((s, a) => {
    const o = apply(s, a);
    if (!o.ok) throw new Error(`${a.type} refused: ${o.problems.join('; ')}`);
    return o.state;
  }, state);
}

const ENDORSERS: CombatantId[] = ['AMNAT', 'SOVWAR', 'REDCHI', 'LIBSYR'];
function toPlay(): GameState {
  return run(
    newGame(ws),
    ...ENDORSERS.map((by): Action => ({ type: 'endorse', by })),
    { type: 'setTrigsit', trigsit: TRIGSIT_PRECEDENTS[1] ?? { id: 'x', title: 'x', events: [] } },
    ...ENDORSERS.map((by): Action => ({ type: 'agreeTrigsit', by })),
    { type: 'closeSummit' },
    ...(['AMNAT', 'SOVWAR', 'REDCHI'] as const).map((by): Action => ({
      type: 'setDefcon',
      by,
      level: 6,
    })),
  );
}

describe('the map is not the territory (section 1.7)', () => {
  const cases: [SolidKind, string, CombatantId, string, number][] = [
    ['player', 'sovwar-player-1', 'AMNAT', 'Minot missile field', 1.0],
    ['racquet', 'sovwar-player-3-racquet', 'REDCHI', 'Delingha missile base', 1.2],
    ['bucket', 'sovwar-bucket', 'AMNAT', 'Minot missile field', 0.15],
    ['cart', 'cart', 'SOVWAR', 'Dombarovsky silos', 0.5],
  ];

  it.each(cases)(
    'a ball that strikes a %s scores nothing and is logged off the map',
    (kind, id, by, platform, z) => {
      const target = solid(id);
      const order = through(by, platform, target, z);
      const lob = resolveLob(order, ws, createRng(1), endstatKillRadius(ws));
      const d = lob.detonations[0];
      expect(d?.struck?.kind).toBe(kind);
      expect(d?.struck?.id).toBe(id);
      expect(d?.offMap).toBe(true);
      expect(d?.hits).toEqual([]);
      // Without the apparatus, the same swing would have come down on the map.
      const bare = resolveLob(order, ws, createRng(1), endstatKillRadius(ws), { apparatus: [] });
      expect(bare.detonations[0]?.offMap).toBe(false);
    },
  );

  it('gives no points for hitting anybody real, and says why', () => {
    const s0 = toPlay();
    const s = run(s0, {
      type: 'launch',
      order: through('AMNAT', 'Minot missile field', solid('sovwar-bucket'), 0.15),
    });
    const strike = s.endstat.strikes[0];
    expect(strike?.detonation.struck?.label).toBe("SOVWAR's bucket");
    expect(strike?.hits).toEqual([]);
    expect(strike?.working.join(' ')).toContain('not the territory');
    for (const t of Object.values(s.endstat.tallies)) {
      expect(t.inddir).toBe(0);
      expect(t.sufddir).toBe(0);
    }
    expect(s.log.at(-1)?.text).toMatch(
      /SOVWAR's bucket: the apparatus of the game, not the territory/,
    );
    // The ball is spent all the same.
    expect(s.supply.buckets.AMNAT).toBe((s0.supply.buckets.AMNAT ?? 0) - 1);
  });

  it('lets a ball leave the launchman’s own racquet', () => {
    const r = solid('amnat-player-1-racquet');
    const inside = vec(r.x, r.y, 1.1);
    const outside = vec(r.x + 0.02, r.y, 1.12);
    expect(firstStrike(inside, outside, solids)).toBeUndefined();
    expect(firstStrike(vec(r.x - 0.4, r.y, 1.1), inside, solids)?.solid.id).toBe(r.id);
  });
});

describe('snow on the map', () => {
  it('is snowing on the map, not the territory: court weather changes nothing EndStat computes', () => {
    const moscow = (): Action => {
      const platform = platformsFor('AMNAT', ws).find((p) => p.name === 'Minot missile field');
      const to = find('Moscow').at;
      const s = solveSpeed(project(platform?.at ?? to), project(to), ELEVATION, SPIN);
      if (!platform || !s) throw new Error('no shot');
      return {
        type: 'launch',
        order: {
          combatant: 'AMNAT',
          platformId: platform.id,
          warheads: 1,
          swing: {
            bearing: s.bearing,
            elevation: ELEVATION,
            speed: s.speed,
            topspinRpm: SPIN,
            timing: 0,
          },
          aimAt: to,
        },
      };
    };
    const dry = run(toPlay(), moscow());
    const snowing = run(
      toPlay(),
      { type: 'courtWeather', precipitation: 'snow' },
      { type: 'weatherAppeal', by: 'SOVWAR' },
      moscow(),
    );
    expect(snowing.courtWeather).toBe('snow');
    expect(snowing.lobs).toEqual(dry.lobs);
    expect(snowing.endstat).toEqual(dry.endstat);
    expect(snowing.log.map((e) => e.text).join(' ')).toContain(
      'it is snowing on the map, not the territory. Nothing is recalculated.',
    );
  });

  it('has nothing to appeal while the courts are dry', () => {
    expect(apply(toPlay(), { type: 'weatherAppeal', by: 'SOVWAR' }).ok).toBe(false);
  });
});

describe('moving the garments', () => {
  const sub = find('Atlantic missile submarine');
  const nudge = (p: LonLat, dLon: number, dLat = 0): LonLat => ({
    lon: p.lon + dLon,
    lat: p.lat + dLat,
  });

  it('refuses to move anything but a submarine or carrier group: that is tampering with the map', () => {
    const karachi = find('Karachi');
    const to = nudge(karachi.at, -3);
    const o = apply(toPlay(), { type: 'moveItem', by: 'LIBSYR', item: karachi.id, to });
    expect(o.ok).toBe(false);
    expect(o.problems.join()).toMatch(/tampering with the map/);
    const god = run(toPlay(), { type: 'setHumanGod', on: true });
    expect(apply(god, { type: 'moveItem', by: 'LIBSYR', item: karachi.id, to }).ok).toBe(false);
    expect(checkMove(find('Moscow'), 'SOVWAR', find('Moscow').at, find('Moscow').at).ok).toBe(
      false,
    );
  });

  it('lets a submarine move at sea, by its owner, as far as its data allows', () => {
    const s = toPlay();
    const to = nudge(sub.at, 3);
    expect(apply(s, { type: 'moveItem', by: 'SOVWAR', item: sub.id, to }).problems.join()).toMatch(
      /Only AMNAT/,
    );
    expect(
      apply(s, {
        type: 'moveItem',
        by: 'AMNAT',
        item: sub.id,
        to: nudge(sub.at, 30),
      }).problems.join(),
    ).toMatch(/at most 450 km/);
    expect(
      apply(s, {
        type: 'moveItem',
        by: 'AMNAT',
        item: sub.id,
        to: { lon: -90, lat: 40 },
      }).problems.join(),
    ).toMatch(/at sea/);
    const moved = run(s, { type: 'moveItem', by: 'AMNAT', item: sub.id, to });
    expect(itemsOf(moved).find((t) => t.id === sub.id)?.at).toEqual(to);
    expect(moved.clock).toBeGreaterThan(s.clock);
    // It launches from where it is now.
    const platform = platformsFor('AMNAT', ws, itemsOf(moved)).find((p) => p.id === sub.id);
    const target = find('Moscow').at;
    const aim = solveSpeed(project(to), project(target), ELEVATION, SPIN);
    if (!platform || !aim) throw new Error('no shot');
    const fired = run(moved, {
      type: 'launch',
      order: {
        combatant: 'AMNAT',
        platformId: sub.id,
        warheads: 1,
        swing: {
          bearing: aim.bearing,
          elevation: ELEVATION,
          speed: aim.speed,
          topspinRpm: SPIN,
          timing: 0,
        },
        aimAt: target,
      },
    });
    expect(fired.lobs[0]?.platform.at).toEqual(to);
    expect(fired.lobs[0]?.detonations[0]?.hits.some((h) => h.item.name === 'Moscow')).toBe(true);
  });
});
