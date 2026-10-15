/**
 * Point values for target items (A11). The novel says every item carries a
 * point value but never gives one; these are the starting weights.
 */
import type { TargetItem, TargetType } from '../types';

/** A MAMA is worth this many points per million people (a 10-million city is 20). */
export const MAMA_POINTS_PER_MILLION = 2;
export const FUSION_LAB_POINTS = 15;

export const POINTS: Readonly<Record<Exclude<TargetType, 'MAMA'>, number>> = {
  airfield: 3,
  bridge: 3,
  'satellite-site': 3,
  'carrier-group': 3,
  'power-plant': 3,
  'rail-convergence': 3,
  CONFORCON: 4,
  SSTRAC: 10,
  'enrichment-plant': 8,
  reactor: 8,
  'fusion-lab': FUSION_LAB_POINTS,
  'missile-installation': 6,
  'silo-cluster': 6,
  'antimissile-installation': 6,
  'bomber-squadron': 6,
  submarine: 7,
};

export function pointValue(item: TargetItem): number {
  if (item.type === 'MAMA') return MAMA_POINTS_PER_MILLION * (item.population ?? 0);
  return POINTS[item.type];
}
