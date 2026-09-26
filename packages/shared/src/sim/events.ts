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
  | 'blast'
  | 'bomb'
  | 'ak'
  | 'deagle'
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
  | { type: 'jetpack'; player: number }
  | { type: 'wallBounce'; boomerang: number; pos: Vec3 }
  | { type: 'laserReload'; player: number }
  | { type: 'overtime'; kind: 'collapse' | 'sky' }
  | { type: 'bombDrop'; pos: Vec3 }
  | { type: 'bombPickup'; player: number }
  | { type: 'plantStart'; player: number; site: 'A' | 'B' }
  | { type: 'plantCancel'; player: number }
  | { type: 'bombPlanted'; player: number; site: 'A' | 'B'; pos: Vec3 }
  | { type: 'defuseStart'; player: number }
  | { type: 'defuseCancel'; player: number }
  | { type: 'bombDefused'; player: number }
  | { type: 'bombExploded'; pos: Vec3 }
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
  // CS mode guns: `to` = where the bullet stopped, `hit` = player id or -1, `normal` = the wall's
  // normal when it hit the level (bullet hole), `head` = a head shot
  | {
      type: 'gunFire';
      player: number;
      gun: 'ak' | 'deagle';
      from: Vec3;
      to: Vec3;
      hit: number;
      head: boolean;
      normal: Vec3 | null;
    }
  | { type: 'gunReload'; player: number; gun: 'ak' | 'deagle' }
  | { type: 'gunDraw'; player: number; gun: 'ak' | 'deagle' }
  | { type: 'grenadeThrow'; player: number; grenade: number }
  | { type: 'grenadeActivate'; grenade: number; pos: Vec3; shot: boolean }
  | { type: 'grenadePop'; grenade: number; pos: Vec3 }
  /** `attacker`'s hit broke `victim`'s round-start shield instead of hurting them */
  | { type: 'shieldBreak'; attacker: number; victim: number; pos: Vec3 }
  /** an explosive Quick Throw went off (`player`: whose blast it is) */
  | { type: 'blast'; player: number; boomerang: number; pos: Vec3 }
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
    }
  // power-ups (sim/powerups.ts, rules/powerups.ts). kind: 1 = Freeze, 2 = Double boomerang
  | { type: 'powerupSpawn'; id: number; kind: 1 | 2; pos: Vec3 }
  | { type: 'powerupPickup'; player: number; id: number; kind: 1 | 2; pos: Vec3 }
  /** a Freeze hit: `victim` can't move or act for a moment */
  | { type: 'freeze'; attacker: number; victim: number; pos: Vec3 }
  /** a Double-boomerang Quick Throw also threw this twin (id in world.twins) */
  | { type: 'twinThrow'; player: number; twin: number }
  | { type: 'twinBounce'; twin: number; pos: Vec3 }
  /** a twin is gone: its 2nd wall (`wall`) or the end of its out-flight */
  | { type: 'twinEnd'; twin: number; pos: Vec3; wall: boolean }
  // match rules
  | { type: 'roundStart'; round: number; suddenDeath: boolean }
  | { type: 'roundLive'; round: number }
  | { type: 'roundEnd'; round: number; winner: 0 | 1 | null; reason: string }
  | { type: 'matchEnd'; winner: 0 | 1 | null; reason: string }
  | { type: 'controllerDrop'; team: 0 | 1; pos: Vec3 }
  | { type: 'controllerPickup'; team: 0 | 1; player: number }
  | { type: 'controllerReturn'; team: 0 | 1 }
  | { type: 'towerTouch'; team: 0 | 1; player: number }
  // a dead player took over a bot teammate's body (server-applied between ticks)
  | { type: 'takeover'; player: number; bot: number };
