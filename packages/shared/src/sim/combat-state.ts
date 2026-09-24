// Combat-related state (Boomerang, Laser, Grenade, Slash, Dash).
import type { Vec3 } from '../math/vec3';

export const Phase = {
  Held: 0,
  Out: 1,
  Return: 2,
  Dropped: 3,
  RecallTelegraph: 4,
  Recall: 5,
  Deflected: 6, // flying straight back after a deflect, controlled by the deflector
} as const;
export type BoomerangPhase = (typeof Phase)[keyof typeof Phase];

export interface BoomerangState {
  id: number; // == owner player id (one Boomerang per player)
  owner: number; // whose Boomerang it is (catch / pick up / recall)
  controller: number; // who gets credit for damage (changes on deflect)
  phase: BoomerangPhase;
  pos: Vec3;
  vel: Vec3;
  t: number; // ticks in current phase
  outTicks: number; // planned out-flight ticks
  curve: number; // -1 left, 0 straight, +1 right
  curveAxis: Vec3; // axis the curve rotates around (thrower's up at release)
  windup: boolean; // Wind-up Throw: straight, fast, one-hit kill
  steerLeft: number; // ticks of steering left
  hitIds: number[]; // players already hit in this phase
  throwId: number;
  recallFrom: Vec3 | null;
  recallTo: Vec3 | null;
  recallLethal: boolean;
}

export interface GrenadeState {
  id: number;
  owner: number;
  pos: Vec3;
  vel: Vec3;
  phase: 0 | 1 | 2; // 0 flying, 1 pulling, 2 finished
  t: number;
}

export interface CombatPlayerState {
  aiming: boolean; // holding LMB to aim a Quick Throw
  aimTicks: number;
  windup: number; // ticks wound up (0 = not winding)
  windupHeld: number; // ticks held after fully wound
  laserCharges: number;
  laserRecharge: number; // ticks until next charge
  laserWarn: number; // ticks until a pending laser shot fires (0 = none)
  slashCd: number;
  slashTicks: number; // remaining active slash window
  slashHit: boolean;
  grenadesLeft: number;
  lastHurtTick: number;
  lastAttacker: number;
  kills: number;
  deaths: number;
  teamKills: number;
  damageDealt: number;
}
