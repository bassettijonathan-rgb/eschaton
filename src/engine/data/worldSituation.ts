/**
 * Unplayed nations and the default World Situation.
 */
import type { UnplayedNationDef, UnplayedNationId, WorldSituation } from '../types';

export const UNPLAYED_NATIONS: Readonly<Record<UnplayedNationId, UnplayedNationDef>> = {
  CANADA: { id: 'CANADA', name: 'Canada', capital: { lon: -75.7, lat: 45.42 } },
  ISRAEL: { id: 'ISRAEL', name: 'Israel', capital: { lon: 35.21, lat: 31.77 } },
  ITALY: { id: 'ITALY', name: 'Italy', capital: { lon: 12.5, lat: 41.9 } },
  ALBANIA: { id: 'ALBANIA', name: 'Albania', capital: { lon: 19.82, lat: 41.33 } },
  IRAN: { id: 'IRAN', name: 'Iran', capital: { lon: 51.39, lat: 35.69 } },
  IRAQ: { id: 'IRAQ', name: 'Iraq', capital: { lon: 44.36, lat: 33.31 } },
  JAPAN: { id: 'JAPAN', name: 'Japan', capital: { lon: 139.69, lat: 35.69 } },
  SIERRA_LEONE: { id: 'SIERRA_LEONE', name: 'Sierra Leone', capital: { lon: -13.23, lat: 8.48 } },
};

/**
 * A plain Sunday game: every Combatant plays, the standing economics apply,
 * the weather is unremarkable, and megatonnage follows the mean value.
 */
export const DEFAULT_WORLD_SITUATION: WorldSituation = {
  id: 'default',
  title: 'A Sunday game on the East Courts',
  summary:
    'All seven Combatants at their standing strength. Allocation by the mean value of each Combatant’s recorded ratios. No TRIGSIT yet: the game-master writes one at the table.',
  combatants: ['AMNAT', 'SOVWAR', 'REDCHI', 'LIBSYR', 'SOUTHAF', 'INDPAK', 'INSURGENT'],
  economics: {},
  forces: {
    AMNAT: { land: 40, sea: 520, air: 60 },
    SOVWAR: { land: 190, sea: 420, air: 50 },
    REDCHI: { land: 90, sea: 110, air: 20 },
    LIBSYR: { land: 14, sea: 12, air: 6 },
    SOUTHAF: { land: 4, sea: 10, air: 3 },
    INDPAK: { land: 45, sea: 60, air: 14 },
    INSURGENT: { land: 0, sea: 0, air: 0 },
  },
  weather: {
    6: { windToward: 80, windKmh: 25, precipitation: 'none', cloud: 0.3 },
    7: { windToward: 70, windKmh: 30, precipitation: 'none', cloud: 0.6 },
    8: { windToward: 90, windKmh: 20, precipitation: 'none', cloud: 0.4 },
    9: { windToward: 100, windKmh: 15, precipitation: 'rain', cloud: 0.8 },
  },
  allocationMethod: 'meanValue',
  howitzerAt: { lon: -82.95, lat: 42.31 },
  clock: { start: 13 * 60 + 30, end: 16 * 60 },
  seed: 1996,
};
