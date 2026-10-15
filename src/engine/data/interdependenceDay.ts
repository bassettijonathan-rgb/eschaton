/**
 * Interdependence Day, Y.D.A.U.: the chapter's game, Sunday 8 November on
 * the East Courts. The World Situation, the cast and the TRIGSIT follow the
 * chapter's order of events, retold in this project's own words. What the
 * chapter leaves unsaid (who blew up the satellite receivers, how much of a
 * city an evacuation empties) is a reading recorded in docs/FIDELITY.md.
 *
 * The melee that ends the chapter's game is not scripted. Here Pemulis wins
 * the argument: a ball that strikes a player scores nothing, and play goes
 * on to the 1600h siren.
 */
import type { CombatantId, Trigsit, WorldSituation } from '../types';
import { COMBATANTS } from './combatants';
import { TARGETS } from './targets';
import { DEFAULT_WORLD_SITUATION } from './worldSituation';

const PLAYING: readonly CombatantId[] = [
  'AMNAT',
  'SOVWAR',
  'REDCHI',
  'LIBSYR',
  'SOUTHAF',
  'INDPAK',
];

/**
 * How much of each playing Combatant's cities empties in the MAMA
 * evacuations: what its civil defence can move, five times its share of the
 * military budget and at most 30% (the same measure as A47's correction).
 */
function evacuations(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of TARGETS) {
    if (t.type !== 'MAMA' || !PLAYING.includes(t.owner as CombatantId)) continue;
    const e = COMBATANTS[t.owner as CombatantId].economics;
    const share = Math.min(0.3, (5 * e.civilDefenseSpending) / e.militaryBudget);
    if (share > 0) out[t.id] = Math.round(share * 1000) / 1000;
  }
  return out;
}

const id = (name: string): string => {
  const t = TARGETS.find((x) => x.name === name);
  if (!t) throw new Error(`no garment called ${name}`);
  return t.id;
};

export const INTERDEPENDENCE_DAY_TRIGSIT: Trigsit = {
  id: 'interdependence-day',
  title: 'Interdependence Day, Y.D.A.U.',
  events: [
    {
      text: 'Explosions at AMNAT satellite-receiver stations at Thule and Fylingdales. Nobody claims them.',
      raise: ['AMNAT'],
      changes: {
        losses: {
          [id('Thule satellite receiver')]: 0.5,
          [id('Fylingdales satellite receiver')]: 0.5,
        },
      },
    },
    {
      text: 'Three Canadian defence ministers vanish from Ottawa and turn up, days later, in Volgograd.',
    },
    {
      text: 'A patrol out of Cape Flattery strafes SOVWAR fishing trawlers off the coast of Washington.',
      raise: ['SOVWAR'],
      changes: {
        incidents: [
          {
            by: 'AMNAT',
            against: 'SOVWAR',
            what: 'strafed our trawlers off the coast of Washington',
          },
        ],
      },
    },
    {
      text: 'DEFCON goes up on all sides.',
      raise: PLAYING,
    },
    {
      text: 'The Big Ear listening station on Sakhalin is destroyed.',
      changes: { losses: { [id('Big Ear station, Sakhalin')]: 1 } },
    },
    {
      text: 'Four kilograms of enriched uranium go missing from the enrichment plant at Portsmouth, Ohio.',
    },
    {
      text: 'A fire breaks out at the Portsmouth plant, and six counties around it are evacuated.',
      changes: { losses: { [id('Portsmouth enrichment plant, Ohio')]: 0.3 } },
    },
    {
      text: 'An AMNAT minesweeper goes down in the Red Sea, hit by REDCHI-built torpedoes that LIBSYR fired.',
      raise: ['AMNAT'],
      changes: {
        incidents: [
          {
            by: 'LIBSYR',
            against: 'AMNAT',
            what: 'sank our minesweeper in the Red Sea with REDCHI-built torpedoes',
          },
        ],
      },
    },
    {
      text: 'Italy invades Albania.',
    },
    {
      text: 'LIBSYR sets off an air-burst over Tel Aviv. Israeli armour crosses into Syria.',
      raise: ['LIBSYR'],
      changes: { losses: { [id('Tel Aviv')]: 0.15 } },
    },
    {
      text: 'Tehran and Baghdad come in behind LIBSYR, which is now IRLIBSYR: Iran–Libya–Syria.',
      changes: { codes: { LIBSYR: 'IRLIBSYR' }, allies: { IRAN: 'LIBSYR', IRAQ: 'LIBSYR' } },
    },
    {
      text: 'MAMA evacuations begin: each Combatant moves out of its cities as many people as its civil defence can.',
      changes: { evacuated: evacuations() },
    },
    {
      text: 'Tactical devices go off in Ostrava, in Provo, Utah, and elsewhere. Nothing more is heard from Provo.',
      raise: ['AMNAT', 'SOVWAR'],
      changes: { losses: { [id('Ostrava')]: 0.25, [id('Provo')]: 1 } },
    },
    {
      text: 'The game-master asks EndStat’s Decision Tree what AMNAT must do now.',
      posit: 'AMNAT',
    },
  ],
};

export const INTERDEPENDENCE_DAY: WorldSituation = {
  ...DEFAULT_WORLD_SITUATION,
  id: 'interdependence-day',
  title: 'Interdependence Day, Y.D.A.U.',
  summary:
    'Sunday 8 November on the East Courts. Six Combatants, no insurgent cell. Lord allocates by this game’s ratios alone (A19), and the TRIGSIT is the long one everybody remembers. The siren goes at 1600h.',
  combatants: PLAYING,
  allocationMethod: 'literal',
  seed: 1108,
  trigsit: INTERDEPENDENCE_DAY_TRIGSIT,
  cast: {
    gameMaster: 'Otis P. Lord',
    emeritus: 'Michael Pemulis',
    combatants: {
      AMNAT: [
        { name: 'LaMont Chu' },
        { name: 'Todd “Postal Weight” Possalthwaite', role: 'Supreme Commander (launchman), MVL' },
        { name: 'Kieran McKenna', role: 'player' },
      ],
      SOVWAR: [{ name: 'Timmy “Sleepy T.P.” Peterson' }, { name: 'Ann Kittenplan' }, undefined],
      REDCHI: [undefined],
      LIBSYR: [{ name: 'Evan Ingersoll' }],
      SOUTHAF: [{ name: 'Josh Gopnik', role: 'State President and launcher' }],
      INDPAK: [{ name: 'J. J. Penn' }],
    },
  },
  courtWeatherAt: [
    {
      at: 15 * 60,
      precipitation: 'snow',
      text: 'The first snow of the year starts to fall on the East Courts. It falls on the map, not on the territory: EndStat keeps the World Situation’s weather.',
    },
  ],
};
