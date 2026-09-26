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
  type BotSkillName,
  type LevelDef,
  type MapInfo,
} from '@space-yz/shared';
import type { IconName } from './icons';

/**
 * Arena 1v1 (shared rules/arena.ts, its map in MAPS with `arena: true`; the client entry points
 * are in game/arena-entry.ts). While false, no Arena cards are shown anywhere.
 */
export const ARENA_ENABLED = true;
/** The ranked queue id of Arena 1v1 (the server's mode name), used when ARENA_ENABLED. */
export const ARENA_RANKED_MODE = 'arena';

/** Arena maps are only for the Arena (never offered for other modes). */
const isArenaMap = (m: MapInfo): boolean => !!m.arena;

// ---------------------------------------------------------------- modes

export type PracticeMode = 'match' | 'bomb' | 'cs' | 'deathmatch' | 'arena';

export interface Choice<T extends string> {
  id: T;
  name: string;
  desc: string;
  icon: IconName;
}

const PRACTICE_MODES: Choice<PracticeMode>[] = [
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
    id: 'cs',
    name: 'CS mode',
    desc: 'AK + Deagle with bomb rules. Half-speed movement, stop to shoot straight.',
    icon: 'cs',
  },
  {
    id: 'deathmatch',
    name: 'Free fight',
    desc: 'Respawning brawl in the Training Bay. No rounds, just fight.',
    icon: 'freefight',
  },
  {
    id: 'arena',
    name: 'Arena 1v1',
    desc: 'Rotating 1v1 duels, each in its own pit. Most duel wins in 8 minutes takes it.',
    icon: 'arena',
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
  mode === 'arena' ? [2, 4, 6, 8] : [1, 2, 3, 5];
/** The Arena's default player count in practice (you + 3 bots: duels rotate). */
const ARENA_DEFAULT_SIZE = 4;

/** Arena kits: the Boomerang kit or the CS kit (AK + Deagle). */
export type ArenaKit = 'lethal' | 'cs';
export const ARENA_KITS: Choice<ArenaKit>[] = [
  { id: 'lethal', name: 'Boomerang', desc: 'Boomerang, Laser and Gravity Grenade.', icon: 'arena' },
  { id: 'cs', name: 'CS kit', desc: 'AK + Deagle, half-speed movement.', icon: 'cs' },
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
  const comp = maps.filter((m) => m.competitive && !isArenaMap(m));
  const ok = comp.filter((m) => supports(defOf(m.id), mapNeed(mode)));
  return ok.length ? ok : comp;
};

/** One-line map descriptions for the map cards (a new map without one shows its features). */
export const MAP_BLURBS: Record<string, string> = {
  'split-deck': 'Warship deck on three levels. Two bomb sites, sides swap at half time.',
  kestrel: 'Mirror-symmetric ship: three lanes with their own gravity.',
  'orbital-ring':
    'Station around a reactor core: ring + basement ring, zip-rails, launch pads, rift portals.',
  'training-bay': 'Compact combat bay for quick fights.',
  'proving-grounds': 'The movement test ship: zero-G bay, wall corridor, flip room.',
  arena: 'Sealed duel pits: crates in the middle, upper ground along the sides.',
};

/** Short feature tags of a map from its layout (Towers, bomb sites, sky duel). */
export const mapTags = (def: LevelDef): string[] => {
  const tags: string[] = [];
  if (def.towers.length) tags.push('Towers');
  if (def.bombSites?.length) tags.push(`Bomb sites ${def.bombSites.map((b) => b.name).join('/')}`);
  if (def.portals?.length) tags.push('Portals');
  if (def.launchPads?.length) tags.push('Launch pads');
  if (def.skyArena) tags.push('Sky duel');
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
    size: sizes.includes(s.size) ? s.size : mode === 'arena' ? ARENA_DEFAULT_SIZE : sizes[0],
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

export type RoomObjective = 'tower' | 'bomb' | 'cs' | 'arena' | 'arena-cs';

/** An Arena 1v1 room (Boomerang or CS kit). */
export const isArenaObjective = (o: RoomObjective): boolean => o === 'arena' || o === 'arena-cs';
export type RoomSize = '1v1' | '2v2' | '5v5';
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
  { id: 'cs', name: 'CS mode', desc: 'AK + Deagle with bomb rules, half-speed.', icon: 'cs' },
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
];

/** Arena rooms: the size cards pick how many players there are in all (bots fill up to it). */
export const ARENA_ROOM_SIZES: Record<RoomSize, { players: number; label: string; desc: string }> =
  {
    '1v1': { players: 2, label: '2 players', desc: 'Just you and one friend.' },
    '2v2': { players: 4, label: '4 players', desc: 'Duels rotate between four.' },
    '5v5': { players: 8, label: '8 players', desc: 'A full arena: four pits at once.' },
  };

export const ROOM_SIZES: RoomSize[] = ['1v1', '2v2', '5v5'];
const ROOM_PLAYERS: Record<RoomSize, number> = { '1v1': 2, '2v2': 4, '5v5': 10 };

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
  o === 'tower' ? 'match' : isArenaObjective(o) ? 'arena' : (o as PracticeMode);

/**
 * Maps for an online room: the ones made for the objective first, then every other map (rooms
 * may use any map; those have no Towers / bomb sites for it). Arena maps are left out.
 */
export const roomMaps = (
  o: RoomObjective,
  maps: readonly MapInfo[] = MAPS,
  defOf: (id: string) => LevelDef = mapDef,
): { best: MapInfo[]; other: MapInfo[] } => {
  const best = mapsForMode(objectiveMode(o), maps, defOf);
  // (the Arena only plays on its own maps)
  if (isArenaObjective(o)) return { best, other: [] };
  return { best, other: maps.filter((m) => !best.includes(m) && !isArenaMap(m)) };
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
  mode: RoomSize | 'arena';
  map: string;
  bots: number;
  skill: BotSkillName;
  objective: 'tower' | 'bomb';
  loadout: 'lethal' | 'cs';
} =>
  isArenaObjective(s.objective)
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
        objective: s.objective === 'tower' ? 'tower' : 'bomb',
        loadout: s.objective === 'cs' ? 'cs' : 'lethal',
      };

// ---------------------------------------------------------------- ranked

export interface RankedQueue {
  /** the server's queue id */
  mode: string;
  /** Arena: the kit this queue plays with (players only meet the same kit) */
  loadout?: 'lethal' | 'cs';
  name: string;
  desc: string;
  icon: IconName;
}

export const rankedQueues = (arena = ARENA_ENABLED): RankedQueue[] => [
  { mode: '1v1', name: 'Ranked 1v1', desc: 'Duel on a Tower map. Pure skill.', icon: 'ranked' },
  { mode: '2v2', name: 'Ranked 2v2', desc: 'Two-player teams, Tower rules.', icon: 'team' },
  { mode: '5v5', name: 'Ranked 5v5', desc: 'Full teams, Tower rules.', icon: 'team' },
  ...(arena
    ? [
        {
          mode: ARENA_RANKED_MODE,
          loadout: 'lethal' as const,
          name: 'Arena 1v1',
          desc: 'Rotating 1v1 duels, Boomerang kit. Its own ladder.',
          icon: 'arena' as const,
        },
        {
          mode: ARENA_RANKED_MODE,
          loadout: 'cs' as const,
          name: 'Arena 1v1 CS',
          desc: 'Rotating 1v1 duels, AK + Deagle. Same arena ladder.',
          icon: 'cs' as const,
        },
      ]
    : []),
];
