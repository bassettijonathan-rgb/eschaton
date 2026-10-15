/**
 * Shared types for the rules core. Everything here is plain data so that a
 * game can be serialised, replayed and audited.
 */

/** The Combatants a player (or the computer) can be. */
export const COMBATANT_IDS = [
  'AMNAT',
  'SOVWAR',
  'REDCHI',
  'LIBSYR',
  'SOUTHAF',
  'INDPAK',
  'INSURGENT',
] as const;
export type CombatantId = (typeof COMBATANT_IDS)[number];

/** Nations on the map that nobody plays. They act only through the scenario. */
export const UNPLAYED_NATION_IDS = [
  'CANADA',
  'ISRAEL',
  'ITALY',
  'ALBANIA',
  'IRAN',
  'IRAQ',
  'JAPAN',
  'SIERRA_LEONE',
] as const;
export type UnplayedNationId = (typeof UNPLAYED_NATION_IDS)[number];

export type OwnerId = CombatantId | UnplayedNationId;

export interface LonLat {
  /** Degrees east, -180 to 180. */
  readonly lon: number;
  /** Degrees north, -90 to 90. */
  readonly lat: number;
}

/** Share of strategic delivery capacity by platform. Sums to 1. */
export interface LandSeaAir {
  readonly land: number;
  readonly sea: number;
  readonly air: number;
}

/**
 * Yearly figures in notional billions. The novel gives none; these are
 * invented so that the allocation formula produces the book's outcomes.
 */
export interface Economics {
  readonly gnp: number;
  readonly militaryBudget: number;
  /** Stratego-tactical (nuclear) spending, a part of the military budget. */
  readonly strategicSpending: number;
  /** Spending on EMP-resistant civil defence. */
  readonly civilDefenseSpending: number;
}

export interface Share {
  readonly name: string;
  /** Fraction of population, 0 to 1. */
  readonly share: number;
}

export interface Demographics {
  /** Millions. */
  readonly population: number;
  /** People per square kilometre. */
  readonly populationDensity: number;
  readonly urbanShare: number;
  readonly ethnic: readonly Share[];
  readonly religious: readonly Share[];
  /** GNP per head, notional thousands. */
  readonly incomePerHead: number;
}

/**
 * The psychological profile of a head of state, as the game-master writes it
 * into the World Situation. All traits run 0 (none) to 1 (extreme).
 */
export interface HeadOfStateProfile {
  readonly title: string;
  /** Willingness to absorb losses rather than back down. */
  readonly resolve: number;
  /** Appetite for gambles with uncertain outcomes. */
  readonly riskTolerance: number;
  /** Likelihood of honouring a pact once made. */
  readonly pactFidelity: number;
  /** Tendency to claim more resolve or megatonnage than it has. */
  readonly bluffing: number;
  /** How readily it escalates to SACPOP once struck. */
  readonly sacpopReadiness: number;
  readonly summary: string;
}

export interface CombatantDef {
  readonly id: CombatantId;
  /** The code the game shows, spelled as the novel spells it. */
  readonly code: string;
  readonly name: string;
  /** What the code expands to; inferred where the novel gives no expansion. */
  readonly expansion: string;
  readonly teamSize: { readonly min: number; readonly max: number };
  /** Roles inside the team, e.g. President, launchman. */
  readonly roles: readonly string[];
  readonly economics: Economics;
  /**
   * The Combatant's ratio (strategic spending / GNP) in previous games,
   * oldest first: the statistician of record's files.
   */
  readonly ratioHistory: readonly number[];
  readonly landSeaAir: LandSeaAir;
  readonly demographics: Demographics;
  readonly headOfState: HeadOfStateProfile;
  /** Most warheads one jockstrap MIRV may carry (A10). */
  readonly mirvCap: number;
  /** Red Yahtzee dice rolled under the old rules. */
  readonly yahtzeeDice: number;
  /** Where its players stand on the map. */
  readonly stand: LonLat;
  /**
   * A fixed number of warheads instead of the formula, for Combatants
   * the formula does not describe (the insurgent cell's howitzer shells).
   */
  readonly fixedWarheads?: number;
  /** A later name the scenario may give it (LIBSYR becomes IRLIBSYR). */
  readonly expandsTo?: { readonly code: string; readonly name: string };
}

export interface UnplayedNationDef {
  readonly id: UnplayedNationId;
  readonly name: string;
  readonly capital: LonLat;
}

/** The garments and gear laid on the court. */
export const GARMENT_KINDS = [
  'tshirt',
  'towel',
  'red-shorts',
  'gray-shorts',
  'armband',
  'sock-boys-tennis',
  'sock-boys-street',
  'sock-girls-bunny',
  'sock-girls-plain',
  'sneaker',
] as const;
export type GarmentKind = (typeof GARMENT_KINDS)[number];

/** What a garment stands for on the map. */
export const TARGET_TYPES = [
  'MAMA',
  'airfield',
  'bridge',
  'satellite-site',
  'carrier-group',
  'power-plant',
  'rail-convergence',
  'CONFORCON',
  'SSTRAC',
  'enrichment-plant',
  'reactor',
  'fusion-lab',
  'missile-installation',
  'silo-cluster',
  'antimissile-installation',
  'bomber-squadron',
  'submarine',
] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export type Terrain = 'flat' | 'rolling' | 'mountainous' | 'coastal' | 'sea';

export interface TargetItem {
  readonly id: string;
  readonly type: TargetType;
  readonly name: string;
  readonly owner: OwnerId;
  readonly at: LonLat;
  readonly terrain: Terrain;
  /** Millions, for MAMAs. */
  readonly population?: number;
  /** Skyscraper density raises the strikes a firestorm needs (Toronto takes two). */
  readonly highRise?: boolean;
  /** Submarines and carrier groups may move per scenario rules. */
  readonly mobile?: boolean;
  /** Launch platform: warheads may be lobbed from here (A9). */
  readonly platform?: 'land' | 'sea' | 'air';
  /** Free text: where a reading of the novel was needed. */
  readonly note?: string;
}

export type Precipitation = 'none' | 'rain' | 'snow';

/** Weather written into the World Situation. Court weather never counts. */
export interface ScenarioWeather {
  /** Direction the wind blows towards, degrees clockwise from north. */
  readonly windToward: number;
  readonly windKmh: number;
  readonly precipitation: Precipitation;
  /** 0 clear to 1 overcast. */
  readonly cloud: number;
}

export interface ForceDistribution {
  /** Divisions. */
  readonly land: number;
  /** Major surface ships and submarines. */
  readonly sea: number;
  /** Combat air wings. */
  readonly air: number;
}

export type AllocationMethod = 'literal' | 'meanValue' | 'pemulisShortcut' | 'yahtzee';

export interface WorldSituation {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly combatants: readonly CombatantId[];
  /** Per-Combatant changes to the standing data for this game. */
  readonly economics: Partial<Record<CombatantId, Economics>>;
  readonly forces: Partial<Record<CombatantId, ForceDistribution>>;
  /** One entry per map quadrant: a quadrant is a court. */
  readonly weather: Readonly<Record<6 | 7 | 8 | 9, ScenarioWeather>>;
  readonly allocationMethod: AllocationMethod;
  /** Where the insurgent cell's howitzer is emplaced, if it plays. */
  readonly howitzerAt?: LonLat;
  /** The game's clock, in minutes after midnight: when play starts and when the siren ends it. */
  readonly clock?: { readonly start: number; readonly end: number };
  readonly seed: number;
  /** The scenario's own TRIGSIT, which the game-master proposes instead of a precedent. */
  readonly trigsit?: Trigsit;
  /** Who plays whom, when the scenario says. */
  readonly cast?: Cast;
  /** Real weather the day brings to the East Courts, by the game clock. EndStat never reads it. */
  readonly courtWeatherAt?: readonly CourtWeatherChange[];
  /** New names, when a TRIGSIT has changed who a Combatant is (LIBSYR becomes IRLIBSYR). */
  readonly codes?: Partial<Record<CombatantId, string>>;
  /** Unplayed nations that have thrown in with a Combatant: their garments are its now. */
  readonly allies?: Partial<Record<UnplayedNationId, CombatantId>>;
  /** Share of a garment already lost before play: a site's value, a city's people. */
  readonly losses?: Readonly<Record<string, number>>;
  /** Share of a city's people evacuated before play. */
  readonly evacuated?: Readonly<Record<string, number>>;
  /** Hostile acts before play. The Decision Tree counts them as strikes. */
  readonly incidents?: readonly Incident[];
}

/** A hostile act in a TRIGSIT, by one Combatant against another. */
export interface Incident {
  readonly by: CombatantId;
  readonly against: CombatantId;
  readonly what: string;
}

/** What a TRIGSIT event does to the World Situation once the TRIGSIT stands. */
export type SituationChanges = Pick<
  WorldSituation,
  'codes' | 'allies' | 'losses' | 'evacuated' | 'incidents'
>;

export interface TrigsitEvent {
  readonly text: string;
  /** Combatants whose DEFCON goes up one step. */
  readonly raise?: readonly CombatantId[];
  readonly changes?: SituationChanges;
  /** The game-master asks EndStat's Decision Tree what this Combatant must do, and says so. */
  readonly posit?: CombatantId;
}

export interface Trigsit {
  readonly id: string;
  readonly title: string;
  readonly events: readonly TrigsitEvent[];
  /** Combatants whose DEFCON goes up one step when the TRIGSIT stands. */
  readonly raise?: readonly CombatantId[];
}

export interface CastMember {
  readonly name: string;
  /** Overrides the Combatant's usual role for this seat. */
  readonly role?: string;
}

export interface Cast {
  readonly gameMaster: string;
  /** The former game-master who corrects the math from outside the fence. */
  readonly emeritus: string;
  /** In the order of the Combatant's roles (its first player is its head of state). */
  readonly combatants: Partial<Record<CombatantId, readonly (CastMember | undefined)[]>>;
}

export interface CourtWeatherChange {
  readonly at: number;
  readonly precipitation: Precipitation;
  readonly text: string;
}
