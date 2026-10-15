/**
 * Whose territory each country on the map is. Keys are ISO 3166 numeric codes
 * as used by Natural Earth (world-atlas). Countries not listed are background:
 * on the map, owned by nobody.
 *
 * The map uses present-day borders, so the Cold War blocs are rebuilt from
 * today's countries, and East Germany is drawn back in by hand.
 */
import type { LonLat, OwnerId } from '../types';

export const OWNER_BY_COUNTRY: Readonly<Record<string, OwnerId>> = {
  // AMNAT: the United States and its NATO allies (Italy acts on its own: A25).
  '840': 'AMNAT', // United States
  '826': 'AMNAT', // United Kingdom
  '250': 'AMNAT', // France
  '276': 'AMNAT', // Germany (the east is redrawn below)
  '056': 'AMNAT', // Belgium
  '528': 'AMNAT', // Netherlands
  '442': 'AMNAT', // Luxembourg
  '578': 'AMNAT', // Norway
  '208': 'AMNAT', // Denmark
  '304': 'AMNAT', // Greenland
  '352': 'AMNAT', // Iceland
  '620': 'AMNAT', // Portugal
  '724': 'AMNAT', // Spain
  '792': 'AMNAT', // Turkey
  '300': 'AMNAT', // Greece
  // SOVWAR: the Soviet republics and the Warsaw Pact.
  '643': 'SOVWAR', // Russia
  '804': 'SOVWAR', // Ukraine
  '112': 'SOVWAR', // Belarus
  '398': 'SOVWAR', // Kazakhstan
  '860': 'SOVWAR', // Uzbekistan
  '795': 'SOVWAR', // Turkmenistan
  '417': 'SOVWAR', // Kyrgyzstan
  '762': 'SOVWAR', // Tajikistan
  '268': 'SOVWAR', // Georgia
  '051': 'SOVWAR', // Armenia
  '031': 'SOVWAR', // Azerbaijan
  '498': 'SOVWAR', // Moldova
  '440': 'SOVWAR', // Lithuania
  '428': 'SOVWAR', // Latvia
  '233': 'SOVWAR', // Estonia
  '616': 'SOVWAR', // Poland
  '203': 'SOVWAR', // Czechia
  '703': 'SOVWAR', // Slovakia
  '348': 'SOVWAR', // Hungary
  '642': 'SOVWAR', // Romania
  '100': 'SOVWAR', // Bulgaria
  '156': 'REDCHI', // China
  '434': 'LIBSYR', // Libya
  '760': 'LIBSYR', // Syria
  '710': 'SOUTHAF', // South Africa
  '516': 'SOUTHAF', // Namibia, then under South African rule
  '356': 'INDPAK', // India
  '586': 'INDPAK', // Pakistan
  // Unplayed nations (A13).
  '124': 'CANADA',
  '376': 'ISRAEL',
  '380': 'ITALY',
  '008': 'ALBANIA',
  '364': 'IRAN',
  '368': 'IRAQ',
  '392': 'JAPAN',
  '694': 'SIERRA_LEONE',
};

/** The German Democratic Republic, roughly, inside today's Germany. */
export const EAST_GERMANY: readonly LonLat[] = [
  [10.9, 54.0],
  [11.0, 53.6],
  [10.6, 53.4],
  [11.3, 53.1],
  [11.0, 52.9],
  [10.8, 52.4],
  [11.0, 52.0],
  [10.6, 51.6],
  [10.2, 51.2],
  [9.95, 50.6],
  [10.9, 50.3],
  [12.2, 50.3],
  [12.5, 50.4],
  [14.8, 50.85],
  [15.05, 51.1],
  [14.6, 51.8],
  [14.7, 52.6],
  [14.1, 52.9],
  [14.4, 53.3],
  [14.2, 53.9],
  [13.8, 54.6],
  [12.5, 54.5],
  [11.1, 54.1],
].map(([lon, lat]) => ({ lon: lon ?? 0, lat: lat ?? 0 }));

/** Fill colours for each owner's territory on the map. */
export const OWNER_COLORS: Readonly<Record<OwnerId, string>> = {
  AMNAT: '#4ea8de',
  SOVWAR: '#e5383b',
  REDCHI: '#ffb703',
  LIBSYR: '#9d4edd',
  SOUTHAF: '#06d6a0',
  INDPAK: '#ff8fab',
  INSURGENT: '#f1faee',
  CANADA: '#bdbdbd',
  ISRAEL: '#bdbdbd',
  ITALY: '#bdbdbd',
  ALBANIA: '#bdbdbd',
  IRAN: '#bdbdbd',
  IRAQ: '#bdbdbd',
  JAPAN: '#bdbdbd',
  SIERRA_LEONE: '#bdbdbd',
};
