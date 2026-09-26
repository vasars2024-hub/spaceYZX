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
  mapDef,
  csConfig,
  DEFAULT_MATCH_MAP,
  type MatchState,
} from '@space-yz/shared';
import { LocalSession } from './local-session';

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
   * AK + Deagle, half-speed movement); 'deathmatch': respawning.
   */
  kind?: PracticeKind;
  /** map of a 'match' (default: the default match map, Split Deck) */
  mapId?: string;
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
  // CS mode runs the sim with its own config (guns, half-speed movement)
  const config = cs ? csConfig(opts.config) : opts.config;
  const levelDef =
    opts.levelDef ?? (isMatch ? mapDef(opts.mapId ?? DEFAULT_MATCH_MAP()) : buildTrainingBay());
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
  const stats = new StatsTracker();
  const practice = createPractice(2.5);
  const names: Record<number, string> = {};
  const session = new LocalSession({
    levelDef,
    config,
    seed: 1 + Math.floor(Math.random() * 1e6),
    names,
    match,
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
        updateMatch(match, world, ctx);
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
