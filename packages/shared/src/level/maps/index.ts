// Map registry: server and client build the same level from its id.
import type { LevelDef } from '../types';
import { buildTestShip } from './test-ship';
import { buildTrainingBay } from './training-bay';
import { buildKestrel } from './kestrel';
import { buildSplitDeck } from './split-deck';
import { buildArena } from './arena';
import { buildOrbitalRing } from './orbital-ring';
import { buildCanyonRelay } from './canyon-relay';
import { buildSakuraHold } from './sakura-hold';
import { buildAntipode } from './antipode';
import { buildStormglass } from './stormglass';
import { buildAfterglow } from './afterglow';
import { buildOrrery } from './orrery';
import { buildLeviathan } from './leviathan';
import { buildColossusYard } from './colossus-yard';
import type { CourseData, CourseMode } from '../course/types';
import { expandCourse } from '../course/expand';
import { sunspireCourse } from './race-sunspire';
import { neonDriftCourse } from './race-neon';
import { emberSpireCourse } from './race-ember';
import { copperReefCourse } from './surf-copper-reef';
import { glassGardenCourse } from './surf-glass-garden';
import { cloudFoundryCourse } from './surf-cloud-foundry';
import { lanternCanalCourse } from './surf-lantern-canal';
import { neonSpillwayCourse } from './surf-neon-spillway';
import { basaltCathedralCourse } from './surf-basalt-cathedral';
import { cycloneObservatoryCourse } from './surf-cyclone-observatory';
import { prismRelayCourse } from './surf-prism-relay';
import { thirtyDoorsCourse } from './surf-thirty-doors';
import { withSkyArena } from '../sky-arena';
import { FULL_TEAM_SIZE, sizedLevelDef } from '../size-walls';

export interface MapInfo {
  id: string;
  name: string;
  build: () => LevelDef;
  competitive: boolean;
  /** built as a mirror image across x = 0 (map.test.ts checks it) */
  symmetric?: boolean;
  /** an Arena 1v1 map (duel pits, rules/arena.ts): only for the Arena, never for other modes */
  arena?: boolean;
  /**
   * false: kept out of Premier's map veto pool (5v5 Bomb) even with bomb sites — a small map
   * built for 1v1–3v3 (the pool: server services/queue.ts premierMapPool)
   */
  premier?: boolean;
  /**
   * a Brawl map (TDM / FFA with respawns, rules/brawl.ts): big and open for 10 players; never
   * in the team-objective modes (Tower, Bomb, Elimination)
   */
  brawl?: boolean;
  /** a parkour race track (LevelDef.race, rules/race.ts): only for races, never other modes */
  race?: boolean;
  /**
   * a surf map (CS-style surf stages; also `race`): raced and timed like a track, listed apart
   * ("Surf"), never picked by the ranked Race queue, its own best times
   */
  surf?: boolean;
  /** built from course data (level/course: plain JSON, expanded by expandCourse) */
  course?: () => CourseData;
  /**
   * surf maps: the standard mode it belongs to — Beginner or Intermediate (the menus show it
   * as a tag and group by it; personal bests and leaderboards stay per map, grouped by mode)
   */
  mode?: CourseMode;
  /**
   * out of rotation (kept, not deleted, to come back later): no menu, room, practice or queue
   * offers it, but it is still a map the game has (mapExists) so old personal bests, boards,
   * replays and Map Maker edits that name it keep working. The parkour race tracks are retired
   * until parkour is redone.
   */
  retired?: boolean;
}

/** A map built from course data (a surf map when it has a `mode`). */
const courseMap = (
  id: string,
  name: string,
  course: () => CourseData,
  mode?: CourseMode,
  retired?: boolean,
): MapInfo => ({
  id,
  name,
  build: () => expandCourse(course()).def,
  course,
  competitive: false,
  race: true,
  ...(mode ? { surf: true, mode } : {}),
  ...(retired ? { retired: true } : {}),
});

/** The standard surf modes in the order the menus list them, with their tag colours. */
export const SURF_MODES: { mode: CourseMode; label: string; color: string }[] = [
  { mode: 'beginner', label: 'Beginner', color: '#5dd39e' },
  { mode: 'intermediate', label: 'Intermediate', color: '#f2a93b' },
  { mode: 'expert', label: 'Expert', color: '#e0525f' },
];

export const MAPS: MapInfo[] = [
  { id: 'training-bay', name: 'Training Bay', build: buildTrainingBay, competitive: false },
  // the first competitive map is the default for matches (online rooms, practice)
  { id: 'split-deck', name: 'Split Deck', build: buildSplitDeck, competitive: true },
  { id: 'kestrel', name: 'Kestrel', build: buildKestrel, competitive: true, symmetric: true },
  // mirror-symmetric north ↔ south (orbital-ring.test.ts checks it; `symmetric` means across x)
  { id: 'orbital-ring', name: 'Orbital Ring', build: buildOrbitalRing, competitive: true },
  // outdoor, mirrored north ↔ south like Orbital Ring (canyon-relay.test.ts checks it)
  { id: 'canyon-relay', name: 'Canyon Relay', build: buildCanyonRelay, competitive: true },
  // small (1v1–3v3 Elimination / Bomb): kept out of Premier's 5v5 map pool
  {
    id: 'sakura-hold',
    name: 'Sakura Hold',
    build: buildSakuraHold,
    competitive: true,
    premier: false,
  },
  // docs/NEW-MAPS.md: Antipode is fair by a half-turn (floor deck ↔ ceiling deck; antipode.test.ts
  // checks it), the others are mirrored across x = 0
  { id: 'antipode', name: 'Antipode', build: buildAntipode, competitive: true },
  {
    id: 'stormglass',
    name: 'Stormglass',
    build: buildStormglass,
    competitive: true,
    symmetric: true,
  },
  {
    id: 'afterglow',
    name: 'Afterglow',
    build: buildAfterglow,
    competitive: true,
    symmetric: true,
  },
  {
    id: 'orrery',
    name: 'The Orrery',
    build: buildOrrery,
    competitive: true,
    symmetric: true,
  },
  {
    id: 'leviathan',
    name: 'Leviathan',
    build: buildLeviathan,
    competitive: true,
    symmetric: true,
  },
  // the big Brawl map (TDM / FFA / Deathmatch practice)
  {
    id: 'colossus-yard',
    name: 'Colossus Yard',
    build: buildColossusYard,
    competitive: false,
    symmetric: true,
    brawl: true,
  },
  { id: 'proving-grounds', name: 'Proving Grounds', build: buildTestShip, competitive: false },
  {
    id: 'arena',
    name: 'Arena',
    build: buildArena,
    competitive: false,
    symmetric: true,
    arena: true,
  },
  // parkour race tracks (rules/race.ts): never competitive, never in a combat mode's pool;
  // sky courses built from course data (level/course), easiest first. RETIRED (out of every
  // menu, room and queue) until parkour is redone — the files stay and still build.
  courseMap('race-sunspire', 'Sunspire', sunspireCourse, undefined, true),
  courseMap('race-neon', 'Neon Drift', neonDriftCourse, undefined, true),
  courseMap('race-ember', 'Ember Spire', emberSpireCourse, undefined, true),
  // surf maps (docs/movement-map-design): raced like tracks, listed apart by mode (Beginner,
  // Intermediate), never in the ranked Race queue
  courseMap('surf-copper-reef', 'Copper Reef', copperReefCourse, 'beginner'),
  courseMap('surf-glass-garden', 'Glass Garden', glassGardenCourse, 'beginner'),
  courseMap('surf-cloud-foundry', 'Cloud Foundry', cloudFoundryCourse, 'beginner'),
  courseMap('surf-lantern-canal', 'Lantern Canal', lanternCanalCourse, 'beginner'),
  courseMap('surf-neon-spillway', 'Neon Spillway', neonSpillwayCourse, 'intermediate'),
  courseMap('surf-basalt-cathedral', 'Basalt Cathedral', basaltCathedralCourse, 'intermediate'),
  courseMap(
    'surf-cyclone-observatory',
    'Cyclone Observatory',
    cycloneObservatoryCourse,
    'intermediate',
  ),
  courseMap('surf-prism-relay', 'Prism Relay', prismRelayCourse, 'intermediate'),
  // 30 sealed rooms, easy to extreme (docs/movement-map-design/maps/X01-thirty-doors.md)
  courseMap('surf-thirty-doors', 'Thirty Doors', thirtyDoorsCourse, 'expert'),
];

/** Is this map in rotation? (not `retired`: menus, rooms, practice and queues may offer it) */
export const inRotation = (m: MapInfo): boolean => !m.retired;
/** Is this a map id the game has and offers (known and not retired)? */
export const mapInRotation = (id: string): boolean => MAPS.some((m) => m.id === id && !m.retired);
/**
 * Every map you can race on: the race tracks and the surf maps (race rooms, practice, PBs).
 * Retired maps are left out unless `includeRetired` (tools, old boards).
 */
export const raceMaps = (includeRetired = false): MapInfo[] =>
  MAPS.filter((m) => m.race && (includeRetired || !m.retired));
/**
 * The race tracks only (the ranked Race queue's pool). Empty while the parkour tracks are
 * retired (the Race queue is closed then); `includeRetired` lists them anyway (tools, tests).
 */
export const raceTracks = (includeRetired = false): MapInfo[] =>
  MAPS.filter((m) => m.race && !m.surf && (includeRetired || !m.retired));
/** Why the Race queue is closed while it has no tracks (server refusals and the menus say it). */
export const NO_RACE_TRACKS_TEXT = 'no race tracks right now — parkour is being rebuilt';
/** The surf maps only (Beginner first, then Intermediate; in registry order within a mode). */
export const surfMaps = (): MapInfo[] => SURF_MODES.flatMap(({ mode }) => surfMapsOf(mode));
/** The surf maps of one mode. */
export const surfMapsOf = (mode: CourseMode): MapInfo[] =>
  MAPS.filter((m) => m.race && m.surf && m.mode === mode && !m.retired);
/**
 * Is this a map id the game still has? (old personal bests, drafts and edits of removed maps)
 * True for retired maps too: retired is out of rotation, not removed.
 */
export const mapExists = (id: string): boolean => MAPS.some((m) => m.id === id);
/**
 * The map race rooms use unless the players pick another one: the easiest Beginner surf map
 * while the parkour race tracks are retired (was 'race-sunspire').
 */
export const DEFAULT_RACE_MAP = 'surf-copper-reef';

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

const sizedCache = new Map<string, LevelDef>();

/**
 * The map as played with `teamSize` players per team (level/size-walls.ts: smaller teams get
 * force-field walls closing parts of the map). Server rooms and clients build their level from
 * this, so both agree. Cached; treat as read-only. Without walls for that size: mapDef(id).
 */
export const mapDefForSize = (id: string, teamSize: number = FULL_TEAM_SIZE): LevelDef => {
  const base = mapDef(id);
  if (!base.sizeWalls?.length) return base;
  const n = Math.max(1, Math.min(FULL_TEAM_SIZE, Math.floor(teamSize) || FULL_TEAM_SIZE));
  const key = `${getMap(id).id}@${n}`;
  let d = sizedCache.get(key);
  if (!d) sizedCache.set(key, (d = sizedLevelDef(base, n)));
  return d;
};

export const DEFAULT_MAP = (): string => MAPS[0].id;

/** The map matches use unless the players pick another one. */
export const DEFAULT_MATCH_MAP = (): string => (MAPS.find((m) => m.competitive) ?? MAPS[0]).id;
