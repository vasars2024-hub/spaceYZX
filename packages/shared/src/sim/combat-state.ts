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
  tiltRef: Vec3; // the throw's flat aim direction: turning away from it tilts a Quick Throw
  windup: boolean; // Wind-up Throw: straight, fast, one-hit kill
  steerLeft: number; // ticks of steering left
  hitIds: number[]; // players already hit in this phase
  throwId: number;
  recallFrom: Vec3 | null;
  recallTo: Vec3 | null;
  recallLethal: boolean;
  explosive: boolean; // this Quick Throw explodes on the first wall or player it hits
  bounced: boolean; // a Quick Throw bounces off the first wall it hits, then drops on the next
}

export interface GrenadeState {
  id: number;
  owner: number;
  pos: Vec3;
  vel: Vec3;
  phase: 0 | 1 | 2; // 0 flying, 1 pulling, 2 finished
  t: number;
}

/**
 * Power-ups (lethal loadout only; config/loadout.ts `powerups`). The match rules spawn them in
 * the middle of the map (rules/powerups.ts); walking into one picks it up (sim/powerups.ts).
 * 0 = none held.
 */
export const Powerup = {
  None: 0,
  /** your next few damaging Boomerang / Laser / slash hits on an enemy also freeze them */
  Freeze: 1,
  /** your next few Quick Throws split: the real Boomerang plus a mirrored "twin" */
  Double: 2,
} as const;
export type PowerupKind = (typeof Powerup)[keyof typeof Powerup];
export const POWERUP_NAMES: Record<PowerupKind, string> = {
  0: '',
  1: 'FREEZE',
  2: 'DOUBLE BOOMERANG',
};

/** A power-up floating at its spawn point, waiting to be picked up. */
export interface PowerupPickup {
  id: number;
  kind: 1 | 2;
  pos: Vec3;
  /** tick it appeared (the client spins/bobs it from here) */
  spawnTick: number;
}

export interface CombatPlayerState {
  aiming: boolean; // holding LMB to aim a Quick Throw
  aimTicks: number;
  blastCount: number; // Quick Throws since the last explosion (charged at blastEvery - 1)
  flick: number; // smoothed sideways turn rate (deg/s, + = right): sets the Quick Throw curve
  windup: number; // ticks wound up (0 = not winding)
  windupHeld: number; // ticks held after fully wound
  weapon: 0 | 1; // 0 = Boomerang, 1 = Laser (the Laser is also used whenever the Boomerang is away)
  laserCharges: number; // shots left in the magazine
  laserReserve: number; // spare shots
  laserReload: number; // ticks until the reload finishes (0 = not reloading)
  laserCd: number; // ticks until the next shot is allowed
  laserWarn: number; // ticks until a pending laser shot fires (0 = none)
  slashCd: number;
  slashTicks: number; // remaining active slash window
  slashHit: boolean;
  grenadesLeft: number;
  // CS mode guns (sim/guns.ts). `weapon` 0 = AK-47, 1 = Desert Eagle there.
  akMag: number;
  akReserve: number;
  deagleMag: number;
  deagleReserve: number;
  gunCd: number; // ticks until the next shot is allowed (fire rate, drawing a gun)
  gunReload: number; // ticks until the reload finishes (0 = not reloading)
  gunSpray: number; // spray pattern index (fractional while it recovers toward 0)
  gunPenalty: number; // stored inaccuracy (mrad): stance base + firing + landing, recovering
  gunLastShot: number; // tick of the last shot
  gunShots: number; // shots fired (this life)
  // Power-ups (sim/powerups.ts)
  powerup: PowerupKind; // held power-up (one at a time)
  powerupCharges: number; // uses left of the held power-up
  /**
   * Freeze power-up stun, in ticks left (NOT the spawn-lock `frozen`: a stunned player can't
   * move or act but still takes damage). Counts down in updateCombat.
   */
  stun: number;
  /**
   * Round-start shield: soaks up the next hit completely (a headshot, a Lethal Recall, even a
   * small Laser shot) and breaks. A charged Wind-up Throw goes straight through it.
   */
  shield: boolean;
  lastHurtTick: number;
  lastAttacker: number;
  kills: number;
  deaths: number;
  teamKills: number;
  damageDealt: number;
}
