// Every combat number in one place (Milestone 3 fills in behaviour for all of these).
// Units: metres, seconds, m/s, HP.
import { GUN_DEFAULTS } from './guns';

export const COMBAT_DEFAULTS = {
  maxHp: 100,

  // Hitboxes (honest, not oversized)
  headRadius: 0.17,
  bodyRadius: 0.33,
  bodyBottom: 0.15, // from feet
  bodyTop: 1.45, // from feet (standing)
  bodyTopSlide: 1.25, // sliding shrinks the hitbox only slightly

  // Boomerang: Quick Throw
  boomerangRadius: 0.22,
  quickSpeed: 45,
  quickOutSec: 0.63, // +50 % range after the first playtest (was 0.42: ~19 m → ~28 m)
  quickCurveDegPerSec: 140,
  // Tilt: while a Quick Throw flies out, flicking your view left/right tilts it that way. The
  // tilt is how far you've turned from a "centre" that follows your aim at `Recenter` deg/s, so
  // a quick flick bends it hard and then fades, while slow aiming doesn't bend it at all. Up to
  // `Dead` degrees does nothing, at `Full` degrees it curves at the full `quickCurveDegPerSec`.
  tiltDeadDeg: 4,
  tiltFullDeg: 25,
  tiltRecenterDegPerSec: 70,
  // (old) mouse-flick curve on release: tracked but no longer used by the throw
  flickDeadDegPerSec: 30,
  flickFullDegPerSec: 300,
  flickDecay: 0.88,
  returnTurnDegPerSec: 540,
  returnSpeed: 45,
  boomerangGravityScale: 0.15, // in normal gravity: a slight, readable drop
  boomerangZoneGravityScale: 0.5, // inside special gravity zones: strong bend (the feature)
  catchRadius: 1.3,
  pickupRadius: 1.2,
  maxFlightSec: 4,
  quickHeadDamage: 100,
  quickBodyDamage: 50,
  // Explosive throw: every `blastEvery`-th Quick Throw explodes on the first wall or player it
  // hits (no bounce), hurting enemies within `blastRadius`. If it hits nothing, the charge
  // stays for the next throw.
  blastEvery: 6,
  blastDamage: 30,
  blastRadius: 3.5,
  aimFov: 90,

  // Steering
  steerDegPerSec: 170,
  steerSec: 0.5,

  // Wind-up Throw
  windupSec: 1.22, // was 3, then 1.75; 30 % shorter again after a playtest
  windupHoldSec: 4,
  windupSpeed: 150,
  windupWalkSpeed: 2.5,
  windupFov: 70,
  windupRange: 120,

  // Lethal Recall
  recallTelegraphSec: 0.3,
  recallSpeed: 80,
  recallKillRadius: 0.55,

  // Slash & deflect
  slashRange: 2.2,
  slashConeDeg: 40,
  slashDamage: 34, // 3 slashes kill (100 HP)
  slashCooldownSec: 0.8,
  slashHitCooldownSec: 0.4,
  slashActiveSec: 0.12,
  slashLunge: 4,
  deflectConeDeg: 20,

  // Laser
  // Laser: a real weapon you can switch to (keys 1 / 2), with a magazine and a per-round reserve;
  // R reloads while it's out (and it reloads by itself when the magazine runs dry)
  laserCharges: 6, // magazine size
  laserReserve: 18, // spare shots per round
  laserReloadSec: 1.4,
  laserFireCdSec: 0.3, // between shots (after the warning line)
  laserWarnSec: 0.2,
  laserBodyDamage: 20,
  laserHeadDamage: 35,
  laserRange: 200,

  // Gravity Grenade
  grenadeSpeed: 20,
  grenadeRadius: 0.3,
  grenadeHitRadius: 0.45, // shootable hitbox
  grenadeFuseSec: 1.2,
  grenadePullSec: 1.5,
  grenadePullRadius: 7,
  grenadePullAccel: 28,
  grenadeDamage: 40,
  grenadeDamageRadius: 5,
  grenadesPerRound: 1,

  // Power-ups (lethal loadout only; the match rules spawn them: rules config `powerup*`)
  powerupPickupRadius: 1.2, // from the power-up to your body (feet-to-head line)
  // Freeze: your next N damaging Boomerang / Laser / slash hits on an enemy who survives
  // the hit also freeze them for freezeSec (a new hit refreshes it, never beyond freezeSec)
  freezeCharges: 3,
  freezeSec: 1.0,
  // Double boomerang: your next N Quick Throws also throw a "twin" that flies the mirrored
  // curve (a straight throw: angled twinStraightDeg to the right), deals Quick Throw damage,
  // bounces off one wall and vanishes at the end of its out-flight or on its 2nd wall
  doubleCharges: 3,
  twinStraightDeg: 12,

  // Awareness
  multiKillWindowSec: 3,

  // Loadout (config/loadout.ts): 0 = Lethal Recoil kit, 1 = CS mode (AK-47 + Desert Eagle).
  // Set by csConfig(), never by hand.
  loadout: 0,

  // CS mode guns (config/guns.ts)
  ...GUN_DEFAULTS,
} as const;

export type CombatConfig = { -readonly [K in keyof typeof COMBAT_DEFAULTS]: number };
