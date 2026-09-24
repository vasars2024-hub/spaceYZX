// Every combat number in one place (Milestone 3 fills in behaviour for all of these).
// Units: metres, seconds, m/s, HP.

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
  quickOutSec: 0.42,
  quickCurveDegPerSec: 140,
  returnTurnDegPerSec: 540,
  returnSpeed: 45,
  boomerangGravityScale: 0.15, // in normal gravity: a slight, readable drop
  boomerangZoneGravityScale: 0.5, // inside special gravity zones: strong bend (the feature)
  catchRadius: 1.3,
  pickupRadius: 1.2,
  maxFlightSec: 4,
  quickHeadDamage: 100,
  quickBodyDamage: 50,
  aimFov: 90,

  // Steering
  steerDegPerSec: 170,
  steerSec: 0.5,

  // Wind-up Throw
  windupSec: 3,
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
  slashDamage: 50,
  slashCooldownSec: 0.8,
  slashHitCooldownSec: 0.4,
  slashActiveSec: 0.12,
  slashLunge: 4,
  deflectConeDeg: 20,

  // Laser
  laserCharges: 3,
  laserRechargeSec: 4,
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

  // Awareness
  multiKillWindowSec: 3,
} as const;

export type CombatConfig = { -readonly [K in keyof typeof COMBAT_DEFAULTS]: number };
