/**
 * EndStat: the game's statistics of record. From the World Situation, the
 * allocation and the log of lobs it works out what every warhead did
 * (blast, firestorm, fallout, EMP), who scores what as INDDIR and SUFDDIR,
 * the four corrections, SACPOP penalties and regrettable mistargetings, and
 * the standings by INDDIR : SUFDDIR ratio. Every figure carries its working,
 * so a player can appeal to Pemulis.
 *
 * Pure and deterministic: the same inputs always give the same report.
 */
import type { Allocation } from './allocation';
import { MAMA_POINTS_PER_MILLION, pointValue } from './data/points';
import { TARGETS } from './data/targets';
import {
  EMP_LOSS_COMMAND_HIT,
  EMP_LOSS_PER_DETONATION,
  FIRESTORM_SEVERITY,
  empHardening,
  falloutDose,
  firestormThreshold,
  hotlineWords,
  killRadiusKm,
  plumeFor,
  radiationCasualties,
  weatherAt,
  type Plume,
} from './effects';
import type { Detonation, LaunchOrder } from './lob';
import { courtMetresToKm, project } from './projection';
import { ownerAt } from './territory';
import type {
  CombatantDef,
  CombatantId,
  OwnerId,
  TargetItem,
  TargetType,
  WorldSituation,
} from './types';

/** Share of a city's people a direct hit kills outright. */
export const BLAST_DEATHS_DIRECT = 0.45;
/** Share of the survivors a direct hit injures. */
export const BLAST_INJURED_DIRECT = 0.3;
/** Share of those still alive a firestorm kills. */
export const FIRESTORM_DEATHS = 0.5;
/** An injury or a shortened life counts this fraction of a death in points. */
export const INJURY_POINT_WEIGHT = 0.25;
/** A platform this badly damaged can no longer launch. */
export const PLATFORM_OUT_AT = 0.5;
/** SUFDDIR a Combatant takes for each point of INDDIR it inflicts on cities. */
export const SACPOP_PENALTY = 1;

/** Hardened sites: an indirect hit does much less to them. */
export const HARDENED: ReadonlySet<TargetType> = new Set<TargetType>([
  'SSTRAC',
  'missile-installation',
  'silo-cluster',
  'antimissile-installation',
]);

/** A lob as EndStat needs it: who threw it and where each warhead came down. */
export interface EndStatLaunch {
  readonly order: Pick<LaunchOrder, 'combatant'>;
  readonly detonations: readonly Detonation[];
}

/**
 * inddir: scored for the striker and against the owner. own-goal: a
 * Combatant hit its own territory and only suffers. mistargeting: the owner
 * is not playing, so nobody scores (A13).
 */
export type Scoring = 'inddir' | 'own-goal' | 'mistargeting';

export interface HitEffect {
  readonly item: TargetItem;
  readonly kind: 'direct' | 'indirect';
  /** 1 for a direct hit, falling to 0 at the edge of the kill radius. */
  readonly severity: number;
  readonly killRadiusKm: number;
  /** Millions, for cities. */
  readonly deaths: number;
  readonly injured: number;
  readonly firestorm: boolean;
  /** Share of a site's whole value destroyed by this strike. */
  readonly destruction: number;
  readonly points: number;
  readonly scoring: Scoring;
  readonly steps: readonly string[];
}

export interface FalloutEffect {
  readonly city: TargetItem;
  readonly roentgens: number;
  readonly deaths: number;
  readonly shortened: number;
  readonly points: number;
  readonly scoring: Scoring;
}

export interface EmpEffect {
  readonly combatant: CombatantId;
  readonly loss: number;
  readonly capacityAfter: number;
}

export interface StrikeReport {
  /** 1-based number of the lob in the order log. */
  readonly order: number;
  readonly combatant: CombatantId;
  readonly detonation: Detonation;
  readonly hits: readonly HitEffect[];
  readonly fallout: readonly FalloutEffect[];
  readonly emp: readonly EmpEffect[];
  readonly plume: Plume | undefined;
  /** It struck a Combatant's city on purpose: Strikes Against Civilian POPulations. */
  readonly sacpop: boolean;
  /** EndStat's working for this warhead, as the audit prints it. */
  readonly working: readonly string[];
}

export interface CityState {
  readonly item: TargetItem;
  readonly population: number;
  dead: number;
  injured: number;
  shortened: number;
  strikes: number;
  firestorm: boolean;
}

export interface Correction {
  readonly name: string;
  readonly appliesTo: 'INDDIR' | 'SUFDDIR';
  readonly factor: number;
  readonly reason: string;
}

export interface Tally {
  readonly combatant: CombatantId;
  readonly megatons: number;
  readonly inddirRaw: number;
  readonly sufddirRaw: number;
  /** INDDIR inflicted on Combatants' cities, before corrections. */
  readonly cityInddirRaw: number;
  readonly corrections: readonly Correction[];
  readonly inddir: number;
  readonly sacpopPenalty: number;
  readonly sufddir: number;
  /** INDDIR ÷ SUFDDIR: Infinity when it has suffered nothing, undefined when nothing has happened to it. */
  readonly ratio: number | undefined;
  readonly wentSacpop: boolean;
}

export interface CommState {
  readonly capacity: number;
  readonly hardening: number;
  /** Longest message the hotline carries for it now. */
  readonly words: number;
}

export interface Mistargeting {
  readonly order: number;
  readonly combatant: CombatantId;
  readonly item: TargetItem;
}

export interface EndStatReport {
  readonly strikes: readonly StrikeReport[];
  /** Every city struck or irradiated so far. */
  readonly cities: readonly CityState[];
  readonly tallies: Readonly<Partial<Record<CombatantId, Tally>>>;
  /** Best ratio first. Combatants nothing has happened to come last. */
  readonly standings: readonly Tally[];
  readonly winner: CombatantId | undefined;
  readonly comm: Readonly<Partial<Record<CombatantId, CommState>>>;
  /** Launch platforms (target ids) too damaged to launch from. */
  readonly destroyedPlatforms: readonly string[];
  readonly mistargetings: readonly Mistargeting[];
  /** The whole working, in order: what the crunch prints and Pemulis reads. */
  readonly audit: readonly string[];
}

const mil = (n: number): string => `${n.toFixed(2)} million`;
const pts = (n: number): string => n.toFixed(2);
const fmtRatio = (r: number | undefined): string =>
  r === undefined ? 'no ratio' : r === Infinity ? '∞' : r.toFixed(3);

function scoringFor(owner: OwnerId, striker: CombatantId, ws: WorldSituation): Scoring {
  if (!(ws.combatants as readonly string[]).includes(owner)) return 'mistargeting';
  return owner === striker ? 'own-goal' : 'inddir';
}

/** Herfindahl diversity of a Land-Sea-Air split: 0 for one leg, 2/3 for three equal legs. */
export function triadDiversity(lsa: { land: number; sea: number; air: number }): number {
  return 1 - (lsa.land ** 2 + lsa.sea ** 2 + lsa.air ** 2);
}

export function computeEndStat(
  ws: WorldSituation,
  defs: Readonly<Record<CombatantId, CombatantDef>>,
  allocation: Allocation,
  launches: readonly EndStatLaunch[],
  items: readonly TargetItem[] = TARGETS,
): EndStatReport {
  const playing = ws.combatants;
  const isPlaying = (o: OwnerId | undefined): o is CombatantId =>
    o !== undefined && (playing as readonly string[]).includes(o);
  const econ = (id: CombatantId) => ws.economics[id] ?? defs[id].economics;
  const audit: string[] = [];

  const inddirRaw = new Map<CombatantId, Map<CombatantId, number>>();
  const sufddirRaw = new Map<CombatantId, number>();
  const cityInddir = new Map<CombatantId, number>();
  const sacpop = new Set<CombatantId>();
  const addInddir = (striker: CombatantId, victim: CombatantId, p: number): void => {
    const m = inddirRaw.get(striker) ?? new Map<CombatantId, number>();
    m.set(victim, (m.get(victim) ?? 0) + p);
    inddirRaw.set(striker, m);
  };
  const score = (
    striker: CombatantId,
    owner: OwnerId,
    scoring: Scoring,
    p: number,
    city: boolean,
  ): void => {
    if (scoring === 'mistargeting' || p <= 0 || !isPlaying(owner)) return;
    sufddirRaw.set(owner, (sufddirRaw.get(owner) ?? 0) + p);
    if (scoring === 'inddir') {
      addInddir(striker, owner, p);
      if (city) cityInddir.set(striker, (cityInddir.get(striker) ?? 0) + p);
    }
  };

  const cities = new Map<string, CityState>();
  const cityState = (item: TargetItem): CityState => {
    let c = cities.get(item.id);
    if (!c) {
      c = {
        item,
        population: item.population ?? 0,
        dead: 0,
        injured: 0,
        shortened: 0,
        strikes: 0,
        firestorm: false,
      };
      cities.set(item.id, c);
    }
    return c;
  };
  const destroyed = new Map<string, number>();
  const capacity = new Map<CombatantId, number>(playing.map((id) => [id, 1]));
  const hardening = new Map<CombatantId, number>(
    playing.map((id) => [id, empHardening(econ(id).civilDefenseSpending, econ(id).militaryBudget)]),
  );
  const mamas = items.filter((t) => t.type === 'MAMA' && (t.population ?? 0) > 0);
  const strikes: StrikeReport[] = [];
  const mistargetings: Mistargeting[] = [];

  launches.forEach((launch, li) => {
    const order = li + 1;
    const striker = launch.order.combatant;
    for (const d of launch.detonations) {
      const working: string[] = [];
      const head = `Order ${String(order)}, warhead ${String(d.warhead)} (${defs[striker].code})`;
      if (d.offMap) {
        working.push(
          d.struck
            ? `${head}: struck ${d.struck.label} ${d.struck.height.toFixed(2)} m above the court. The apparatus of the game is not the territory: off the map, no effect, no points for hitting anybody real.`
            : `${head}: came down off the map. No effect.`,
        );
        audit.push(...working);
        strikes.push({
          order,
          combatant: striker,
          detonation: d,
          hits: [],
          fallout: [],
          emp: [],
          plume: undefined,
          sacpop: false,
          working,
        });
        continue;
      }
      const where = `${Math.abs(d.lonLat.lat).toFixed(1)}°${d.lonLat.lat >= 0 ? 'N' : 'S'} ${Math.abs(d.lonLat.lon).toFixed(1)}°${d.lonLat.lon >= 0 ? 'E' : 'W'}`;
      working.push(
        `${head}: first contact at ${where}${d.court === undefined ? '' : ` on Court ${String(d.court)}`}.`,
      );

      // Blast, heat and firestorm.
      const hits: HitEffect[] = [];
      let isSacpop = false;
      for (const h of d.hits) {
        const kr = killRadiusKm(h.item, weatherAt(ws, h.item.at));
        const severity = h.kind === 'direct' ? 1 : Math.max(0, 1 - h.distance / h.killRadius);
        const scoring = scoringFor(h.item.owner, striker, ws);
        const steps = [...kr.steps];
        steps.push(
          h.kind === 'direct'
            ? 'Direct hit: inside the garment.'
            : `Indirect hit ${courtMetresToKm(h.distance).toFixed(2)} km from the garment's edge: severity ${severity.toFixed(3)}.`,
        );
        let deaths = 0;
        let injured = 0;
        let firestorm = false;
        let destruction = 0;
        let points: number;
        if (h.item.type === 'MAMA') {
          const c = cityState(h.item);
          const alive = c.population - c.dead;
          const blastShare = BLAST_DEATHS_DIRECT * severity * severity;
          deaths = alive * blastShare;
          injured = (alive - deaths) * BLAST_INJURED_DIRECT * severity;
          steps.push(
            `Blast and heat kill ${(blastShare * 100).toFixed(1)}% of ${mil(alive)} living: ${mil(deaths)} dead, ${mil(injured)} injured.`,
          );
          if (severity >= FIRESTORM_SEVERITY) c.strikes++;
          const need = firestormThreshold(h.item);
          if (!c.firestorm && c.strikes >= need) {
            const burned = (alive - deaths) * FIRESTORM_DEATHS;
            deaths += burned;
            firestorm = true;
            c.firestorm = true;
            steps.push(
              `Firestorm: strike ${String(c.strikes)} of the ${String(need)} ${h.item.highRise ? 'its skyline needs' : 'it needs'}. ${mil(burned)} more dead.`,
            );
          } else if (!c.firestorm && severity >= FIRESTORM_SEVERITY) {
            steps.push(
              `No firestorm yet: ${String(c.strikes)} of the ${String(need)} close strikes it needs.`,
            );
          }
          c.dead += deaths;
          c.injured += injured;
          points = MAMA_POINTS_PER_MILLION * (deaths + INJURY_POINT_WEIGHT * injured);
          steps.push(
            `Points: ${String(MAMA_POINTS_PER_MILLION)} per million dead, a quarter of that per million injured: ${pts(points)}.`,
          );
          if (scoring === 'inddir' && severity >= FIRESTORM_SEVERITY) isSacpop = true;
        } else {
          const before = destroyed.get(h.item.id) ?? 0;
          const share =
            HARDENED.has(h.item.type) && h.kind === 'indirect' ? severity ** 3 : severity;
          destruction = (1 - before) * share;
          destroyed.set(h.item.id, before + destruction);
          points = pointValue(h.item) * destruction;
          steps.push(
            `${HARDENED.has(h.item.type) && h.kind === 'indirect' ? 'Hardened site: severity cubed. ' : ''}${(destruction * 100).toFixed(1)}% of its ${String(pointValue(h.item))} points destroyed: ${pts(points)}.`,
          );
        }
        if (scoring === 'mistargeting') {
          steps.push(
            `${h.item.name} belongs to nobody playing: a regrettable mistargeting. No points to anyone.`,
          );
          mistargetings.push({ order, combatant: striker, item: h.item });
        } else if (scoring === 'own-goal') {
          steps.push(`${defs[striker].code} struck its own ${h.item.name}: SUFDDIR only.`);
        }
        score(striker, h.item.owner, scoring, points, h.item.type === 'MAMA');
        hits.push({
          item: h.item,
          kind: h.kind,
          severity,
          killRadiusKm: kr.value,
          deaths,
          injured,
          firestorm,
          destruction,
          points,
          scoring,
          steps,
        });
        working.push(`  ${h.item.name}: ${steps.join(' ')}`);
      }
      if (isSacpop) {
        sacpop.add(striker);
        working.push(`  SACPOP: ${defs[striker].code} has struck a city.`);
      }

      // Fallout downwind, by the scenario weather where it landed.
      const plume = plumeFor(d.at, weatherAt(ws, d.lonLat));
      const fallout: FalloutEffect[] = [];
      for (const m of mamas) {
        const dose = falloutDose(plume, project(m.at));
        const known = cities.get(m.id);
        const alive = (known?.population ?? m.population ?? 0) - (known?.dead ?? 0);
        const rc = radiationCasualties(alive, dose);
        if (rc.deaths === 0 && rc.shortened === 0) continue;
        const c = cityState(m);
        const shortened = Math.max(0, rc.shortened - c.shortened);
        c.dead += rc.deaths;
        c.shortened += shortened;
        const points = MAMA_POINTS_PER_MILLION * (rc.deaths + INJURY_POINT_WEIGHT * shortened);
        const scoring = scoringFor(m.owner, striker, ws);
        score(striker, m.owner, scoring, points, true);
        if (scoring === 'mistargeting') mistargetings.push({ order, combatant: striker, item: m });
        fallout.push({ city: m, roentgens: dose, deaths: rc.deaths, shortened, points, scoring });
        working.push(
          `  Fallout on ${m.name}: ${dose.toFixed(0)} roentgens. ${mil(rc.deaths)} dead (6.36 per hundred per 1,000 R), ${mil(shortened)} more with shortened lives. ${pts(points)} points${scoring === 'mistargeting' ? ', but nobody plays its owner' : ''}.`,
        );
      }

      // EMP: communication capacity in the territory it landed in.
      const emp: EmpEffect[] = [];
      const lose = (id: CombatantId, raw: number, why: string): void => {
        const h = hardening.get(id) ?? 0;
        const loss = raw * (1 - h);
        const after = Math.max(0, (capacity.get(id) ?? 1) - loss);
        capacity.set(id, after);
        emp.push({ combatant: id, loss, capacityAfter: after });
        working.push(
          `  EMP ${why}: ${defs[id].code} loses ${(loss * 100).toFixed(1)}% of its communication capacity (${(h * 100).toFixed(0)}% shielded by civil defence), now ${(after * 100).toFixed(0)}%.`,
        );
      };
      const land = ownerAt(d.lonLat);
      if (isPlaying(land)) lose(land, EMP_LOSS_PER_DETONATION, 'over its territory');
      for (const h of hits) {
        const o = h.item.owner;
        if (
          (h.item.type === 'SSTRAC' || h.item.type === 'satellite-site') &&
          h.severity >= 0.5 &&
          isPlaying(o)
        )
          lose(o, EMP_LOSS_COMMAND_HIT, `at ${h.item.name}`);
      }

      audit.push(...working);
      strikes.push({
        order,
        combatant: striker,
        detonation: d,
        hits,
        fallout,
        emp,
        plume,
        sacpop: isSacpop,
        working,
      });
    }
  });

  // Corrections, SACPOP penalties and the ratio.
  const megatons = new Map(allocation.lines.map((l) => [l.combatant, l.megatons]));
  const playingMt = playing.map((id) => megatons.get(id) ?? 0).filter((m) => m > 0);
  const meanMt = playingMt.reduce((s, m) => s + m, 0) / Math.max(1, playingMt.length);
  const densities = playing
    .map((id) => defs[id].demographics.populationDensity)
    .filter((x) => x > 0);
  const meanDensity = densities.reduce((s, x) => s + x, 0) / Math.max(1, densities.length);

  const tallies: Partial<Record<CombatantId, Tally>> = {};
  for (const id of playing) {
    const def = defs[id];
    const byVictim = inddirRaw.get(id) ?? new Map<CombatantId, number>();
    const iRaw = [...byVictim.values()].reduce((s, x) => s + x, 0);
    const sRaw = sufddirRaw.get(id) ?? 0;
    const mt = megatons.get(id) ?? 0;
    const mtFactor = mt > 0 && meanMt > 0 ? Math.sqrt(meanMt / mt) : 1;
    let densityAdjusted = 0;
    for (const [victim, p] of byVictim) {
      const dv = defs[victim].demographics.populationDensity;
      densityAdjusted += p * (dv > 0 ? (meanDensity / dv) ** 0.25 : 1);
    }
    const densityFactor = iRaw > 0 ? densityAdjusted / iRaw : 1;
    const lsaFactor = 1 - 0.25 * (triadDiversity(def.landSeaAir) / (2 / 3));
    const e = econ(id);
    const cdFactor =
      1 -
      (e.militaryBudget > 0 ? Math.min(0.3, (5 * e.civilDefenseSpending) / e.militaryBudget) : 0);
    const corrections: Correction[] = [
      {
        name: 'Initial megatonnage',
        appliesTo: 'INDDIR',
        factor: mtFactor,
        reason: `${String(mt)} Mt against a mean of ${meanMt.toFixed(0)} Mt: √(mean ÷ own). A big arsenal is expected to do more.`,
      },
      {
        name: 'Population density',
        appliesTo: 'INDDIR',
        factor: densityFactor,
        reason: `Each victim's density against the mean of ${meanDensity.toFixed(0)} per km², to the power ¼: crowded targets are easier to hurt.`,
      },
      {
        name: 'Land-Sea-Air distribution',
        appliesTo: 'SUFDDIR',
        factor: lsaFactor,
        reason: `Land ${String(def.landSeaAir.land)}, sea ${String(def.landSeaAir.sea)}, air ${String(def.landSeaAir.air)}: a spread triad keeps its response, up to a quarter off.`,
      },
      {
        name: 'EMP-resistant civil defence',
        appliesTo: 'SUFDDIR',
        factor: cdFactor,
        reason: `Civil defence is ${e.militaryBudget > 0 ? ((100 * e.civilDefenseSpending) / e.militaryBudget).toFixed(1) : '0'}% of the military budget, ×5, at most 30% off.`,
      },
    ];
    const inddir = iRaw * mtFactor * densityFactor;
    const sacpopPenalty = sacpop.has(id) ? SACPOP_PENALTY * (cityInddir.get(id) ?? 0) : 0;
    const sufddir = sRaw * lsaFactor * cdFactor + sacpopPenalty;
    const ratio = sufddir > 0 ? inddir / sufddir : inddir > 0 ? Infinity : undefined;
    tallies[id] = {
      combatant: id,
      megatons: mt,
      inddirRaw: iRaw,
      sufddirRaw: sRaw,
      cityInddirRaw: cityInddir.get(id) ?? 0,
      corrections,
      inddir,
      sacpopPenalty,
      sufddir,
      ratio,
      wentSacpop: sacpop.has(id),
    };
  }

  const standings = playing
    .map((id) => tallies[id])
    .filter((t): t is Tally => t !== undefined)
    .sort((a, b) => {
      if (a.ratio === undefined || b.ratio === undefined)
        return a.ratio === undefined ? (b.ratio === undefined ? 0 : 1) : -1;
      if (a.ratio !== b.ratio) return b.ratio - a.ratio;
      return b.inddir - a.inddir;
    });
  const top = standings[0];
  const winner = top && top.inddir > 0 ? top.combatant : undefined;

  if (strikes.length > 0) audit.push('Corrections and standings.');
  for (const t of standings) {
    if (t.ratio === undefined) continue;
    const code = defs[t.combatant].code;
    audit.push(
      `${code}: INDDIR ${pts(t.inddirRaw)} raw; SUFDDIR ${pts(t.sufddirRaw)} raw.`,
      ...t.corrections.map(
        (c) => `  ${c.name} (${c.appliesTo}) × ${c.factor.toFixed(3)}. ${c.reason}`,
      ),
      ...(t.sacpopPenalty > 0
        ? [
            `  SACPOP penalty: + ${pts(t.sacpopPenalty)} SUFDDIR, ${String(SACPOP_PENALTY)} for each point it inflicted on cities.`,
          ]
        : []),
      `  INDDIR ${pts(t.inddir)} : SUFDDIR ${pts(t.sufddir)} = ${fmtRatio(t.ratio)}.`,
    );
  }
  audit.push(
    winner
      ? `Most favourable ratio: ${defs[winner].code}, ${fmtRatio(tallies[winner]?.ratio)}.`
      : 'No winner: no Combatant has inflicted anything on another.',
  );

  const comm: Partial<Record<CombatantId, CommState>> = {};
  for (const id of playing) {
    const c = capacity.get(id) ?? 1;
    comm[id] = { capacity: c, hardening: hardening.get(id) ?? 0, words: hotlineWords(c) };
  }
  const destroyedPlatforms = items
    .filter((t) => t.platform && (destroyed.get(t.id) ?? 0) >= PLATFORM_OUT_AT)
    .map((t) => t.id);

  return {
    strikes,
    cities: [...cities.values()],
    tallies,
    standings,
    winner,
    comm,
    destroyedPlatforms,
    mistargetings,
    audit,
  };
}
