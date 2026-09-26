// ARENA 1v1 — entry points for the menus (search term: arena).
//
// Arena 1v1: 2–8 players fight rotating 1v1 duels, each pair in its own sealed pit of the
// Arena map; after every round winners move up a pit and losers down, re-paired so you meet
// different opponents. A timed match (8 min): most duel wins takes the arena. Played with the
// Boomerang kit ('lethal') or the CS kit ('cs': AK + Deagle). Rules: shared/rules/arena.ts.
//
//   ARENA_AVAILABLE                          true: the arena can be played (offline + online)
//   startArenaPractice(app, { loadout, bots, skill })
//                                            offline arena vs `bots` bots (1–7) on this PC
//   queueArena(core, loadout)                ranked arena queue (core.queueRanked('arena', …));
//                                            core.queueRanked(null) leaves it. Needs 2+ players,
//                                            gathers up to 8 for ~15 s. Status: core.queue.
//   createArenaRoom(core, { loadout, bots, skill })
//                                            private arena room (bots fill it up to 1 + bots);
//                                            share core.code; the room starts by itself 10 s
//                                            after 2 players are in (host: startMatch sooner)
//   arenaOnlineFeatures(core, combat)        HUD features to add in App.startOnline when
//                                            core.mode === 'arena' (after the match feature)
//   ARENA_LADDER ('arena')                   the ranked ladder id: profile.modes.arena
//                                            ({ rating, tier, games, wins, … }) and
//                                            /api/leaderboard?mode=arena. Not part of the
//                                            global rank. Ranks: same tiers (Asteroid → Galaxy).
import type {
  ArenaState,
  BotMemory,
  BotSkillName,
  GameConfig,
  LoadoutName,
  NetCore,
  PlayerInput,
} from '@space-yz/shared';
import {
  ARENA_MAP_ID,
  BOT_SKILLS,
  addPlayer,
  applyArenaBotObjectives,
  arenaCanSee,
  arenaJoin,
  arenaView,
  botSkillName,
  botThink,
  configForLoadout,
  createArena,
  createBotMemory,
  createPlayer,
  loadoutName,
  mapDef,
  updateArena,
} from '@space-yz/shared';
import type { App } from '../app';
import type { ClientFeature } from './client';
import { CombatFeature } from './combat-feature';
import { LocalSession, type LocalSessionOptions } from './local-session';
import type { RenderPlayer } from './session';
import { ArenaFeature, arenaFromExtra } from './arena-feature';
import { BOT_NAMES } from './practice';
import { loadTuning } from '../ui/tuning';

export const ARENA_AVAILABLE = true;
/** The ranked ladder / queue id of Arena 1v1. */
export const ARENA_LADDER = 'arena';

export interface ArenaPracticeOptions {
  loadout: LoadoutName;
  /** bot opponents, 1–7 */
  bots: number;
  skill: BotSkillName;
  /** default: your saved tuning (Boomerang kit) */
  config?: GameConfig;
}

/**
 * The offline arena session: the local sim with the arena rules. Like the server, it only shows
 * you the players of the pit you're in or watching.
 */
export class ArenaLocalSession extends LocalSession {
  constructor(
    opts: LocalSessionOptions,
    readonly arena: ArenaState,
  ) {
    super(opts);
  }

  override others(): RenderPlayer[] {
    const w = this.world();
    return super.others().filter((p) => arenaCanSee(this.arena, w, this.localId, p.id));
  }

  // no teleports / respawn button in the arena
  override teleport(): void {}
  override respawn(): void {}
}

/** An offline arena session vs bots (no rendering): used by startArenaPractice and tests. */
export const createArenaPractice = (
  opts: ArenaPracticeOptions,
): { session: ArenaLocalSession; arena: ArenaState } => {
  const loadout = loadoutName(opts.loadout);
  const config = configForLoadout(opts.config ?? loadTuning(), loadout);
  const bots = Math.max(1, Math.min(7, Math.floor(opts.bots)));
  // offline: the first duels start a few seconds after you arrive
  const arena = createArena(loadout, { warmupSec: 3 });
  const mems: BotMemory[] = [];
  const names: Record<number, string> = {};
  const skill = BOT_SKILLS[botSkillName(opts.skill)];
  const session = new ArenaLocalSession(
    {
      levelDef: mapDef(ARENA_MAP_ID),
      config,
      seed: 1 + Math.floor(Math.random() * 1e6),
      names,
      setup: (world, ctx) => {
        for (let i = 0; i < bots; i++) {
          const id = i + 2;
          const s = ctx.level.def.spawns[i % ctx.level.def.spawns.length];
          addPlayer(world, createPlayer(id, 1, s.pos, s.yawDeg, ctx.config));
          mems.push(createBotMemory(id, skill, id * 13));
          names[id] = BOT_NAMES[i % BOT_NAMES.length];
        }
        // everyone into their warmup pit
        for (const p of world.players) arenaJoin(arena, world, ctx, p.id);
      },
      extraInputs: (world, ctx) => {
        const inputs: Record<number, PlayerInput> = {};
        for (const mem of mems) {
          const p = world.players.find((q) => q.id === mem.id);
          if (p) inputs[p.id] = botThink(world, ctx, p, mem);
        }
        return inputs;
      },
      afterStep: (world, ctx) => {
        updateArena(arena, world, ctx);
        applyArenaBotObjectives(arena, world, ctx, mems);
      },
    },
    arena,
  );
  return { session, arena };
};

/** Start an offline arena vs bots (call from a click: it locks the pointer). */
export const startArenaPractice = (app: App, opts: ArenaPracticeOptions): void => {
  const { session, arena } = createArenaPractice(opts);
  const combat = new CombatFeature();
  const hud = new ArenaFeature({ view: () => arenaView(arena), combat });
  const client = app.startGame(session, [combat, hud], { tuning: false });
  client.hud.setHint(
    arena.loadout === 'cs'
      ? 'Arena 1v1 · Tab standings · Esc menu · LMB fire · 1 AK · 2 Deagle · R reload · E knife'
      : 'Arena 1v1 · Tab standings · Esc menu · LMB throw · RMB wind-up · E slash · R recall · Q grenade',
  );
};

/** Join the ranked arena queue with a kit (players only meet the same kit). */
export const queueArena = (core: NetCore, loadout: LoadoutName = 'lethal'): void =>
  core.queueRanked('arena', loadout);

/** Create a private arena room ('bots' fill it up to 1 + bots players, max 8). */
export const createArenaRoom = (
  core: NetCore,
  opts: { loadout: LoadoutName; bots?: number; skill?: BotSkillName },
): void =>
  core.createRoom(
    'arena',
    ARENA_MAP_ID,
    Math.max(0, Math.min(7, opts.bots ?? 0)),
    opts.skill,
    'tower',
    opts.loadout,
  );

/** The arena HUD for an online arena room (add after the match feature). */
export const arenaOnlineFeatures = (core: NetCore, combat?: CombatFeature): ClientFeature[] => [
  new ArenaFeature({ view: () => arenaFromExtra(core.extra), combat }),
];
