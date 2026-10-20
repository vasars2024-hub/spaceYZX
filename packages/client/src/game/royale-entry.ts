// ROYALE — entry points for the menus (search term: royale).
//
// Royale: free-for-all elimination on a royale map (LevelDef.royale). One life per round, a
// shrinking zone, location flashes; the last player alive wins the round, the first to win 3
// rounds wins the match. Rules: shared/rules/royale.ts; HUD: royale-feature.ts.
//
//   createRoyalePractice(opts)         an offline Royale vs bots (no rendering; tests use it)
//   startRoyalePractice(app, opts)     offline Royale vs bots on this PC (a new match starts
//                                      by itself after the results)
//   RoyaleNetSession                   the online session of a 'royale' room (draws the zone)
//   royaleOnlineFeatures(core, ...)    HUD features for App.startOnline in 'royale' rooms
import type {
  BotMemory,
  BotSkillName,
  GameConfig,
  LevelDef,
  NetCore,
  PlayerInput,
  RoyaleState,
} from '@space-yz/shared';
import {
  BOT_SKILLS,
  DEFAULT_BRAWL_MAP,
  DEFAULT_ROYALE_MAP,
  ROYALE_DEFAULTS,
  addPlayer,
  applyRoyaleBotObjectives,
  botSkillName,
  botThink,
  createBotMemory,
  createPlayer,
  createRoyale,
  royaleMaps,
  royaleView,
  startRoyale,
  updateRoyale,
} from '@space-yz/shared';
import type { App } from '../app';
import type { RenderPlayer, ZoneDraw } from './session';
import { CombatFeature } from './combat-feature';
import { LocalSession, type LocalSessionOptions } from './local-session';
import { RoyaleFeature, royaleFromExtra, royaleZoneDraw } from './royale-feature';
import { BOT_NAMES } from './practice';
import { loadTuning } from '../ui/tuning';
import { officialMapDef } from '../net/official-maps';
import { NetSession } from '../net/net-session';
import type { ClientFeature } from './client';

export interface RoyalePracticeOptions {
  /** players in all (you + bots), 2–10 (the menu offers 5–10) */
  size: number;
  skill: BotSkillName;
  /** a map with royale data (default: the first one) */
  map?: string;
  /** play this level instead of a registered map (tests: a small royale test map) */
  levelDef?: LevelDef;
  /** default: your saved tuning (Boomerang kit) */
  config?: GameConfig;
}

export const ROYALE_HINT =
  'Royale · Tab standings · M map · Esc menu · stay in the zone · last one standing wins';

/** The offline Royale session: the local sim with the Royale rules. */
export class RoyaleLocalSession extends LocalSession {
  constructor(
    opts: LocalSessionOptions,
    readonly royale: RoyaleState,
    readonly mapId: string,
  ) {
    super(opts);
  }

  // no teleports / respawn button in a Royale
  override teleport(): void {}
  override respawn(): void {}

  /** (the location flash reveals everyone alive) */
  override others(): RenderPlayer[] {
    const shown = new Set(this.royale.revealed);
    return super.others().map((p) => (shown.has(p.id) ? { ...p, revealed: true } : p));
  }

  zone(): ZoneDraw | null {
    return royaleZoneDraw(royaleView(this.royale, this.world(), this.mapId), this.world().tick);
  }
}

/** An offline Royale vs bots (no rendering): used by startRoyalePractice and tests. */
export const createRoyalePractice = (opts: RoyalePracticeOptions): RoyaleLocalSession => {
  const mapId = opts.levelDef
    ? (opts.map ?? 'royale-test')
    : royaleMaps().some((m) => m.id === opts.map)
      ? opts.map!
      : (DEFAULT_ROYALE_MAP() ?? DEFAULT_BRAWL_MAP());
  const config = opts.config ?? loadTuning();
  const royale = createRoyale();
  const size = Math.max(2, Math.min(ROYALE_DEFAULTS.maxPlayers, Math.floor(opts.size)));
  const mems: BotMemory[] = [];
  const names: Record<number, string> = {};
  const skill = BOT_SKILLS[botSkillName(opts.skill)];
  return new RoyaleLocalSession(
    {
      levelDef: opts.levelDef ?? officialMapDef(mapId),
      config,
      seed: 1 + Math.floor(Math.random() * 1e6),
      names,
      ffa: true,
      setup: (world, ctx) => {
        // you are team 0 and every bot team 1: drawn in the enemy colour (teams mean nothing in
        // a free-for-all)
        for (let id = 2; id <= size; id++) {
          const s = ctx.level.def.spawns[id % ctx.level.def.spawns.length];
          addPlayer(world, createPlayer(id, 1, s.pos, s.yawDeg, ctx.config));
          mems.push(createBotMemory(id, skill, id * 13));
          names[id] = BOT_NAMES[(id - 2) % BOT_NAMES.length];
        }
        startRoyale(royale, world, ctx);
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
        // after the match results the next match starts by itself
        if (updateRoyale(royale, world, ctx)) startRoyale(royale, world, ctx);
        applyRoyaleBotObjectives(royale, world, ctx, mems);
      },
    },
    royale,
    mapId,
  );
};

/** Start an offline Royale vs bots (call from a click: it locks the pointer). */
export const startRoyalePractice = (app: App, opts: RoyalePracticeOptions): void => {
  const session = createRoyalePractice(opts);
  const combat = new CombatFeature();
  const hud = new RoyaleFeature({
    view: () => royaleView(session.royale, session.world(), session.mapId),
    combat,
    onBack: () => app.quitToTitle(),
    afterMatch: 'Next match',
  });
  const client = app.startGame(session, [combat, hud], { tuning: false });
  client.hud.setHint(ROYALE_HINT);
};

/** The online session of a Royale room: the zone for the minimap from the rules state. */
export class RoyaleNetSession extends NetSession {
  zone(): ZoneDraw | null {
    return royaleZoneDraw(royaleFromExtra(this.core.extra), this.core.serverNow());
  }
}

/** Is this session an online Royale room waiting in its lobby? (the pause menu's Start) */
export const isRoyaleLobby = (s: unknown): boolean =>
  s instanceof RoyaleNetSession && royaleFromExtra(s.core.extra)?.phase === 'lobby';

/** The Royale HUD for an online Royale room. */
export const royaleOnlineFeatures = (
  core: NetCore,
  combat: CombatFeature,
  onBack: () => void,
): ClientFeature[] => [
  new RoyaleFeature({
    view: () => royaleFromExtra(core.extra),
    combat,
    onBack,
    canStart: () => !core.ranked && core.hostId === core.localId,
  }),
];
