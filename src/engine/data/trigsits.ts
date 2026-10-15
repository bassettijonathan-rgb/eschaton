/**
 * Triggering Situations from years of precedent: the game-master proposes
 * one, and a quorum of the day's Combatants must agree to it. Written for
 * this game; the Interdependence Day TRIGSIT is its own scenario (M8).
 */
import type { Trigsit } from '../types';

export type { Trigsit, TrigsitEvent } from '../types';

export const TRIGSIT_PRECEDENTS: readonly Trigsit[] = [
  {
    id: 'nuck-border',
    title: 'Trouble on the Canadian border',
    events: [
      {
        text: 'A Canadian insurgent cell blows up a rail convergence outside Windsor and claims it in a fax to three newspapers.',
      },
      { text: 'AMNAT moves a CONFORCON north and SOVWAR protests the movement as provocative.' },
      { text: 'Both superpowers raise DEFCON by one step.' },
    ],
    raise: ['AMNAT', 'SOVWAR'],
  },
  {
    id: 'strait-incident',
    title: 'A collision in the Strait of Hormuz',
    events: [
      {
        text: 'A LIBSYR patrol boat and an AMNAT frigate collide at night. Each says the other rammed it.',
      },
      { text: 'LIBSYR closes its airspace; REDCHI offers to mediate and is ignored.' },
    ],
  },
  {
    id: 'kashmir',
    title: 'Shelling in Kashmir',
    events: [
      {
        text: 'Artillery exchanges inside INDPAK spread along the line of control, which INDPAK insists is an internal matter.',
      },
      { text: 'REDCHI moves armour to the border and SOVWAR puts its Far East forces on alert.' },
    ],
    raise: ['REDCHI'],
  },
  {
    id: 'satellite-blackout',
    title: 'Satellite receivers go dark',
    events: [
      {
        text: 'Two AMNAT satellite receiver stations stop answering within an hour of each other.',
      },
      { text: 'SOVWAR denies everything; SOUTHAF reports unexplained interference over the Cape.' },
    ],
  },
];
