/**
 * Triggering Situations from years of precedent: the game-master proposes
 * one, and a quorum of the day's Combatants must agree to it. Written for
 * this game; the Interdependence Day TRIGSIT is its own scenario (M8).
 */
import type { CombatantId } from '../types';

export interface Trigsit {
  readonly id: string;
  readonly title: string;
  readonly events: readonly string[];
  /** Combatants whose DEFCON goes up one step when the TRIGSIT stands. */
  readonly raise?: readonly CombatantId[];
}

export const TRIGSIT_PRECEDENTS: readonly Trigsit[] = [
  {
    id: 'nuck-border',
    title: 'Trouble on the Canadian border',
    events: [
      'A Canadian insurgent cell blows up a rail convergence outside Windsor and claims it in a fax to three newspapers.',
      'AMNAT moves a CONFORCON north and SOVWAR protests the movement as provocative.',
      'Both superpowers raise DEFCON by one step.',
    ],
    raise: ['AMNAT', 'SOVWAR'],
  },
  {
    id: 'strait-incident',
    title: 'A collision in the Strait of Hormuz',
    events: [
      'A LIBSYR patrol boat and an AMNAT frigate collide at night. Each says the other rammed it.',
      'LIBSYR closes its airspace; REDCHI offers to mediate and is ignored.',
    ],
  },
  {
    id: 'kashmir',
    title: 'Shelling in Kashmir',
    events: [
      'Artillery exchanges inside INDPAK spread along the line of control, which INDPAK insists is an internal matter.',
      'REDCHI moves armour to the border and SOVWAR puts its Far East forces on alert.',
    ],
    raise: ['REDCHI'],
  },
  {
    id: 'satellite-blackout',
    title: 'Satellite receivers go dark',
    events: [
      'Two AMNAT satellite receiver stations stop answering within an hour of each other.',
      'SOVWAR denies everything; SOUTHAF reports unexplained interference over the Cape.',
    ],
  },
];
