// PARKOUR RACE — entry points for the menus (search term: race).
//
// 1–8 racers run a race track (shared rules/race.ts): a 3-2-1 start, numbered checkpoints, the
// finish; no weapons, racers see-through and passing through each other. SURGE (Shift) is a
// short burst, 3 per race; the jetpack tank refills only at fuel cells; falling off or holding
// R puts you back at your last checkpoint after 1.5 s. Tracks: the maps with `race: true`.
//
//   startRacePractice(app, { track, bots, skill })   offline: a time trial (bots 0) or vs bot
//                                                     racers on this PC, your best's ghost
//   createRaceRoom(core, { track, bots, skill })      private race room (share core.code)
//   RaceNetSession / raceOnlineFeatures(core)         what App.startOnline uses in race rooms
// Ranked races come from the Race queue (Ranked screen); the server sends your rating change
// after the race (core.raceRating), shown on the results screen.
import type {
  BotSkillName,
  GameConfig,
  LevelDef,
  NetCore,
  PlayerInput,
  RaceDef,
  RaceState,
  RacerMemory,
} from '@space-yz/shared';
import {
  addPlayer,
  botSkillName,
  createPlayer,
  createRace,
  createRacerMemory,
  DEFAULT_RACE_MAP,
  getMap,
  raceJoin,
  racerThink,
  RACER_SKILLS,
  raceView,
  requestRaceStart,
  sendRacerBack,
  updateRace,
} from '@space-yz/shared';
import type { App } from '../app';
import type { ClientFeature } from './client';
import { LocalSession, type LocalSessionOptions } from './local-session';
import type { RenderPlayer } from './session';
import { NetSession } from '../net/net-session';
import { RaceFeature, raceFromExtra, raceTag } from './race-feature';
import { BOT_NAMES } from './practice';
import { loadTuning } from '../ui/tuning';
import { officialMapDef } from '../net/official-maps';

export interface RacePracticeOptions {
  /** map id of a race track (default: the first one) */
  track?: string;
  /** bot racers, 0 (a time trial) – 7 */
  bots: number;
  skill: BotSkillName;
  config?: GameConfig;
  /** race on this level instead of a track's (the Map Maker's test run; `track` names it) */
  levelDef?: LevelDef;
  /** the name the race HUD shows (default: the track's) */
  trackName?: string;
}

/** The track to race: a race track's id, else the default one. */
export const raceTrackId = (id: string | undefined): string =>
  id && getMap(id).id === id && getMap(id).race ? id : DEFAULT_RACE_MAP;

/** Offline race session: the local sim with the race rules; name tags show positions. */
export class RaceLocalSession extends LocalSession {
  constructor(
    opts: LocalSessionOptions,
    readonly race: RaceState,
  ) {
    super(opts);
  }

  override others(): RenderPlayer[] {
    const v = raceView(this.race, this.ctx);
    return super.others().map((p) => ({ ...p, name: raceTag(p.name, v, p.id) }));
  }

  // no teleports; the menu's Respawn is the race's own: back to your last checkpoint (like R)
  override teleport(): void {}
  override respawn(): void {
    const p = this.local();
    if (p?.alive && !p.frozen) sendRacerBack(this.world(), this.ctx, p, 'key');
  }
}

/** An offline race vs bot racers (no rendering): used by startRacePractice and tests. */
export const createRacePractice = (
  opts: RacePracticeOptions,
): { session: RaceLocalSession; race: RaceState } => {
  const track = opts.levelDef ? (opts.track ?? 'custom') : raceTrackId(opts.track);
  const bots = Math.max(0, Math.min(7, Math.floor(opts.bots)));
  // offline: the countdown starts right away, and the next race soon after the results
  const race = createRace(track, { lobbySec: 2, resultsSec: 10 });
  const mems: RacerMemory[] = [];
  const names: Record<number, string> = {};
  const skill = RACER_SKILLS[botSkillName(opts.skill)];
  const session = new RaceLocalSession(
    {
      levelDef: opts.levelDef ?? officialMapDef(track),
      config: opts.config ?? loadTuning(),
      seed: 1 + Math.floor(Math.random() * 1e6),
      names,
      setup: (world, ctx) => {
        for (let i = 0; i < bots; i++) {
          const id = i + 2;
          const s = ctx.level.def.race!.grid[(i + 1) % 8];
          addPlayer(world, createPlayer(id, 0, s.pos, s.yawDeg, ctx.config));
          mems.push(createRacerMemory(id, skill, id * 131 + 7));
          names[id] = BOT_NAMES[i % BOT_NAMES.length];
        }
        for (const p of world.players) raceJoin(race, world, ctx, p.id);
        requestRaceStart(race, world);
      },
      extraInputs: (world, ctx) => {
        const inputs: Record<number, PlayerInput> = {};
        for (const mem of mems) {
          const p = world.players.find((q) => q.id === mem.id);
          if (p) inputs[p.id] = racerThink(world, ctx, p, mem);
        }
        return inputs;
      },
      afterStep: (world, ctx) => updateRace(race, world, ctx),
    },
    race,
  );
  return { session, race };
};

/** The race controls line: the jetpack and SURGE only on tracks that have them. */
export const raceHint = (race: RaceDef | undefined): string => {
  const parts = [
    'Race · W run',
    'Space jump (tap it as you land: bunny hop)',
    'A/D + turn the mouse the same way: air-strafe',
  ];
  if (race && !race.surf && !race.noJetpack) parts.push('hold Space in the air: jetpack');
  if (race && !race.surf && !race.noSurge) parts.push('Shift SURGE');
  parts.push('Ctrl slide', 'hold R: back to checkpoint', 'Esc menu');
  return parts.join(' · ');
};

/** Start an offline race (call from a click: it locks the pointer). */
export const startRacePractice = (app: App, opts: RacePracticeOptions): void => {
  const { session, race } = createRacePractice(opts);
  const track = race.track;
  const feature = new RaceFeature({
    view: () => raceView(race, session.ctx),
    track,
    trackName: opts.trackName ?? getMap(track).name,
  });
  const client = app.startGame(session, [feature], { tuning: false });
  client.hud.setHint(raceHint(session.level.def.race), 16);
};

/** Create a private race room ('bots' bot racers fill it up to 1 + bots, max 8). */
export const createRaceRoom = (
  core: NetCore,
  opts: { track: string; bots?: number; skill?: BotSkillName },
): void =>
  core.createRoom(
    'race',
    raceTrackId(opts.track),
    Math.max(0, Math.min(7, opts.bots ?? 0)),
    opts.skill,
  );

/** Online race rooms: name tags show positions. */
export class RaceNetSession extends NetSession {
  override others(): RenderPlayer[] {
    const v = raceFromExtra(this.core.extra);
    return super.others().map((p) => ({ ...p, name: raceTag(p.name, v, p.id) }));
  }
}

/** An online race room waiting in its lobby (the host may start it now). */
export const isRaceLobby = (s: unknown): boolean =>
  s instanceof RaceNetSession && raceFromExtra(s.core.extra)?.phase === 'lobby';

/** The race HUD for an online race room. */
export const raceOnlineFeatures = (core: NetCore): ClientFeature[] => [
  new RaceFeature({
    view: () => raceFromExtra(core.extra),
    track: core.map,
    trackName: core.custom?.kind === 'custom' ? core.custom.name : getMap(core.map).name,
    rated: () => core.raceRating,
  }),
];
