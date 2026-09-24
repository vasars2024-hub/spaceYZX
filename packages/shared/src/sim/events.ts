// Events emitted by one simulation step (for sounds, effects, kill feed, stats).
import type { Vec3 } from '../math/vec3';

export type KillKind =
  | 'boomerang'
  | 'headshot'
  | 'windup'
  | 'recall'
  | 'deflect'
  | 'slash'
  | 'laser'
  | 'grenade'
  | 'world';

export type SimEvent =
  | { type: 'jump'; player: number }
  | { type: 'land'; player: number; speed: number }
  | { type: 'slide'; player: number; boosted: boolean }
  | { type: 'wallJump'; player: number }
  | { type: 'mantle'; player: number }
  | { type: 'railGrab'; player: number }
  | { type: 'railRelease'; player: number }
  | { type: 'thruster'; player: number }
  | { type: 'pushOff'; player: number }
  | { type: 'mag'; player: number; on: boolean }
  | { type: 'padFlip'; pad: number; zone: number }
  | { type: 'dash'; player: number }
  | { type: 'throw'; player: number; boomerang: number; windup: boolean }
  | { type: 'catch'; player: number; boomerang: number }
  | { type: 'pickup'; player: number; boomerang: number }
  | { type: 'wallHit'; boomerang: number; pos: Vec3 }
  | { type: 'clash'; a: number; b: number; pos: Vec3 }
  | { type: 'deflect'; player: number; boomerang: number; pos: Vec3 }
  | {
      type: 'recallStart';
      player: number;
      boomerang: number;
      from: Vec3;
      to: Vec3;
      lethal: boolean;
    }
  | { type: 'recallGo'; player: number; boomerang: number }
  | { type: 'windupStart'; player: number }
  | { type: 'windupReady'; player: number }
  | { type: 'windupCancel'; player: number }
  | { type: 'slash'; player: number }
  | { type: 'laserWarn'; player: number }
  | { type: 'laserFire'; player: number; from: Vec3; to: Vec3; hit: number }
  | { type: 'grenadeThrow'; player: number; grenade: number }
  | { type: 'grenadeActivate'; grenade: number; pos: Vec3; shot: boolean }
  | { type: 'grenadePop'; grenade: number; pos: Vec3 }
  | {
      type: 'hit';
      attacker: number;
      victim: number;
      damage: number;
      head: boolean;
      kind: KillKind;
      pos: Vec3;
      src: Vec3; // where the damage came from (for direction indicators / off-screen stats)
    }
  | {
      type: 'kill';
      attacker: number;
      victim: number;
      kind: KillKind;
      teamKill: boolean;
      pos: Vec3;
      src: Vec3;
      throwId: number; // groups multi-kills from one throw/recall (0 if n/a)
    };
