// BRAWL — entry points for the menus (search term: brawl).
//
// Brawl: the quick drop-in mode behind the title screen's one-click Play. Team deathmatch
// ('tdm', first team to 50 kills) or free-for-all ('ffa', first to 20), instant respawns at a
// safe spawn with a short spawn protection, a 5-minute timer, then the results and the next
// Brawl on the next map of the rotation. Rules: shared/rules/brawl.ts; HUD: brawl-feature.ts.
//
//   createBrawlPractice(opts)          an offline Brawl vs bots (no rendering; tests use it)
//   startBrawlPractice(app, opts)      offline Brawl vs bots on this PC (the next map loads
//                                      by itself after the results)
//   brawlOnlineFeatures(core, ...)     HUD features for App.startOnline in 'brawl' /
//                                      'brawl-ffa' rooms (public quick play or private rooms)
import type {
  BotMemory,
  BotSkillName,
  BrawlState,
  BrawlVariant,
  GameConfig,
  NetCore,
  PlayerInput,
} from '@space-yz/shared';
import {
  BOT_SKILLS,
  DEFAULT_MATCH_MAP,
  addPlayer,
  applyBrawlBotObjectives,
  botSkillName,
  botThink,
  brawlMaps,
  brawlView,
  createBotMemory,
  createBrawl,
  createPlayer,
  mapDef,
  nextBrawlMap,
  startBrawl,
  updateBrawl,
} from '@space-yz/shared';
import type { App } from '../app';
import type { ClientFeature } from './client';
import { CombatFeature } from './combat-feature';
import { LocalSession, type LocalSessionOptions } from './local-session';
import { BrawlFeature, brawlFromExtra } from './brawl-feature';
import { BOT_NAMES } from './practice';
import { loadTuning } from '../ui/tuning';

export interface BrawlPracticeOptions {
  variant: BrawlVariant;
  /** TDM: players per team (you + bots); FFA: players in all (you + bots) */
  size: number;
  skill: BotSkillName;
  /** the first map (default: the default match map); later ones follow the rotation */
  map?: string;
  /** default: your saved tuning (Boomerang kit) */
  config?: GameConfig;
}

export const BRAWL_HINT =
  'Brawl · Tab scoreboard · Esc menu · LMB throw · RMB wind-up · E slash · R recall · Q grenade';

/** The offline Brawl session: the local sim with the Brawl rules. */
export class BrawlLocalSession extends LocalSession {
  constructor(
    opts: LocalSessionOptions,
    readonly brawl: BrawlState,
    readonly mapId: string,
    /** true once the results are over: time for the next map */
    readonly nextDue: () => boolean,
  ) {
    super(opts);
  }

  // no teleports / respawn button in a Brawl
  override teleport(): void {}
  override respawn(): void {}
}

/** An offline Brawl vs bots (no rendering): used by startBrawlPractice and tests. */
export const createBrawlPractice = (opts: BrawlPracticeOptions): BrawlLocalSession => {
  const variant = opts.variant;
  const mapId = brawlMaps().some((m) => m.id === opts.map) ? opts.map! : DEFAULT_MATCH_MAP();
  const config = opts.config ?? loadTuning();
  const brawl = createBrawl(variant);
  const size = Math.max(variant === 'ffa' ? 2 : 1, Math.min(10, Math.floor(opts.size)));
  const mems: BotMemory[] = [];
  const names: Record<number, string> = {};
  const skill = BOT_SKILLS[botSkillName(opts.skill)];
  let nextDue = false;
  return new BrawlLocalSession(
    {
      levelDef: mapDef(mapId),
      config,
      seed: 1 + Math.floor(Math.random() * 1e6),
      names,
      ffa: variant === 'ffa',
      setup: (world, ctx) => {
        let id = 2;
        let n = 0;
        // TDM: your team gets size - 1 bots, the other team size; FFA: size - 1 bots
        const teams: [number, number] = variant === 'ffa' ? [0, size - 1] : [size - 1, size];
        for (const team of [0, 1] as const)
          for (let i = 0; i < teams[team]; i++) {
            const s = ctx.level.def.spawns[id % ctx.level.def.spawns.length];
            addPlayer(world, createPlayer(id, team, s.pos, s.yawDeg, ctx.config));
            mems.push(createBotMemory(id, skill, id * 13));
            const ally = variant === 'tdm' && team === 0;
            names[id] = `${BOT_NAMES[n++ % BOT_NAMES.length]}${ally ? ' (ally)' : ''}`;
            id++;
          }
        startBrawl(brawl, world, ctx);
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
        if (updateBrawl(brawl, world, ctx)) nextDue = true;
        applyBrawlBotObjectives(brawl, world, ctx, mems);
      },
    },
    brawl,
    mapId,
    () => nextDue,
  );
};

/**
 * Start an offline Brawl vs bots (call from a click: it locks the pointer). After the results
 * the next map of the rotation loads by itself. `keepLock`: the pointer stays locked (map
 * change); `onBack`: the results' Back to menu button.
 */
export const startBrawlPractice = (
  app: App,
  opts: BrawlPracticeOptions,
  keepLock = false,
): void => {
  const session = createBrawlPractice(opts);
  const combat = new CombatFeature();
  const hud = new BrawlFeature({
    view: () => brawlView(session.brawl, session.world(), session.mapId),
    combat,
    onBack: () => app.quitToTitle(),
  });
  let switching = false;
  const next: ClientFeature = {
    frame: () => {
      if (switching || !session.nextDue()) return;
      switching = true;
      // (not inside this frame: the game is torn down and rebuilt)
      window.setTimeout(() => {
        if (app.client?.session !== session) return;
        startBrawlPractice(app, { ...opts, map: nextBrawlMap(session.mapId) }, true);
      }, 0);
    },
  };
  const client = app.startGame(session, [combat, hud, next], { tuning: false, keepLock });
  client.hud.setHint(BRAWL_HINT);
};

/** The Brawl HUD for an online Brawl room (public quick play or a private room). */
export const brawlOnlineFeatures = (
  core: NetCore,
  combat: CombatFeature,
  onBack: () => void,
): ClientFeature[] => [
  new BrawlFeature({ view: () => brawlFromExtra(core.extra), combat, onBack }),
];
