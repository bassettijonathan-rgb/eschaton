/**
 * The theater: four contiguous tennis courts (East Courts 6 through 9 at E.T.A.),
 * each with its run-off, laid side by side west to east.
 *
 * Coordinates are metres on the court surface, origin at the theater's centre,
 * +x east and +y north. The renderer maps these onto its own axes.
 */

/** A doubles court's playing area (ITF), metres. */
export const DOUBLES_WIDTH = 10.97;
export const SINGLES_WIDTH = 8.23;
export const COURT_LENGTH = 23.77;
/** Service line distance from the net. */
export const SERVICE_LINE_FROM_NET = 6.4;
export const NET_POST_OUTSIDE_SIDELINE = 0.914;

/** One court plus run-off: 60 ft east-west by 120 ft north-south. */
export const COURT_CELL_WIDTH = 18.2875;
export const COURT_CELL_LENGTH = 36.575;

export const COURT_NUMBERS = [6, 7, 8, 9] as const;
export type CourtNumber = (typeof COURT_NUMBERS)[number];

/** The whole theater: 73.15 m east-west by 36.575 m north-south, exactly 2:1. */
export const THEATER_WIDTH = COURT_CELL_WIDTH * COURT_NUMBERS.length;
export const THEATER_LENGTH = COURT_CELL_LENGTH;

export interface Rect {
  /** West edge. */
  readonly minX: number;
  /** East edge. */
  readonly maxX: number;
  /** South edge. */
  readonly minY: number;
  /** North edge. */
  readonly maxY: number;
}

export interface Court {
  readonly number: CourtNumber;
  /** The court and its run-off. */
  readonly cell: Rect;
  /** The doubles playing area, centred in the cell, long axis north-south. */
  readonly playingArea: Rect;
  /** Centre of the court (on the net line). */
  readonly centerX: number;
}

function courtAt(index: number, number: CourtNumber): Court {
  const minX = -THEATER_WIDTH / 2 + index * COURT_CELL_WIDTH;
  const centerX = minX + COURT_CELL_WIDTH / 2;
  return {
    number,
    centerX,
    cell: {
      minX,
      maxX: minX + COURT_CELL_WIDTH,
      minY: -COURT_CELL_LENGTH / 2,
      maxY: COURT_CELL_LENGTH / 2,
    },
    playingArea: {
      minX: centerX - DOUBLES_WIDTH / 2,
      maxX: centerX + DOUBLES_WIDTH / 2,
      minY: -COURT_LENGTH / 2,
      maxY: COURT_LENGTH / 2,
    },
  };
}

/** The four courts, west (Court 6) to east (Court 9). */
export const COURTS: readonly Court[] = COURT_NUMBERS.map((n, i) => courtAt(i, n));

export const THEATER_BOUNDS: Rect = {
  minX: -THEATER_WIDTH / 2,
  maxX: THEATER_WIDTH / 2,
  minY: -THEATER_LENGTH / 2,
  maxY: THEATER_LENGTH / 2,
};

export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}

/** Which court's cell a point lies in, or undefined if it is off the theater. */
export function courtAtPoint(x: number, y: number): Court | undefined {
  return COURTS.find((c) => contains(c.cell, x, y));
}
