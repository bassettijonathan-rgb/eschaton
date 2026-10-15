/**
 * What the inspector says about something clicked on the courts.
 */
import type { ApparatusItem } from '../engine/apparatus';
import { viewBucket, type BallSupply, type Viewer } from '../engine/buckets';
import { COMBATANTS } from '../engine/data/combatants';
import { pointValue } from '../engine/data/points';
import { TARGETS, TARGET_TYPE_LABELS, garmentFor } from '../engine/data/targets';
import { UNPLAYED_NATIONS } from '../engine/data/worldSituation';
import type { EndStatReport, StrikeReport, Tally } from '../engine/endstat';
import { HOWITZER_RANGE_KM, type Detonation, type LobResult } from '../engine/lob';
import { greatCircleKm } from '../engine/projection';
import { territoryAt } from '../engine/territory';
import type { OwnerId, TargetItem } from '../engine/types';
import { COMBATANT_IDS } from '../engine/types';

export interface Description {
  readonly title: string;
  readonly lines: readonly string[];
}

export function ownerName(owner: OwnerId): string {
  if ((COMBATANT_IDS as readonly string[]).includes(owner)) {
    const def = COMBATANTS[owner as keyof typeof COMBATANTS];
    return `${def.code} (${def.name})`;
  }
  return `${UNPLAYED_NATIONS[owner as keyof typeof UNPLAYED_NATIONS].name}, which nobody plays`;
}

const fmtPoints = (p: number): string => (Number.isInteger(p) ? String(p) : p.toFixed(1));

export function describeTarget(item: TargetItem): Description {
  const garment = garmentFor(item);
  const lines = [
    `On the court: ${garment.label.charAt(0).toLowerCase()}${garment.label.slice(1)}.`,
    `On the map: ${TARGET_TYPE_LABELS[item.type]}.`,
    `Belongs to ${ownerName(item.owner)}.`,
  ];
  if (item.population !== undefined) lines.push(`Population ${String(item.population)} million.`);
  const isUnplayed = !(COMBATANT_IDS as readonly string[]).includes(item.owner);
  lines.push(
    isUnplayed
      ? 'Worth nothing to anybody: a strike here is a regrettable mistargeting.'
      : `Worth ${fmtPoints(pointValue(item))} points.`,
  );
  if (item.platform)
    lines.push(`Launch platform (${item.platform}): warheads can be lobbed from here.`);
  if (item.mobile) lines.push('Mobile: the scenario may move it.');
  if (garment.legendNote) lines.push(garment.legendNote);
  if (item.note) lines.push(item.note);
  return { title: item.name, lines };
}

const APPARATUS_NOTE =
  'Part of the apparatus of the game, not the map: worth nothing, and never a target.';

export function describeApparatus(
  a: ApparatusItem,
  viewer: Viewer,
  supply: BallSupply,
): Description {
  const lines: string[] = [];
  if (a.kind === 'bucket' && a.owner) {
    const view = viewBucket(supply, viewer, a.owner);
    lines.push(
      view.kind === 'count'
        ? `Holds ${String(view.count)} warheads (${String(view.count * 5)} Mt).`
        : 'An identical white bucket. You cannot see how many warheads are in it.',
    );
  }
  if (a.kind === 'hopper') {
    lines.push(
      viewer.kind === 'gameMaster'
        ? `${String(supply.hopper)} of the ${String(supply.total)} balls were allocated to nobody.`
        : 'The game-master keeps the unallocated balls here.',
    );
  }
  if (a.kind === 'player' && a.owner)
    lines.push(`Stands in ${COMBATANTS[a.owner].name}'s territory.`);
  lines.push(APPARATUS_NOTE);
  return { title: a.label, lines };
}

const km = (n: number): string => `${n < 10 ? n.toFixed(1) : n.toFixed(0)} km`;

/** One line for where a warhead first touched the court, and what it caught. */
export function describeDetonation(d: Detonation, items: readonly TargetItem[] = TARGETS): string {
  const n = `Warhead ${String(d.warhead)}`;
  if (d.offMap) return `${n} came down off the map, where it does nothing.`;
  const court = d.court === undefined ? 'between the courts' : `on Court ${String(d.court)}`;
  const direct = d.hits.filter((h) => h.kind === 'direct').map((h) => h.item.name);
  const indirect = d.hits.filter((h) => h.kind === 'indirect').map((h) => h.item.name);
  const parts: string[] = [];
  if (direct.length > 0) parts.push(`direct hit on ${direct.join(' and ')}`);
  if (indirect.length > 0)
    parts.push(
      `${direct.length > 0 ? 'also catches' : 'catches'} ${indirect.join(', ')} in its kill radius`,
    );
  if (parts.length > 0) return `${n} ${court}: ${parts.join('; ')}.`;
  const where = territoryAt(d.lonLat)?.name;
  let nearest: TargetItem | undefined;
  let best = Infinity;
  for (const t of items) {
    const dist = greatCircleKm(d.lonLat, t.at);
    if (dist < best) {
      best = dist;
      nearest = t;
    }
  }
  const place = where ? `in ${where}` : 'at sea';
  const near = nearest ? `, ${km(best)} from ${nearest.name}` : '';
  return `${n} ${court}: landed ${place}${near}, with nothing in reach.`;
}

export function describeLob(r: LobResult): Description {
  const def = COMBATANTS[r.order.combatant];
  const what =
    r.order.warheads === 1 ? 'one warhead' : `a jockstrap of ${String(r.order.warheads)} warheads`;
  const lines = r.detonations.map((d) => describeDetonation(d));
  if (r.outOfRange > 0)
    lines.push(
      `${String(r.outOfRange)} ${r.outOfRange === 1 ? 'shell' : 'shells'} fell beyond the howitzer's ${String(HOWITZER_RANGE_KM)} km and did nothing.`,
    );
  return { title: `${def.code} lobs ${what} from ${r.platform.name}`, lines };
}

const millions = (n: number): string =>
  n >= 0.995 ? `${n.toFixed(1)} million` : `${Math.round(n * 1000).toLocaleString('en-US')},000`;

/** One line for the strike log: what a warhead hit and what it cost. */
export function describeStrike(s: StrikeReport): string {
  const who = `${COMBATANTS[s.combatant].code}, warhead ${String(s.detonation.warhead)}`;
  if (s.detonation.offMap) return `${who}: off the map, no effect.`;
  const parts: string[] = [];
  const hit = s.hits.map((h) => {
    const notes = [
      h.kind,
      ...(h.firestorm ? ['firestorm'] : []),
      ...(h.scoring === 'mistargeting' ? ['mistargeting'] : []),
    ];
    return `${h.item.name} (${notes.join(', ')})`;
  });
  parts.push(hit.length > 0 ? hit.join('; ') : 'nothing in reach');
  const dead =
    s.hits.reduce((n, h) => n + h.deaths, 0) + s.fallout.reduce((n, f) => n + f.deaths, 0);
  if (dead > 0) parts.push(`${millions(dead)} dead`);
  const downwind = s.fallout.filter((f) => !s.hits.some((h) => h.item.id === f.city.id));
  if (downwind.length > 0) parts.push(`fallout on ${downwind.map((f) => f.city.name).join(', ')}`);
  if (s.sacpop) parts.push('SACPOP');
  return `${who}: ${parts.join('. ')}.`;
}

export function formatRatio(t: Pick<Tally, 'ratio'>): string {
  if (t.ratio === undefined) return '—';
  if (t.ratio === Infinity) return '∞';
  return t.ratio.toFixed(3);
}

/** What EndStat says about a target once it has been struck or irradiated. */
export function describeDamage(item: TargetItem, report: EndStatReport): string[] {
  const lines: string[] = [];
  const city = report.cities.find((c) => c.item.id === item.id);
  if (city && (city.dead > 0 || city.injured > 0 || city.shortened > 0)) {
    lines.push(
      `EndStat: ${millions(city.dead)} dead, ${millions(city.injured)} injured, ${millions(city.shortened)} with shortened lives.`,
    );
    if (city.firestorm) lines.push('A firestorm has burned through it.');
  }
  const destroyed = report.strikes
    .flatMap((s) => s.hits)
    .filter((h) => h.item.id === item.id && h.item.type !== 'MAMA')
    .reduce((n, h) => n + h.destruction, 0);
  if (destroyed > 0) lines.push(`EndStat: ${(destroyed * 100).toFixed(0)}% destroyed.`);
  if (report.destroyedPlatforms.includes(item.id)) lines.push('Can no longer launch.');
  return lines;
}
