// Menu flow logic (pure: no DOM). The steps of the practice and online-room wizards, what each
// mode/objective/difficulty is called, and which maps a mode can be played on. The screens in
// app.ts / online.ts / ranked.ts render this; test/menu-flow.test.ts checks it without a browser.
import {
  MAPS,
  mapDef,
  BOT_SKILL_NAMES,
  BOT_SKILL_LABELS,
  DEFAULT_BOT_SKILL,
  DEFAULT_MATCH_MAP,
  brawlMaps,
  type BotSkillName,
  type BrawlMode,
  type LevelDef,
  type MapInfo,
  type MatchObjective,
  type LadderId,
  type RankedQueueId,
  LADDER_IDS,
  LADDERS,
} from '@space-yz/shared';
import type { IconName } from './icons';

/**
 * Arena 1v1 (shared rules/arena.ts, its map in MAPS with `arena: true`; the client entry points
 * are in game/arena-entry.ts). While false, no Arena cards are shown anywhere.
 */
export const ARENA_ENABLED = true;

/** Arena maps are only for the Arena (never offered for other modes). */
const isArenaMap = (m: MapInfo): boolean => !!m.arena;
/** Race tracks are only for races (game/race-entry.ts), and races only run on them. */
const isRaceMap = (m: MapInfo): boolean => !!m.race;

// ---------------------------------------------------------------- modes

export type PracticeMode =
  | 'brawl'
  | 'brawl-ffa'
  | 'match'
  | 'bomb'
  | 'elim'
  | 'cs'
  | 'deathmatch'
  | 'freeroam'
  | 'arena'
  | 'race';

/** Brawl (shared rules/brawl.ts): 'brawl' = team deathmatch, 'brawl-ffa' = free-for-all. */
export const isBrawlPractice = (m: PracticeMode): m is BrawlMode =>
  m === 'brawl' || m === 'brawl-ffa';

export interface Choice<T extends string> {
  id: T;
  name: string;
  desc: string;
  icon: IconName;
}

const PRACTICE_MODES: Choice<PracticeMode>[] = [
  {
    id: 'brawl',
    name: 'Brawl TDM',
    desc: 'Team deathmatch: instant respawns, first team to 50 kills. Maps rotate.',
    icon: 'team',
  },
  {
    id: 'brawl-ffa',
    name: 'Brawl FFA',
    desc: 'Everyone for themselves: instant respawns, first to 20 kills. Maps rotate.',
    icon: 'freefight',
  },
  {
    id: 'match',
    name: 'Tower match',
    desc: 'Carry the Controller into the enemy Tower. Rounds and side swaps.',
    icon: 'tower',
  },
  {
    id: 'bomb',
    name: 'Bomb match',
    desc: 'Plant the bomb at site A or B, or defuse it. Boomerang and Laser.',
    icon: 'bomb',
  },
  {
    id: 'elim',
    name: 'Elimination',
    desc: 'Last team standing wins the round. No Towers, no bomb. Boomerang or CS kit.',
    icon: 'elim',
  },
  {
    id: 'cs',
    name: 'CS mode',
    desc: 'AK + Deagle with bomb rules. Slower movement (70 %), stop to shoot straight.',
    icon: 'cs',
  },
  {
    id: 'deathmatch',
    name: 'Free fight',
    desc: 'Respawning brawl in the Training Bay. No rounds, just fight.',
    icon: 'freefight',
  },
  {
    id: 'freeroam',
    name: 'Free roam',
    desc: 'Any map, just you and target dummies. Hit stats, no rounds, no timer.',
    icon: 'range',
  },
  {
    id: 'arena',
    name: 'Arena 1v1',
    desc: 'Rotating 1v1 duels, each in its own pit. Most duel wins in 8 minutes takes it.',
    icon: 'arena',
  },
  {
    id: 'race',
    name: 'Race',
    desc: 'Parkour race, no weapons: a time trial vs your best ghost, or vs bot racers.',
    icon: 'race',
  },
];

/** Practice modes shown in the menu (Arena only when it exists). */
export const practiceModes = (arena = ARENA_ENABLED): Choice<PracticeMode>[] =>
  PRACTICE_MODES.filter((m) => m.id !== 'arena' || arena);

export const modeChoice = (id: PracticeMode): Choice<PracticeMode> =>
  PRACTICE_MODES.find((m) => m.id === id) ?? PRACTICE_MODES[0];

/** One-line descriptions of the bot difficulties (ids from the shared presets). */
export const BOT_SKILL_DESC: Record<BotSkillName, string> = {
  rookie: 'Slow to react, rarely hits. Only sees what is in front of it.',
  casual: 'Wide aim, easy to outplay. Good for learning the modes.',
  easy: 'Sees all around and fights back, but still forgiving.',
  normal: 'A fair fight: quick reactions, dodges and deflects.',
  hard: 'Fast, accurate and tricky. Bring your best.',
};

export const botSkillChoices = (): { id: BotSkillName; name: string; desc: string }[] =>
  BOT_SKILL_NAMES.map((id) => ({ id, name: BOT_SKILL_LABELS[id], desc: BOT_SKILL_DESC[id] }));

/**
 * Team sizes a practice mode offers (players per team, you included). The Arena: how many
 * players in all (you + bots), each duel is 1v1.
 */
export const sizesFor = (mode: PracticeMode): number[] =>
  mode === 'arena'
    ? [2, 4, 6, 8]
    : mode === 'race'
      ? RACE_SIZES
      : mode === 'freeroam'
        ? [1]
        : mode === 'brawl'
          ? BRAWL_TDM_SIZES
          : mode === 'brawl-ffa'
            ? BRAWL_FFA_SIZES
            : [1, 2, 3, 5];
/** Brawl TDM: players per team (you + bots); Brawl FFA: players in all (you + bots). */
const BRAWL_TDM_SIZES = [2, 3, 4, 5];
const BRAWL_FFA_SIZES = [4, 6, 8, 10];
/** A mode's team size (or player count) when yours doesn't fit it. */
const defaultSize = (mode: PracticeMode): number =>
  mode === 'arena'
    ? ARENA_DEFAULT_SIZE
    : mode === 'brawl'
      ? QUICK_PLAY_OFFLINE.tdm
      : mode === 'brawl-ffa'
        ? QUICK_PLAY_OFFLINE.ffa
        : sizesFor(mode)[0];
/** Races: how many racers in all (1 = a time trial: just you and your best's ghost). */
const RACE_SIZES = [1, 2, 4, 8];
/** The Arena's default player count in practice (you + 3 bots: duels rotate). */
const ARENA_DEFAULT_SIZE = 4;

/** Modes whose setup step also picks the kit (Boomerang or CS): the Arena and Elimination. */
export const hasKitChoice = (mode: PracticeMode): boolean =>
  mode === 'arena' || mode === 'elim' || mode === 'freeroam';
/** Free roam: no opponents (no team size, no bot difficulty), dummies on / off instead. */
export const isFreeRoam = (mode: PracticeMode): boolean => mode === 'freeroam';

/** Arena / Elimination kits: the Boomerang kit or the CS kit (AK + Deagle). */
export type ArenaKit = 'lethal' | 'cs';
export const ARENA_KITS: Choice<ArenaKit>[] = [
  { id: 'lethal', name: 'Boomerang', desc: 'Boomerang, Laser and Gravity Grenade.', icon: 'arena' },
  { id: 'cs', name: 'CS kit', desc: 'AK + Deagle, slower movement (70 %).', icon: 'cs' },
];

// ---------------------------------------------------------------- maps

/** What a mode needs from a map. */
export const mapNeed = (mode: PracticeMode): 'tower' | 'bomb' | 'none' =>
  mode === 'match' ? 'tower' : mode === 'bomb' || mode === 'cs' ? 'bomb' : 'none';

const supports = (def: LevelDef, need: 'tower' | 'bomb' | 'none'): boolean =>
  need === 'tower'
    ? def.towers.length > 0
    : need === 'bomb'
      ? (def.bombSites?.length ?? 0) > 0
      : true;

/**
 * Maps a mode can be played on: competitive maps that have what the mode needs (Towers or bomb
 * sites). Free fight is always the Training Bay; the Arena plays on the Arena maps.
 */
export const mapsForMode = (
  mode: PracticeMode,
  maps: readonly MapInfo[] = MAPS,
  defOf: (id: string) => LevelDef = mapDef,
): MapInfo[] => {
  if (mode === 'deathmatch') return maps.filter((m) => m.id === 'training-bay');
  if (mode === 'arena') return maps.filter(isArenaMap);
  if (mode === 'race') return maps.filter(isRaceMap);
  if (isBrawlPractice(mode)) return brawlMaps(maps);
  // free roam: any map at all (race tracks without dummies)
  if (mode === 'freeroam') return [...maps];
  const comp = maps.filter((m) => m.competitive && !isArenaMap(m));
  const ok = comp.filter((m) => supports(defOf(m.id), mapNeed(mode)));
  return ok.length ? ok : comp;
};

/** Race maps in two groups: the race tracks and the surf maps (MapInfo.surf). */
export const raceMapGroups = (
  maps: readonly MapInfo[] = MAPS,
): { best: MapInfo[]; other: MapInfo[] } => ({
  best: maps.filter((m) => isRaceMap(m) && !m.surf),
  other: maps.filter((m) => isRaceMap(m) && !!m.surf),
});

/** One-line map descriptions for the map cards (a new map without one shows its features). */
export const MAP_BLURBS: Record<string, string> = {
  'split-deck': 'Warship deck on three levels. Two bomb sites, sides swap at half time.',
  kestrel: 'Mirror-symmetric ship: three lanes with their own gravity.',
  'orbital-ring':
    'Station around a reactor core: ring + basement ring, zip-rails, launch pads, rift portals.',
  'canyon-relay':
    'Desert mesas at sunset over a deadly gorge: launch pads, rock bridges, slot canyons.',
  'sakura-hold':
    'Small blossom castle for 1v1–3v3: slow moat, a keep to climb, paper walls the Boomerang flies through.',
  'training-bay': 'Compact combat bay for quick fights.',
  'proving-grounds': 'The movement test ship: zero-G bay, wall corridor, flip room.',
  arena: 'Sealed duel pits: crates in the middle, upper ground along the sides.',
  'race-sunspire':
    'Sky temple at sunrise (medium): hop chains round the walls, first surf ramps, a window jump.',
  'race-neon':
    'Neon city fragments at night (hard): steep surf flicks, pillar weaves, a jetpack gap, speed gates.',
  'race-ember':
    'Basalt islands at dusk (very hard): small pads, the steepest ramps, two jetpack gaps on one fuel cell.',
  'surf-aurora': 'Surf, beginner: five stages of long forgiving ramps under an aurora sky.',
  'surf-cinder': 'Surf, hard: seven stages — royal spin, window, wall surf, pillars, needles.',
};

/** Short feature tags of a map from its layout (Towers, bomb sites, sky duel). */
export const mapTags = (def: LevelDef): string[] => {
  const tags: string[] = [];
  if (def.towers.length) tags.push('Towers');
  if (def.bombSites?.length) tags.push(`Bomb sites ${def.bombSites.map((b) => b.name).join('/')}`);
  if (def.portals?.length) tags.push('Portals');
  if (def.launchPads?.length) tags.push('Launch pads');
  if (def.skyArena) tags.push('Sky duel');
  if (def.race) tags.push(`${def.race.checkpoints.length} checkpoints`);
  return tags;
};

// ---------------------------------------------------------------- steps

/** The step after `step` (or the last one). */
export const stepAfter = <S>(steps: readonly S[], step: S): S =>
  steps[Math.min(steps.length - 1, steps.indexOf(step) + 1)];

/** The step before `step`, or null on the first step (back leaves the wizard). */
export const stepBefore = <S>(steps: readonly S[], step: S): S | null => {
  const i = steps.indexOf(step);
  return i > 0 ? steps[i - 1] : null;
};

// ---------------------------------------------------------------- practice wizard

export type PracticeStep = 'mode' | 'map' | 'setup';

export interface PracticeState {
  step: PracticeStep;
  mode: PracticeMode;
  map: string;
  size: number;
  skill: BotSkillName;
  /** Arena: which kit */
  kit?: ArenaKit;
  /** free roam: target dummies on the map (default on) */
  dummies?: boolean;
}

export const PRACTICE_STEP_LABELS: Record<PracticeStep, string> = {
  mode: 'Mode',
  map: 'Map',
  setup: 'Teams & bots',
};

export const initialPractice = (): PracticeState => ({
  step: 'mode',
  mode: 'match',
  map: DEFAULT_MATCH_MAP(),
  size: 1,
  skill: DEFAULT_BOT_SKILL,
});

/**
 * A mode's steps. Free fight (always the Training Bay) skips the map step, and so does the
 * Arena while it has a single map; match modes always show their maps.
 */
export const practiceSteps = (
  mode: PracticeMode,
  maps: readonly MapInfo[] = MAPS,
  defOf: (id: string) => LevelDef = mapDef,
): PracticeStep[] => {
  const n = mapsForMode(mode, maps, defOf).length;
  return mode === 'deathmatch' || n === 0 || (mode === 'arena' && n === 1)
    ? ['mode', 'setup']
    : ['mode', 'map', 'setup'];
};

/** Pick a mode: keeps the map/size if the mode allows them, else the first valid one. */
export const pickPracticeMode = (
  s: PracticeState,
  mode: PracticeMode,
  maps: readonly MapInfo[] = MAPS,
  defOf: (id: string) => LevelDef = mapDef,
): PracticeState => {
  const valid = mapsForMode(mode, maps, defOf);
  const sizes = sizesFor(mode);
  return {
    ...s,
    mode,
    map: valid.some((m) => m.id === s.map) ? s.map : (valid[0]?.id ?? s.map),
    size: sizes.includes(s.size) ? s.size : defaultSize(mode),
    step: stepAfter(practiceSteps(mode, maps, defOf), 'mode'),
  };
};

export const pickPracticeMap = (s: PracticeState, map: string): PracticeState => ({
  ...s,
  map,
  step: 'setup',
});

/** One step back, or null when back should leave the practice menu. */
export const practiceBack = (
  s: PracticeState,
  maps: readonly MapInfo[] = MAPS,
  defOf: (id: string) => LevelDef = mapDef,
): PracticeState | null => {
  const prev = stepBefore(practiceSteps(s.mode, maps, defOf), s.step);
  return prev ? { ...s, step: prev } : null;
};

/** The map a practice game will actually load (free fight is always the Training Bay). */
export const practiceMapId = (s: PracticeState): string =>
  s.mode === 'deathmatch' ? 'training-bay' : s.map;

// ---------------------------------------------------------------- online room wizard

export type RoomObjective =
  | 'tower'
  | 'bomb'
  | 'elim'
  | 'cs'
  | 'elim-cs'
  | 'brawl'
  | 'brawl-ffa'
  | 'arena'
  | 'arena-cs'
  | 'race';

/** An Arena 1v1 room (Boomerang or CS kit). */
export const isArenaObjective = (o: RoomObjective): boolean => o === 'arena' || o === 'arena-cs';
/** A parkour race room (a race track, up to 8 racers, no weapons). */
export const isRaceObjective = (o: RoomObjective): boolean => o === 'race';
/** Elimination (Boomerang kit, or 'elim-cs' with the CS kit). */
export const isElimObjective = (o: RoomObjective): boolean => o === 'elim' || o === 'elim-cs';
/** A Brawl room: team deathmatch ('brawl') or free-for-all ('brawl-ffa'), maps rotate. */
export const isBrawlObjective = (o: RoomObjective): o is BrawlMode =>
  o === 'brawl' || o === 'brawl-ffa';
export type RoomSize = '1v1' | '2v2' | '3v3' | '5v5';
export type RoomStep = 'objective' | 'map' | 'room';

export const ROOM_STEPS: RoomStep[] = ['objective', 'map', 'room'];
export const ROOM_STEP_LABELS: Record<RoomStep, string> = {
  objective: 'Objective',
  map: 'Map',
  room: 'Room',
};

export const ROOM_OBJECTIVES: Choice<RoomObjective>[] = [
  {
    id: 'tower',
    name: 'Tower',
    desc: 'Carry the Controller into the enemy Tower.',
    icon: 'tower',
  },
  { id: 'bomb', name: 'Bomb', desc: 'Plant at site A or B, or defuse.', icon: 'bomb' },
  { id: 'elim', name: 'Elimination', desc: 'Last team standing wins the round.', icon: 'elim' },
  { id: 'cs', name: 'CS mode', desc: 'AK + Deagle with bomb rules, slower movement.', icon: 'cs' },
  {
    id: 'elim-cs',
    name: 'Elimination CS',
    desc: 'Last team standing wins the round. AK + Deagle.',
    icon: 'cs',
  },
  {
    id: 'brawl',
    name: 'Brawl TDM',
    desc: 'Team deathmatch, instant respawns, first team to 50 kills. Maps rotate.',
    icon: 'team',
  },
  {
    id: 'brawl-ffa',
    name: 'Brawl FFA',
    desc: 'Everyone for themselves, instant respawns, first to 20 kills.',
    icon: 'freefight',
  },
  ...(ARENA_ENABLED
    ? ([
        {
          id: 'arena',
          name: 'Arena 1v1',
          desc: 'Rotating 1v1 duels in pits, Boomerang kit.',
          icon: 'arena',
        },
        {
          id: 'arena-cs',
          name: 'Arena 1v1 CS',
          desc: 'Rotating 1v1 duels, AK + Deagle.',
          icon: 'cs',
        },
      ] as Choice<RoomObjective>[])
    : []),
  {
    id: 'race',
    name: 'Race',
    desc: 'Parkour race on a race track, up to 8 racers. No weapons.',
    icon: 'race',
  },
];

/** Race rooms: the size cards pick how many racers there are in all (bots fill up to it). */
export const RACE_ROOM_SIZES: Record<RoomSize, { players: number; label: string; desc: string }> = {
  '1v1': { players: 2, label: '2 racers', desc: 'You and one friend.' },
  '2v2': { players: 4, label: '4 racers', desc: 'A small race.' },
  '3v3': { players: 6, label: '6 racers', desc: 'A busy start line.' },
  '5v5': { players: 8, label: '8 racers', desc: 'A full grid.' },
};

/** Arena rooms: the size cards pick how many players there are in all (bots fill up to it). */
export const ARENA_ROOM_SIZES: Record<RoomSize, { players: number; label: string; desc: string }> =
  {
    '1v1': { players: 2, label: '2 players', desc: 'Just you and one friend.' },
    '2v2': { players: 4, label: '4 players', desc: 'Duels rotate between four.' },
    '3v3': { players: 6, label: '6 players', desc: 'Three pits at once.' },
    '5v5': { players: 8, label: '8 players', desc: 'A full arena: four pits at once.' },
  };

/** Brawl FFA rooms: the size cards pick how many players there are in all. */
export const BRAWL_FFA_ROOM_SIZES: Record<
  RoomSize,
  { players: number; label: string; desc: string }
> = {
  '1v1': { players: 4, label: '4 players', desc: 'A small free-for-all.' },
  '2v2': { players: 6, label: '6 players', desc: 'Six fighters, every one for themselves.' },
  '3v3': { players: 8, label: '8 players', desc: 'A busy free-for-all.' },
  '5v5': { players: 10, label: '10 players', desc: 'A full brawl.' },
};

export const ROOM_SIZES: RoomSize[] = ['1v1', '2v2', '3v3', '5v5'];
const ROOM_PLAYERS: Record<RoomSize, number> = { '1v1': 2, '2v2': 4, '3v3': 6, '5v5': 10 };

export interface RoomState {
  step: RoomStep;
  objective: RoomObjective;
  map: string;
  size: RoomSize;
  bots: boolean;
  skill: BotSkillName;
}

export const initialRoom = (): RoomState => ({
  step: 'objective',
  objective: 'tower',
  map: DEFAULT_MATCH_MAP(),
  size: '1v1',
  bots: false,
  skill: DEFAULT_BOT_SKILL,
});

const objectiveMode = (o: RoomObjective): PracticeMode =>
  isBrawlObjective(o)
    ? o
    : o === 'tower'
      ? 'match'
      : isArenaObjective(o)
        ? 'arena'
        : isRaceObjective(o)
          ? 'race'
          : isElimObjective(o)
            ? 'elim'
            : (o as PracticeMode);

/**
 * Maps for an online room: the ones made for the objective first, then every other map (rooms
 * may use any map; those have no Towers / bomb sites for it). Arena maps and race tracks are
 * left out (races only offer race tracks).
 */
export const roomMaps = (
  o: RoomObjective,
  maps: readonly MapInfo[] = MAPS,
  defOf: (id: string) => LevelDef = mapDef,
): { best: MapInfo[]; other: MapInfo[] } => {
  const best = mapsForMode(objectiveMode(o), maps, defOf);
  // (races: the race tracks first, then the surf maps)
  if (isRaceObjective(o)) return raceMapGroups(maps);
  // (the Arena only plays on its own maps, Brawl on its rotation)
  if (isArenaObjective(o) || isBrawlObjective(o)) return { best, other: [] };
  return {
    best,
    other: maps.filter((m) => !best.includes(m) && !isArenaMap(m) && !isRaceMap(m)),
  };
};

export const pickRoomObjective = (
  s: RoomState,
  objective: RoomObjective,
  maps: readonly MapInfo[] = MAPS,
  defOf: (id: string) => LevelDef = mapDef,
): RoomState => {
  const { best } = roomMaps(objective, maps, defOf);
  // keep a hand-picked map only if it suits the new objective
  const map = best.some((m) => m.id === s.map) ? s.map : (best[0]?.id ?? s.map);
  return { ...s, objective, map, step: 'map' };
};

export const pickRoomMap = (s: RoomState, map: string): RoomState => ({ ...s, map, step: 'room' });

export const roomBack = (s: RoomState): RoomState | null => {
  const prev = stepBefore(ROOM_STEPS, s.step);
  return prev ? { ...s, step: prev } : null;
};

/** The arguments for NetCore.createRoom from the wizard's choices. */
export const roomCreateArgs = (
  s: RoomState,
): {
  mode: RoomSize | 'arena' | 'race' | BrawlMode;
  map: string;
  bots: number;
  skill: BotSkillName;
  objective: MatchObjective;
  loadout: 'lethal' | 'cs';
} =>
  isBrawlObjective(s.objective)
    ? {
        mode: s.objective,
        map: s.map,
        bots: s.bots
          ? (s.objective === 'brawl-ffa'
              ? BRAWL_FFA_ROOM_SIZES[s.size].players
              : ROOM_PLAYERS[s.size]) - 1
          : 0,
        skill: s.skill,
        objective: 'tower',
        loadout: 'lethal',
      }
    : isRaceObjective(s.objective)
      ? {
          mode: 'race',
          map: s.map,
          bots: s.bots ? RACE_ROOM_SIZES[s.size].players - 1 : 0,
          skill: s.skill,
          objective: 'tower',
          loadout: 'lethal',
        }
      : isArenaObjective(s.objective)
        ? {
            mode: 'arena',
            map: s.map,
            bots: s.bots ? ARENA_ROOM_SIZES[s.size].players - 1 : 0,
            skill: s.skill,
            objective: 'tower',
            loadout: s.objective === 'arena-cs' ? 'cs' : 'lethal',
          }
        : {
            mode: s.size,
            map: s.map,
            bots: s.bots ? ROOM_PLAYERS[s.size] - 1 : 0,
            skill: s.skill,
            objective:
              s.objective === 'tower' ? 'tower' : isElimObjective(s.objective) ? 'elim' : 'bomb',
            loadout: s.objective === 'cs' || s.objective === 'elim-cs' ? 'cs' : 'lethal',
          };

// ---------------------------------------------------------------- one-click Play

/** Offline quick play (no server): Brawl vs bots, TDM players per team / FFA players in all. */
export const QUICK_PLAY_OFFLINE = { tdm: 4, ffa: 8 } as const;

/** The room mode the title screen's Play button asks the server for. */
export const quickPlayMode = (setting: 'tdm' | 'ffa'): BrawlMode =>
  setting === 'ffa' ? 'brawl-ffa' : 'brawl';

/** A first-time player's nickname (no forms before the first match): "Pilot" + 4 digits. */
export const defaultNickname = (rand: () => number = Math.random): string =>
  `Pilot${1000 + Math.floor(rand() * 9000)}`;

// ---------------------------------------------------------------- ranked

// Ranked = four ladders (shared rating/ladders.ts): Premier, Premier CS, Duels and Race. One
// card per ladder, with a tick box per queue (multi-search). A new ladder needs its entry in
// RANKED_CARD_INFO (TypeScript insists).

export interface RankedCardDef {
  ladder: LadderId;
  name: string;
  desc: string;
  icon: IconName;
  /** one button per queue of the ladder */
  queues: { id: RankedQueueId; label: string }[];
}

const RANKED_CARD_INFO: Record<
  LadderId,
  { desc: string; icon: IconName; labels: Partial<Record<RankedQueueId, string>> }
> = {
  premier: {
    desc: 'Bomb · Boomerang kit · map veto · 3v3, 4v4 or 5v5 by how many search. The main rank.',
    icon: 'bomb',
    labels: { premier: 'Premier' },
  },
  'premier-cs': {
    desc: 'CS kit (AK + Deagle) · vote Bomb or Elimination, then the map veto · 3v3 to 5v5.',
    icon: 'cs',
    labels: { 'premier-cs': 'Premier CS' },
  },
  duels: {
    desc: '1v1 and 2v2 on Tower rules · one rating for both.',
    icon: 'ranked',
    labels: { 'duels-1v1': '1v1', 'duels-2v2': '2v2' },
  },
  race: {
    desc: 'Parkour race · 2–8 racers on a random track · no weapons.',
    icon: 'race',
    labels: { race: 'Race' },
  },
};

export const rankedCards = (): RankedCardDef[] =>
  LADDER_IDS.map((id) => ({
    ladder: id,
    name: LADDERS[id].name,
    desc: RANKED_CARD_INFO[id].desc,
    icon: RANKED_CARD_INFO[id].icon,
    queues: LADDERS[id].queues.map((q) => ({ id: q, label: RANKED_CARD_INFO[id].labels[q] ?? q })),
  }));

/** The name of a ranked queue for status lines ("Premier", "Duels 2v2"). */
export const rankedQueueName = (id: string): string => {
  for (const c of rankedCards()) {
    const q = c.queues.find((x) => x.id === id);
    if (q) return c.queues.length > 1 ? `${c.name} ${q.label}` : c.name;
  }
  return id;
};

/** "2h 13m", "13m 05s", "3d 4h": time until something opens / ends. */
export const countdown = (sec: number): string => {
  const s = Math.max(0, Math.ceil(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
};

/** A ladder standing as the server sends it in the profile (server services/ranked.ts). */
export interface LadderStandingView {
  rating: number | null;
  placed: boolean;
  placement: { done: number; need: number; unit: 'wins' | 'games' | 'races' };
  rank: { label: string; color: string; top?: boolean } | null;
}

/** The rank line under a ladder: "1240 · Planet" or "Placement 2/5 wins". */
export const standingText = (st: LadderStandingView | undefined): string => {
  if (!st) return 'Placement 0/5';
  if (st.rating === null)
    return `Placement ${st.placement.done}/${st.placement.need} ${st.placement.unit}`;
  return `${st.rating}${st.rank ? ` · ${st.rank.label}` : ''}`;
};
