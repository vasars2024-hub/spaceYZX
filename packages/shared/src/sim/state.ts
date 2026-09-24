// World/player state: plain JSON-serializable data only.
import type { Vec3 } from '../math/vec3';
import type { Quat } from '../math/quat';
import type { RngState } from '../math/rng';
import type { SimEvent } from './events';
import type { BoomerangState, GrenadeState, CombatPlayerState } from './combat-state';

export const Move = {
  Ground: 0,
  Air: 1,
  Slide: 2,
  Mantle: 3,
  Rail: 4,
  Float: 5, // zero-G
  Climb: 6,
} as const;
export type MoveState = (typeof Move)[keyof typeof Move];

export const MOVE_NAMES = ['ground', 'air', 'slide', 'mantle', 'rail', 'zero-g', 'climb'];

export interface MantleState {
  from: Vec3;
  mid: Vec3;
  to: Vec3;
  t: number; // ticks elapsed
  dur: number; // ticks
  exitVel: Vec3;
}

export interface RailRide {
  rail: number;
  s: number;
  dir: 1 | -1;
  speed: number;
}

export interface PlayerState extends CombatPlayerState {
  id: number;
  team: 0 | 1;
  alive: boolean;
  hp: number;
  pos: Vec3; // capsule center
  vel: Vec3;
  up: Vec3; // body up (rotates toward -gravity)
  view: Quat; // last input view
  move: MoveState;
  crouched: boolean;
  grounded: boolean;
  groundNormal: Vec3;
  gravity: Vec3; // gravity acting this tick (for HUD/camera)
  // timers in ticks
  coyote: number;
  jumpBuffer: number;
  landGrace: number;
  slideBoostCd: number;
  airTicks: number;
  tapWindow: number;
  climbLeft: number;
  railCd: number;
  thrusterRecharge: number;
  dashCd: number;
  dashTicks: number;
  // counters
  wallJumpsLeft: number;
  tapStrafesLeft: number;
  thrusterCharges: number;
  lastWallNormal: Vec3 | null;
  mantle: MantleState | null;
  rail: RailRide | null;
  mag: Vec3 | null; // mag-boots target surface normal
  prevButtons: number;
  frozen: boolean; // spawn lock: can look, can't move/act
  speedCap: number; // >0 caps planar speed this tick (wind-up slow walk)
}

export interface ZoneRuntime {
  override: Vec3 | null;
  until: number; // tick when the override ends
}

export interface WorldState {
  tick: number;
  rng: RngState;
  players: PlayerState[];
  boomerangs: BoomerangState[];
  grenades: GrenadeState[];
  zones: ZoneRuntime[];
  padReadyAt: number[];
  events: SimEvent[];
  nextId: number;
}
