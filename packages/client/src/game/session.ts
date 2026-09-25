// A Session owns the simulation the player sees: offline (local sim + bots) or online
// (prediction + interpolation). The GameClient renders whatever the session exposes.
import type {
  GameConfig,
  Level,
  PlayerState,
  Quat,
  SimEvent,
  Vec3,
  WorldState,
  BoomerangState,
  GrenadeState,
  SimContext,
  MatchView,
} from '@space-yz/shared';

/** Match state as the client sees it (rules view + per-player stats). */
export interface MatchInfo extends MatchView {
  startAt: number;
  /** every player in the match (also ones you can't currently see) */
  stats: {
    id: number;
    team: 0 | 1;
    kills: number;
    deaths: number;
    teamKills: number;
    damage: number;
  }[];
}

export interface TickInput {
  buttons: number;
  view: Quat;
}

/** What the renderer needs for one other player. */
export interface RenderPlayer {
  id: number;
  team: 0 | 1;
  name: string;
  pos: Vec3;
  up: Vec3;
  view: Quat;
  vel: Vec3;
  crouched: boolean;
  alive: boolean;
  move: number;
  hp: number;
  windup: number;
  aiming: boolean;
  laserWarn: number;
  slashTicks: number;
  carrier: boolean;
  revealed: boolean;
}

export interface Session {
  readonly level: Level;
  readonly config: GameConfig;
  readonly localId: number;
  /** Simulation context (level + config) used for prediction and previews. */
  readonly ctx: SimContext;
  /** interpolation factor between the previous and current tick, for rendering */
  readonly alpha: number;
  /** Advance by real frame time; `sample` is called once per simulated tick. */
  update(frameDt: number, sample: () => TickInput): void;
  /** Local player (latest simulated/predicted). */
  local(): PlayerState | undefined;
  /** Local player's eye position, interpolated for rendering. */
  localEye(): Vec3 | undefined;
  /** Local player's interpolated body up. */
  localUp(): Vec3 | undefined;
  /** Other players, interpolated for rendering. */
  others(): RenderPlayer[];
  boomerangs(): BoomerangState[];
  grenades(): GrenadeState[];
  /** Latest world (offline: authoritative; online: predicted). */
  world(): WorldState;
  /** Events produced since the last drain. */
  drainEvents(): SimEvent[];
  names(): Record<number, string>;
  /** Team of every player, also ones not in `world()` (online: enemies you can't see). */
  teams?(): Record<number, 0 | 1>;
  /** Rounds & objective state (null in practice / playground). */
  match?(): MatchInfo | null;
  /** Current authoritative tick (for timers). */
  tickNow?(): number;
  /** Can this player start the match early? */
  canStart?(): boolean;
  startMatch?(): void;
  /** Offline: play again after the results screen. */
  restartMatch?(): void;
  report?(playerId: number, reason: string): void;
  /** Round-trip ping per player id (online). */
  pings?(): Record<number, number>;
  teleport?(areaIndex: number): void;
  respawn?(): void;
  dispose(): void;
}
