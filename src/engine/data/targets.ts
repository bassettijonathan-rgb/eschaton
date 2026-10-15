/**
 * The target items laid on the courts: what each garment stands for, where it
 * lies on the map, and who owns it. Positions are real-world coordinates
 * projected by A6; where two real sites would put garments on top of each
 * other, the smaller site is left off or moved a little, and the item's note
 * says so.
 */
import type { GarmentKind, TargetItem, TargetType } from '../types';

/** Which garment represents each kind of target (section 1.1, A2, A3). */
export const GARMENT_FOR_TARGET: Readonly<Record<TargetType, GarmentKind>> = {
  MAMA: 'tshirt',
  airfield: 'towel',
  bridge: 'towel',
  'satellite-site': 'towel',
  'carrier-group': 'towel',
  'power-plant': 'towel',
  'rail-convergence': 'towel',
  CONFORCON: 'red-shorts',
  SSTRAC: 'gray-shorts',
  'enrichment-plant': 'armband',
  reactor: 'armband',
  'fusion-lab': 'armband',
  'missile-installation': 'sock-boys-tennis',
  'silo-cluster': 'sock-boys-street',
  'antimissile-installation': 'sock-girls-bunny',
  'bomber-squadron': 'sock-girls-plain',
  submarine: 'sneaker',
};

export interface GarmentDef {
  readonly kind: GarmentKind;
  readonly label: string;
  /** Laid flat and square to the court: east-west by north-south, metres. */
  readonly footprint: { readonly width: number; readonly depth: number };
  /** Shown in the legend where the game departs from the novel. */
  readonly legendNote?: string;
}

export const GARMENTS: Readonly<Record<GarmentKind, GarmentDef>> = {
  tshirt: {
    kind: 'tshirt',
    label: 'Folded gray-and-red E.T.A. T-shirt',
    footprint: { width: 0.3, depth: 0.24 },
  },
  towel: {
    kind: 'towel',
    label: 'Towel stolen from a junior-tour motel',
    footprint: { width: 0.36, depth: 0.24 },
  },
  'red-shorts': {
    kind: 'red-shorts',
    label: 'Red shorts with gray trim',
    footprint: { width: 0.28, depth: 0.22 },
  },
  'gray-shorts': {
    kind: 'gray-shorts',
    label: 'Gray shorts with red trim',
    footprint: { width: 0.28, depth: 0.22 },
    legendNote:
      'The novel describes SSTRACs and CONFORCONs alike as red shorts with gray trim; here SSTRACs are gray shorts with red trim so they can be told apart.',
  },
  armband: {
    kind: 'armband',
    label: 'Black E.T.A. armband',
    footprint: { width: 0.1, depth: 0.07 },
  },
  'sock-boys-tennis': {
    kind: 'sock-boys-tennis',
    label: "Boys' tennis sock",
    footprint: { width: 0.24, depth: 0.09 },
  },
  'sock-boys-street': {
    kind: 'sock-boys-street',
    label: "Boys' street-shoe sock",
    footprint: { width: 0.24, depth: 0.09 },
  },
  'sock-girls-bunny': {
    kind: 'sock-girls-bunny',
    label: "Girls' tennis sock with bunny-tail",
    footprint: { width: 0.24, depth: 0.09 },
  },
  'sock-girls-plain': {
    kind: 'sock-girls-plain',
    label: "Girls' tennis sock without bunny-tail",
    footprint: { width: 0.24, depth: 0.09 },
  },
  sneaker: {
    kind: 'sneaker',
    label: 'Worn-out sponsor sneaker',
    footprint: { width: 0.29, depth: 0.11 },
  },
};

/**
 * How far a mobile garment may move in one move, km: about twelve hours'
 * steaming (a missile submarine at 20 knots, a carrier group at 25). Nothing
 * else on the map moves (section 1.7).
 */
export const MOBILE_RANGE_KM: Readonly<Partial<Record<TargetType, number>>> = {
  submarine: 450,
  'carrier-group': 550,
};

export const TARGET_TYPE_LABELS: Readonly<Record<TargetType, string>> = {
  MAMA: 'MAMA (Major Metro Area)',
  airfield: 'Airfield',
  bridge: 'Bridge',
  'satellite-site': 'Satellite monitoring site',
  'carrier-group': 'Carrier group',
  'power-plant': 'Conventional power plant',
  'rail-convergence': 'Rail convergence',
  CONFORCON: 'CONFORCON (Conventional-Force Concentration)',
  SSTRAC: 'SSTRAC (Site of Strategic Command)',
  'enrichment-plant': 'Enrichment plant',
  reactor: 'Reactor',
  'fusion-lab': 'Annular Fusion lab',
  'missile-installation': 'Missile installation',
  'silo-cluster': 'Isolated silo cluster',
  'antimissile-installation': 'Antimissile installation',
  'bomber-squadron': 'Cruise-capable B-2 / SS-5 squadron',
  submarine: 'Submarine',
};

type Spec = Omit<TargetItem, 'id'> & { id?: string };

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const mama = (
  owner: TargetItem['owner'],
  name: string,
  lon: number,
  lat: number,
  population: number,
  terrain: TargetItem['terrain'],
  extra: Partial<TargetItem> = {},
): Spec => ({ type: 'MAMA', owner, name, at: { lon, lat }, population, terrain, ...extra });

const site = (
  type: TargetType,
  owner: TargetItem['owner'],
  name: string,
  lon: number,
  lat: number,
  terrain: TargetItem['terrain'],
  extra: Partial<TargetItem> = {},
): Spec => ({ type, owner, name, at: { lon, lat }, terrain, ...extra });

const SPECS: readonly Spec[] = [
  // AMNAT: the United States
  mama('AMNAT', 'New York', -74.0, 40.71, 16, 'coastal', { highRise: true }),
  mama('AMNAT', 'Los Angeles', -118.24, 34.05, 12, 'coastal'),
  mama('AMNAT', 'Chicago', -87.63, 41.88, 8, 'flat', { highRise: true }),
  mama('AMNAT', 'Washington', -77.04, 38.9, 4, 'rolling'),
  mama('AMNAT', 'Boston', -71.06, 42.36, 4, 'coastal'),
  mama('AMNAT', 'San Francisco', -122.42, 37.77, 6, 'coastal'),
  mama('AMNAT', 'Houston', -95.37, 29.76, 4, 'flat'),
  mama('AMNAT', 'Detroit', -83.05, 42.33, 4, 'flat'),
  mama('AMNAT', 'Atlanta', -84.39, 33.75, 3, 'rolling'),
  mama('AMNAT', 'Peoria', -89.59, 40.69, 0.35, 'flat'),
  mama('AMNAT', 'Provo', -111.66, 40.23, 0.3, 'mountainous'),
  site('SSTRAC', 'AMNAT', 'Cheyenne Mountain', -104.85, 38.74, 'mountainous'),
  site('CONFORCON', 'AMNAT', 'Fort Hood', -97.73, 31.14, 'rolling'),
  site('CONFORCON', 'AMNAT', 'Fort Bragg', -79.0, 35.14, 'rolling'),
  site('enrichment-plant', 'AMNAT', 'Portsmouth enrichment plant, Ohio', -83.0, 39.0, 'rolling'),
  site('fusion-lab', 'AMNAT', 'Annular Fusion lab, North Syracuse', -76.13, 43.13, 'rolling'),
  site('fusion-lab', 'AMNAT', 'Annular Fusion lab, Presque Isle', -68.0, 46.68, 'rolling'),
  site('reactor', 'AMNAT', 'Three Mile Island', -76.72, 40.15, 'rolling'),
  site('missile-installation', 'AMNAT', 'Malmstrom missile field', -111.2, 47.5, 'flat', {
    platform: 'land',
  }),
  site('missile-installation', 'AMNAT', 'Minot missile field', -101.3, 48.4, 'flat', {
    platform: 'land',
  }),
  site('missile-installation', 'AMNAT', 'Whiteman missile field', -93.55, 38.73, 'rolling', {
    platform: 'land',
  }),
  site('silo-cluster', 'AMNAT', 'F. E. Warren silos', -104.8, 41.13, 'flat', { platform: 'land' }),
  site('antimissile-installation', 'AMNAT', 'Grand Forks Safeguard site', -97.9, 48.6, 'flat'),
  site('bomber-squadron', 'AMNAT', 'Barksdale bomber wing', -93.66, 32.5, 'flat', {
    platform: 'air',
  }),
  site('bomber-squadron', 'AMNAT', 'Fairchild bomber wing', -117.65, 47.6, 'flat', {
    platform: 'air',
  }),
  site('rail-convergence', 'AMNAT', 'St. Louis rail yards', -90.2, 38.63, 'flat'),
  site('power-plant', 'AMNAT', 'Hoover Dam', -114.74, 36.02, 'mountainous'),
  site('bridge', 'AMNAT', 'Mackinac Bridge', -84.73, 45.8, 'coastal'),
  site('satellite-site', 'AMNAT', 'Thule satellite receiver', -68.7, 76.53, 'coastal'),
  site('satellite-site', 'AMNAT', 'Fylingdales satellite receiver', -0.67, 54.36, 'rolling'),
  site('carrier-group', 'AMNAT', 'Atlantic carrier group', -40, 45, 'sea', { mobile: true }),
  site('carrier-group', 'AMNAT', 'Mediterranean carrier group', 20, 36.5, 'sea', { mobile: true }),
  site('submarine', 'AMNAT', 'Atlantic missile submarine', -55, 33, 'sea', {
    mobile: true,
    platform: 'sea',
  }),
  site('submarine', 'AMNAT', 'Pacific missile submarine', -150, 30, 'sea', {
    mobile: true,
    platform: 'sea',
  }),
  site('submarine', 'AMNAT', 'Norwegian Sea missile submarine', 2, 68, 'sea', {
    mobile: true,
    platform: 'sea',
  }),
  // AMNAT: the NATO allies
  mama('AMNAT', 'London', -0.13, 51.51, 12, 'flat'),
  mama('AMNAT', 'Paris', 2.35, 48.86, 10, 'flat'),
  mama('AMNAT', 'Brussels', 4.35, 50.85, 2, 'flat'),
  mama('AMNAT', 'Hamburg', 10.0, 53.55, 2, 'flat'),
  mama('AMNAT', 'Munich', 11.58, 48.14, 2, 'rolling'),
  mama('AMNAT', 'Istanbul', 28.98, 41.01, 6, 'coastal'),
  mama('AMNAT', 'Athens', 23.73, 37.98, 3, 'coastal'),
  site('CONFORCON', 'AMNAT', 'Fulda Gap forces', 9.68, 50.55, 'rolling'),
  site('airfield', 'AMNAT', 'Ramstein airfield', 7.6, 49.44, 'rolling'),

  // SOVWAR
  mama('SOVWAR', 'Moscow', 37.62, 55.75, 9, 'flat'),
  mama('SOVWAR', 'Leningrad', 30.32, 59.94, 5, 'coastal'),
  mama('SOVWAR', 'Kiev', 30.52, 50.45, 3, 'rolling'),
  mama('SOVWAR', 'Kharkov', 36.23, 50.0, 1.6, 'flat'),
  mama('SOVWAR', 'Minsk', 27.56, 53.9, 1.6, 'flat'),
  mama('SOVWAR', 'Volgograd', 44.5, 48.7, 1, 'flat'),
  mama('SOVWAR', 'Sverdlovsk', 60.6, 56.84, 1.3, 'rolling'),
  mama('SOVWAR', 'Novosibirsk', 82.92, 55.03, 1.5, 'flat'),
  mama('SOVWAR', 'Tashkent', 69.24, 41.3, 2, 'flat'),
  mama('SOVWAR', 'Vladivostok', 131.89, 43.12, 0.6, 'coastal'),
  mama('SOVWAR', 'Warsaw', 21.01, 52.23, 1.7, 'flat'),
  mama('SOVWAR', 'East Berlin', 13.4, 52.52, 1.3, 'flat'),
  mama('SOVWAR', 'Prague', 14.42, 50.08, 1.2, 'rolling'),
  mama('SOVWAR', 'Ostrava', 18.29, 49.83, 0.3, 'rolling'),
  mama('SOVWAR', 'Budapest', 19.04, 47.5, 2, 'flat'),
  mama('SOVWAR', 'Bucharest', 26.1, 44.43, 2, 'flat'),
  site('SSTRAC', 'SOVWAR', 'Kosvinsky Mountain command', 59.0, 59.5, 'mountainous'),
  site('CONFORCON', 'SOVWAR', 'Group of Soviet Forces, Germany', 11.62, 52.13, 'flat', {
    note: 'Placed at Magdeburg; the real headquarters at Wünsdorf would lie under East Berlin.',
  }),
  site('CONFORCON', 'SOVWAR', 'Carpathian forces, Lvov', 24.03, 49.84, 'rolling'),
  site('CONFORCON', 'SOVWAR', 'Far East forces, Khabarovsk', 135.07, 48.48, 'flat'),
  site('fusion-lab', 'SOVWAR', 'Annular Fusion lab, Chyonskrg', 88.0, 60.0, 'flat', {
    note: 'The novel names Chyonskrg but not where it is; placed in western Siberia.',
  }),
  site('fusion-lab', 'SOVWAR', 'Annular Fusion lab, Pliscu', 24.5, 46.0, 'rolling', {
    note: 'The novel names Pliscu but not where it is; placed in Romania.',
  }),
  site('reactor', 'SOVWAR', 'Kursk reactor', 35.6, 51.67, 'flat'),
  site('enrichment-plant', 'SOVWAR', 'Tomsk-7 enrichment plant', 84.87, 56.6, 'flat'),
  site('missile-installation', 'SOVWAR', 'Kozelsk missile field', 35.77, 54.03, 'rolling', {
    platform: 'land',
  }),
  site('missile-installation', 'SOVWAR', 'Kartaly missile field', 60.6, 53.05, 'flat', {
    platform: 'land',
  }),
  site('silo-cluster', 'SOVWAR', 'Dombarovsky silos', 59.85, 50.75, 'flat', { platform: 'land' }),
  site('antimissile-installation', 'SOVWAR', 'Moscow antimissile ring', 37.6, 57.4, 'flat'),
  site('bomber-squadron', 'SOVWAR', 'Engels bomber regiment', 46.2, 51.48, 'flat', {
    platform: 'air',
  }),
  site('airfield', 'SOVWAR', 'Severomorsk airfield', 33.4, 69.07, 'coastal'),
  site('rail-convergence', 'SOVWAR', 'Chelyabinsk rail junction', 61.4, 55.16, 'flat'),
  site('power-plant', 'SOVWAR', 'Bratsk dam', 101.6, 56.15, 'rolling'),
  site('satellite-site', 'SOVWAR', 'Big Ear station, Sakhalin', 142.7, 50.0, 'coastal'),
  site('submarine', 'SOVWAR', 'Barents Sea missile submarine', 40, 72, 'sea', {
    mobile: true,
    platform: 'sea',
  }),
  site('submarine', 'SOVWAR', 'Sea of Okhotsk missile submarine', 150, 55, 'sea', {
    mobile: true,
    platform: 'sea',
  }),
  site('submarine', 'SOVWAR', 'North Atlantic missile submarine', -30, 55, 'sea', {
    mobile: true,
    platform: 'sea',
  }),

  // REDCHI
  mama('REDCHI', 'Beijing', 116.4, 39.9, 10, 'flat'),
  mama('REDCHI', 'Shanghai', 121.47, 31.23, 12, 'coastal'),
  mama('REDCHI', 'Guangzhou', 113.26, 23.13, 6, 'coastal'),
  mama('REDCHI', 'Wuhan', 114.3, 30.59, 4, 'flat'),
  mama('REDCHI', 'Chongqing', 106.55, 29.56, 6, 'mountainous'),
  mama('REDCHI', 'Shenyang', 123.43, 41.8, 4, 'flat'),
  mama('REDCHI', 'Lanzhou', 103.83, 36.06, 2, 'mountainous'),
  mama('REDCHI', 'Urumqi', 87.6, 43.8, 1, 'rolling'),
  site('SSTRAC', 'REDCHI', 'Strategic rocket command, Taiyuan', 112.55, 37.87, 'mountainous', {
    note: 'The real command sites lie under Beijing; placed at Taiyuan.',
  }),
  site('CONFORCON', 'REDCHI', 'Chengdu forces', 104.07, 30.67, 'flat'),
  site('enrichment-plant', 'REDCHI', 'Plant 404, Jiuquan', 97.8, 40.0, 'flat'),
  site('reactor', 'REDCHI', 'Lop Nur', 89.6, 41.5, 'flat'),
  site('missile-installation', 'REDCHI', 'Delingha missile base', 97.37, 37.37, 'mountainous', {
    platform: 'land',
  }),
  site('silo-cluster', 'REDCHI', 'Luoning silos', 111.65, 34.39, 'mountainous', {
    platform: 'land',
  }),
  site('bomber-squadron', 'REDCHI', 'Datong bomber regiment', 113.3, 40.1, 'rolling', {
    platform: 'air',
  }),
  site('submarine', 'REDCHI', 'Yellow Sea missile submarine', 123.5, 36.5, 'sea', {
    mobile: true,
    platform: 'sea',
  }),
  site('submarine', 'REDCHI', 'South China Sea submarine', 114, 15, 'sea', { mobile: true }),

  // LIBSYR
  mama('LIBSYR', 'Tripoli', 13.18, 32.89, 1.5, 'coastal'),
  mama('LIBSYR', 'Benghazi', 20.07, 32.12, 0.7, 'coastal'),
  mama('LIBSYR', 'Damascus', 36.29, 33.51, 3, 'rolling'),
  mama('LIBSYR', 'Aleppo', 37.16, 36.2, 2.5, 'flat'),
  site('SSTRAC', 'LIBSYR', 'Libyan command, Sirte', 16.59, 31.2, 'coastal'),
  site('CONFORCON', 'LIBSYR', 'Syrian armour, Deir ez-Zor', 40.14, 35.33, 'flat'),
  site('CONFORCON', 'LIBSYR', 'Libyan forces, Kufra', 23.3, 24.2, 'flat'),
  site('missile-installation', 'LIBSYR', 'Sabha missile base', 14.43, 27.03, 'flat', {
    platform: 'land',
  }),
  site('bomber-squadron', 'LIBSYR', 'Palmyra bomber squadron', 38.27, 34.55, 'flat', {
    platform: 'air',
  }),
  site('submarine', 'LIBSYR', 'Libyan submarine', 15.5, 34.2, 'sea', {
    mobile: true,
    platform: 'sea',
  }),

  // SOUTHAF
  mama('SOUTHAF', 'Johannesburg', 28.05, -26.2, 3, 'rolling'),
  mama('SOUTHAF', 'Cape Town', 18.42, -33.92, 2, 'coastal'),
  mama('SOUTHAF', 'Durban', 31.03, -29.86, 1.5, 'coastal'),
  mama('SOUTHAF', 'Port Elizabeth', 25.6, -33.96, 1, 'coastal'),
  site('SSTRAC', 'SOUTHAF', 'Strategic command, Bloemfontein', 26.2, -29.1, 'flat', {
    note: 'The real command sites lie under Johannesburg and Pretoria; placed at Bloemfontein.',
  }),
  site('CONFORCON', 'SOUTHAF', 'Border forces, Grootfontein', 18.1, -19.57, 'flat'),
  site('reactor', 'SOUTHAF', 'Vastrap test site', 21.4, -27.8, 'flat'),
  site('missile-installation', 'SOUTHAF', 'Overberg missile range', 20.25, -34.6, 'coastal', {
    platform: 'land',
  }),
  site('bomber-squadron', 'SOUTHAF', 'Hoedspruit bomber squadron', 31.0, -24.37, 'flat', {
    platform: 'air',
  }),

  // INDPAK
  mama('INDPAK', 'Bombay', 72.88, 19.08, 12, 'coastal'),
  mama('INDPAK', 'Delhi', 77.21, 28.61, 10, 'flat'),
  mama('INDPAK', 'Calcutta', 88.36, 22.57, 11, 'flat'),
  mama('INDPAK', 'Madras', 80.27, 13.08, 6, 'coastal'),
  mama('INDPAK', 'Karachi', 67.0, 24.86, 9, 'coastal'),
  mama('INDPAK', 'Lahore', 74.34, 31.55, 5, 'flat'),
  mama('INDPAK', 'Islamabad', 73.05, 33.7, 1, 'rolling'),
  site('CONFORCON', 'INDPAK', 'Kashmir line-of-control forces', 75.0, 34.5, 'mountainous'),
  site('reactor', 'INDPAK', 'Rawatbhata reactor', 75.6, 24.9, 'rolling'),
  site('missile-installation', 'INDPAK', 'Sargodha missile base', 72.67, 32.08, 'flat', {
    platform: 'land',
  }),
  site('bomber-squadron', 'INDPAK', 'Agra bomber squadron', 78.0, 27.18, 'flat', {
    platform: 'air',
  }),

  // Unplayed nations: on the map, worth nothing to anybody (A13).
  mama('CANADA', 'Toronto', -79.38, 43.65, 3, 'flat', { highRise: true }),
  mama('CANADA', 'Montreal', -73.57, 45.5, 3, 'rolling'),
  mama('CANADA', 'Vancouver', -123.12, 49.28, 1.5, 'coastal'),
  mama('ISRAEL', 'Tel Aviv', 34.78, 32.08, 1, 'coastal'),
  site('reactor', 'ISRAEL', 'Dimona reactor', 35.14, 31.0, 'flat'),
  mama('ITALY', 'Rome', 12.5, 41.9, 3, 'rolling'),
  mama('ITALY', 'Milan', 9.19, 45.46, 2, 'flat'),
  mama('ALBANIA', 'Tirana', 19.82, 41.33, 0.3, 'rolling'),
  mama('IRAN', 'Tehran', 51.39, 35.69, 7, 'mountainous'),
  mama('IRAQ', 'Baghdad', 44.36, 33.31, 4, 'flat'),
  mama('JAPAN', 'Tokyo', 139.69, 35.69, 12, 'coastal', { highRise: true }),
  mama('SIERRA_LEONE', 'Freetown', -13.23, 8.48, 0.5, 'coastal'),
];

export const TARGETS: readonly TargetItem[] = SPECS.map((s) => ({
  ...s,
  id: s.id ?? `${s.owner.toLowerCase()}-${slug(s.name)}`,
}));

export function garmentFor(item: TargetItem): GarmentDef {
  return GARMENTS[GARMENT_FOR_TARGET[item.type]];
}
