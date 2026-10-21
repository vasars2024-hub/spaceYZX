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
  // Speed falls off with distance — fast near, slower far — so short and medium throws arrive
  // before the target can move much: full `quickSpeed` for the first `quickFastDist` metres,
  // then slowing evenly to `quickFarSpeed` at `quickSlowDist` and beyond. The way back uses the
  // same curve by its distance to the thrower (it speeds up as it comes home).
  quickSpeed: 67.5, // m/s near (+50 % after a playtest; it was 45 m/s everywhere)
  quickFastDist: 20,
  quickFarSpeed: 42,
  quickSlowDist: 40,
  quickOutDist: 32, // it turns back after flying this far (was 0.63 s at 45 m/s ≈ 28 m)
  // In normal gravity a Quick Throw flies dead straight for its first `quickStraightDist`
  // metres (no drop), and a tilt (below) only bends it once it is `tiltStartDist` metres out:
  // a quick mouse correction right after letting go fades before it can pull the throw off
  quickStraightDist: 20,
  tiltStartDist: 8,
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
  boomerangGravityScale: 0.15, // in normal gravity: a slight, readable drop
  boomerangZoneGravityScale: 0.5, // inside special gravity zones: strong bend (the feature)
  catchRadius: 1.3,
  pickupRadius: 1.2,
  maxFlightSec: 4,
  quickHeadDamage: 100,
  quickBodyDamage: 50,
  // Fall damage (not in races): landings from up to `fallSafeHeight` metres are free; above it
  // damage grows with the impact speed, and a fall from `fallLethalHeight` or more kills.
  // (Falling speed tops out at 30 m/s ≈ a 22.5 m drop, so the lethal height must stay below.)
  fallSafeHeight: 8,
  fallLethalHeight: 22,
  // A launch pad or suction tube flight never hurts: no landing does until you have stood on
  // the ground this long (so brushing a ledge, a wall or a ceiling on the way doesn't end it)
  padSettleSec: 0.25,
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
  // the Wind-up Throw ("sniper" throw): on the ground only when you're not running (planar
  // speed up to this; you then slow-walk at windupWalkSpeed while it winds), or in the air on a
  // jetpack flight (the jetpack burned since you left the ground); never crouched or sliding
  windupMaxRunSpeed: 4,
  windupFov: 70,
  windupRange: 120,

  // Lethal Recall
  recallTelegraphSec: 0.3,
  recallSpeed: 80,
  recallKillRadius: 0.55,

  // Slash & deflect
  slashRange: 2.7, // melee remodel: +23 % reach (was 2.2)
  csSlashRange: 2.2, // CS modes keep the old knife reach (csConfig copies it into slashRange)
  slashConeDeg: 40,
  slashDamage: 34, // 3 slashes kill (100 HP)
  slashCooldownSec: 0.8,
  slashHitCooldownSec: 0.4,
  slashActiveSec: 0.12,
  slashLunge: 4,
  deflectRange: 2.2, // how far a slash reaches incoming Boomerangs / grenades (unchanged)
  deflectConeDeg: 20,

  // Teleport slash (sim/melee.ts; not in CS modes): hold E for teleportChargeSec, then let go
  // to dash teleportDistance metres straight ahead (along the floor, stopping at walls) with
  // the sword. Every enemy whose body centre line comes within teleportKillRadius of that
  // path dies (a round-start shield still soaks it). A tap of E is just the normal slash.
  teleportChargeSec: 1.0,
  teleportHoldSec: 2, // fully charged and still held this long: the charge fades (no cooldown)
  teleportTapSec: 0.15, // shorter holds are a plain slash: no slow-down, no charge glow/sound
  teleportChargeMoveScale: 0.6, // while charging you move at 60 % of sprint speed
  teleportDistance: 4.8, // +20 % (owner)
  teleportKillRadius: 0.8,
  teleportDamage: 200, // kills from full health
  teleportCooldownSec: 3, // from the moment it fires
  teleportExitSpeed: 4, // forward speed you keep after arriving
  teleportFriendlyFire: 0, // 1 = it also kills teammates on the line (off: anti-grief)

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

  // Gravity Grenade (sim/grenade.ts). Hold Q to charge, let go to throw; middle mouse picks how
  // many times it bounces before it goes off. No randomness anywhere: the same spot, view,
  // charge and bounce count always land on exactly the same spot (lineups).
  grenadeSpeed: 20, // throw speed at full charge (m/s)
  grenadeMinCharge: 0.3, // a quick tap throws this fraction of the full speed (a soft lob)
  grenadeChargeSec: 1, // holding Q this long reaches full speed
  grenadeUpTilt: 0.15, // the throw leaves a little above the crosshair (part of "up")
  grenadeInheritVel: 0.5, // share of your own speed the grenade takes with it
  grenadeBouncesDefault: 1, // bounce count before you change it with middle mouse
  grenadeMaxBounces: 3, // middle mouse cycles 0, 1, 2, 3, 0, ...
  grenadeRestitution: 0.55, // share of the speed into the surface it bounces back with
  grenadeBounceFriction: 0.75, // share of the speed along the surface kept on a bounce
  // a touch slower than this (into the surface) is rolling, not a bounce (doesn't count)
  grenadeBounceMinSpeed: 1.5,
  grenadeRollFriction: 0.9, // speed kept per tick while rolling / sliding
  grenadeRestSpeed: 0.8, // a rolling grenade slower than this has stopped: it goes off
  grenadeMaxFuseSec: 4, // goes off after this long in the air whatever happens
  grenadeRadius: 0.3,
  grenadeHitRadius: 0.45, // shootable hitbox
  grenadePullSec: 1.5,
  grenadePullRadius: 7,
  grenadePullAccel: 28,
  grenadeDamage: 40,
  grenadeDamageRadius: 5,
  grenadesPerRound: 1,
  // Lineup practice (practice only): 1 = a new grenade as soon as the last one is gone
  grenadeRefill: 0,

  // Remote mine (sim/mine.ts): one per player per round (per life in respawn modes), dropped
  // at your feet, set off from anywhere. Rooms switch it per mode (config/mine.ts).
  mineEnabled: 1,
  // Tower mode: no mines on the Towers (inside / on top of the touch volume). Set per mode.
  mineTowerBan: 1,
  mineRadius: 4, // everyone this close (to their body, in line of sight) is hit
  mineDamageFrac: 0.5, // of max health, flat inside the radius
  mineArmSec: 0.5, // can't be set off sooner than this after placing it
  mineSeeRadius: 6, // enemies are only sent / shown a mine this close (server culling)

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
