// Map registry: server and client build the same level from its id.
import type { LevelDef } from '../types';
import { buildTestShip } from './test-ship';
import { buildTrainingBay } from './training-bay';
import { buildKestrel } from './kestrel';
import { buildSplitDeck } from './split-deck';
import { buildArena } from './arena';
import { withSkyArena } from '../sky-arena';

export interface MapInfo {
  id: string;
  name: string;
  build: () => LevelDef;
  competitive: boolean;
  /** built as a mirror image across x = 0 (map.test.ts checks it) */
  symmetric?: boolean;
  /** an Arena 1v1 map (duel pits, rules/arena.ts): only for the Arena, never for other modes */
  arena?: boolean;
}

export const MAPS: MapInfo[] = [
  { id: 'training-bay', name: 'Training Bay', build: buildTrainingBay, competitive: false },
  // the first competitive map is the default for matches (online rooms, practice)
  { id: 'split-deck', name: 'Split Deck', build: buildSplitDeck, competitive: true },
  { id: 'kestrel', name: 'Kestrel', build: buildKestrel, competitive: true, symmetric: true },
  { id: 'proving-grounds', name: 'Proving Grounds', build: buildTestShip, competitive: false },
  {
    id: 'arena',
    name: 'Arena',
    build: buildArena,
    competitive: false,
    symmetric: true,
    arena: true,
  },
];

/** The map Arena 1v1 rooms and practice run on. */
export const ARENA_MAP_ID = 'arena';

export const registerMap = (m: MapInfo): void => {
  const i = MAPS.findIndex((x) => x.id === m.id);
  if (i >= 0) MAPS[i] = m;
  else MAPS.unshift(m);
};

const cache = new Map<string, LevelDef>();

export const getMap = (id: string): MapInfo => MAPS.find((m) => m.id === id) ?? MAPS[0];

/**
 * Built level definition (cached; treat as read-only). Competitive maps also get the sky duel
 * overtime arena (level/sky-arena.ts) floating high above the ship.
 */
export const mapDef = (id: string): LevelDef => {
  const m = getMap(id);
  let d = cache.get(m.id);
  if (!d) {
    d = m.build();
    if (m.competitive) d = withSkyArena(d);
    cache.set(m.id, d);
  }
  return d;
};

export const DEFAULT_MAP = (): string => MAPS[0].id;

/** The map matches use unless the players pick another one. */
export const DEFAULT_MATCH_MAP = (): string => (MAPS.find((m) => m.competitive) ?? MAPS[0]).id;
