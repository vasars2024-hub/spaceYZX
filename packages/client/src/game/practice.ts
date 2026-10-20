// Offline practice vs bots (Training Bay by default).
import type { LevelDef, PlayerInput, BotMemory, BotSkill, GameConfig } from '@space-yz/shared';
import {
  buildTrainingBay,
  createPlayer,
  addPlayer,
  botThink,
  createBotMemory,
  BOT_SKILLS,
  StatsTracker,
  createPractice,
  updatePractice,
  createMatch,
  startMatch,
  updateMatch,
  applyBotObjectives,
  csConfig,
  withRemoteMine,
  remoteMineMode,
  DEFAULT_MATCH_MAP,
  objectiveMapPool,
  playlistAdvance,
  playlistMatchEnded,
  playlistSkip,
  playlistView,
  playlistVote,
  voteSeed,
  type MatchState,
  type PlaylistState,
} from '@space-yz/shared';
import { LocalSession } from './local-session';
import { officialMapDef } from '../net/official-maps';

export const BOT_NAMES = [
  'Nova',
  'Vega',
  'Orion',
  'Lyra',
  'Rigel',
  'Deneb',
  'Altair',
  'Sirius',
  'Mira',
];

export interface PracticeOptions {
  size: number; // players per team (you + size-1 teammates)
  skill: BotSkill['name'];
  levelDef?: LevelDef;
  config: GameConfig;
  /**
   * 'match': rounds + Controller & Tower; 'bomb': rounds + plant/defuse; 'elim': rounds, last
   * team standing (Boomerang kit; 'elim-cs' with the CS kit); 'cs': CS mode (bomb rules with
   * AK + Deagle, 70 % movement speed); 'deathmatch': respawning.
   */
  kind?: PracticeKind;
  /** map of a 'match' (default: the default match map, Split Deck) */
  mapId?: string;
  /**
   * matches: a map playlist (rules/playlist.ts; the same state goes from map to map). After a
   * match the results card shows the next map (or a vote: you pick it) and `onNextMap` is
   * called: the caller starts the next practice game on that map.
   */
  playlist?: PlaylistState;
  onNextMap?: (map: string) => void;
}

export type PracticeKind = 'match' | 'bomb' | 'elim' | 'elim-cs' | 'cs' | 'deathmatch';

/** Practice kinds played with the CS kit (AK + Deagle, CS config). */
export const isCsKind = (kind: PracticeKind | undefined): boolean =>
  kind === 'cs' || kind === 'elim-cs';

export const createPracticeSession = (
  opts: PracticeOptions,
): { session: LocalSession; stats: StatsTracker } => {
  const isMatch = opts.kind !== undefined && opts.kind !== 'deathmatch';
  const cs = isCsKind(opts.kind);
  // CS mode runs the sim with its own config (guns, 70 % movement speed)
  // (and the remote mine on / off for this mode: config/mine.ts)
  const config = withRemoteMine(
    cs ? csConfig(opts.config) : opts.config,
    remoteMineMode(
      isMatch ? 'match' : 'practice',
      opts.kind === 'elim' || opts.kind === 'elim-cs'
        ? 'elim'
        : opts.kind === 'bomb' || cs
          ? 'bomb'
          : 'tower',
      cs,
    ),
  );
  // (matches: smaller teams play a smaller map, like online — level/size-walls.ts)
  const levelDef =
    opts.levelDef ??
    (isMatch
      ? officialMapDef(opts.mapId ?? DEFAULT_MATCH_MAP(), Math.min(5, Math.max(1, opts.size)))
      : buildTrainingBay());
  const mems: BotMemory[] = [];
  const match: MatchState | undefined = isMatch
    ? createMatch(
        opts.size <= 1 ? '1v1' : opts.size === 2 ? '2v2' : opts.size === 3 ? '3v3' : '5v5',
        opts.kind === 'elim' || opts.kind === 'elim-cs'
          ? 'elim'
          : opts.kind === 'bomb' || cs
            ? 'bomb'
            : 'tower',
        cs ? 'cs' : 'lethal',
      )
    : undefined;
  let restartAt = 0;
  const pl = match ? (opts.playlist ?? null) : null;
  const mapId = opts.mapId ?? DEFAULT_MATCH_MAP();
  /** the next map is chosen: this game only waits to be replaced */
  let moving = false;
  let matchNo = 0;
  let endSeen = false;
  let tickNow = 0;
  const stats = new StatsTracker();
  const seed = 1 + Math.floor(Math.random() * 1e6);
  const practice = createPractice(2.5);
  const names: Record<number, string> = {};
  const session = new LocalSession({
    levelDef,
    config,
    seed,
    names,
    match,
    ...(pl
      ? {
          playlist: {
            view: () => playlistView(pl),
            vote: (map: string) => {
              if (match?.phase === 'matchEnd' && playlistVote(pl, 1, map, [1], tickNow))
                match.phaseEnds = pl.endsAt;
            },
            skip: () => {
              if (match?.phase === 'matchEnd') playlistSkip(pl, tickNow);
            },
          },
        }
      : {}),
    setup: (world, ctx) => {
      let id = 2;
      let n = 0;
      for (const team of [0, 1] as const) {
        const count = team === 0 ? opts.size - 1 : opts.size;
        const spawns = levelDef.spawns.filter((s) => s.team === team);
        for (let i = 0; i < count; i++) {
          const s = spawns[(i + (team === 0 ? 1 : 0)) % spawns.length];
          addPlayer(world, createPlayer(id, team, s.pos, s.yawDeg, ctx.config));
          mems.push(createBotMemory(id, BOT_SKILLS[opts.skill], id * 13));
          names[id] = `${BOT_NAMES[n++ % BOT_NAMES.length]}${team === 0 ? ' (ally)' : ''}`;
          id++;
        }
      }
      // put the local player on a team-0 spawn
      const me = world.players.find((p) => p.id === 1)!;
      const s0 = levelDef.spawns.find((s) => s.team === 0) ?? levelDef.spawns[0];
      Object.assign(me, createPlayer(1, 0, s0.pos, s0.yawDeg, ctx.config));
      if (match) startMatch(match, world, ctx);
    },
    extraInputs: (world, ctx) => {
      const inputs: Record<number, PlayerInput> = {};
      for (const mem of mems) {
        const p = world.players.find((pp) => pp.id === mem.id);
        if (p) inputs[p.id] = botThink(world, ctx, p, mem);
      }
      return inputs;
    },
    afterStep: (world, ctx) => {
      stats.observe(world);
      if (match) {
        tickNow = world.tick;
        if (moving) return;
        // a playlist's next map: when the results card / vote is over, the next game starts
        if (pl && match.phase === 'matchEnd' && pl.endsAt) {
          match.phaseEnds = pl.endsAt;
          const next = playlistAdvance(pl, world.tick);
          if (next !== null) {
            moving = true;
            opts.onNextMap?.(next);
            return;
          }
        }
        updateMatch(match, world, ctx);
        // (a match end seen once, also one that happened outside this step)
        if (match.phase !== 'matchEnd') endSeen = false;
        else if (pl && !endSeen) {
          endSeen = true;
          const pool = [...new Set([...objectiveMapPool(match.objective), ...pl.maps])];
          if (
            playlistMatchEnded(pl, mapId, pool, world.tick, voteSeed(`${mapId}`, seed + ++matchNo))
          )
            match.phaseEnds = pl.endsAt;
        }
        applyBotObjectives(match, world, ctx, mems);
        // offline: the next match starts a few seconds after the results
        if (match.phase === 'warmup') {
          if (!restartAt) restartAt = world.tick + 180;
          else if (world.tick >= restartAt) {
            restartAt = 0;
            startMatch(match, world, ctx);
          }
        }
        return;
      }
      for (const id of updatePractice(practice, world, ctx)) stats.onRespawn(id);
    },
  });
  return { session, stats };
};
