import { describe, expect, it } from 'vitest';
import { MAP_CLEARANCE, distanceToRect, garmentRects, layoutApparatus } from './apparatus';
import { COMBATANTS } from './data/combatants';
import { DEFAULT_WORLD_SITUATION } from './data/worldSituation';
import { courtAtPoint } from './theater';

const rects = garmentRects();
const layout = layoutApparatus(DEFAULT_WORLD_SITUATION, COMBATANTS, rects);

describe('the apparatus layout', () => {
  it('stands every Combatant’s players and one white bucket on the courts', () => {
    for (const id of DEFAULT_WORLD_SITUATION.combatants) {
      const players = layout.filter((a) => a.owner === id && a.kind === 'player');
      expect(players).toHaveLength(COMBATANTS[id].teamSize.min);
      expect(layout.filter((a) => a.owner === id && a.kind === 'bucket')).toHaveLength(1);
    }
  });

  it('keeps every piece of apparatus clear of every garment: the apparatus is not the map', () => {
    for (const a of layout)
      for (const r of rects)
        expect(distanceToRect(a.at, r), `${a.id} / ${r.item.id}`).toBeGreaterThanOrEqual(
          a.radius + MAP_CLEARANCE - 1e-9,
        );
  });

  it('keeps apparatus from overlapping', () => {
    for (let i = 0; i < layout.length; i++)
      for (let j = i + 1; j < layout.length; j++) {
        const a = layout[i];
        const b = layout[j];
        if (!a || !b) continue;
        expect(
          Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y),
          `${a.id} / ${b.id}`,
        ).toBeGreaterThanOrEqual(a.radius + b.radius);
      }
  });

  it("puts Lord's cart on Court 7, in the ad service box", () => {
    const cart = layout.find((a) => a.kind === 'cart');
    expect(cart && courtAtPoint(cart.at.x, cart.at.y)?.number).toBe(7);
    // Between the net and the service line, east of the centre service line.
    const court7CentreX = -18.2875 / 2;
    expect(cart?.at.y).toBeGreaterThan(0);
    expect(cart?.at.y).toBeLessThan(6.4);
    expect(cart?.at.x).toBeGreaterThan(court7CentreX);
  });

  it('stands AMNAT on Court 6 and SOVWAR on Court 8, where Lord runs messages between them', () => {
    const court = (id: string) => {
      const p = layout.find((a) => a.id === id);
      return p && courtAtPoint(p.at.x, p.at.y)?.number;
    };
    expect(court('amnat-player-1')).toBe(6);
    expect(court('sovwar-player-1')).toBe(8);
  });

  it('is deterministic', () => {
    expect(layoutApparatus(DEFAULT_WORLD_SITUATION, COMBATANTS, rects)).toEqual(layout);
  });
});
