// CS mode guns (AK-47 + Desert Eagle): every number in one place, modeled on Counter-Strike.
//
// Inaccuracy values are in milliradians ("mrad") like the Counter-Strike weapon scripts, so they
// can be compared 1:1 (1 mrad = 0.0573°; 17.45 mrad = 1°). The numbers are the CS:GO / CS2 script
// values as closely as we know them (items_game / weapon script: spread, inaccuracy_stand,
// inaccuracy_crouch, inaccuracy_move, inaccuracy_jump, inaccuracy_land, inaccuracy_fire,
// recovery_time_stand / _crouch), rounded. Treat them as a faithful approximation, not a copy.
//
// How a shot's direction is built (sim/guns.ts), exactly like CS:
//   direction = view + spray pattern offset (fixed, learnable) + random cone
//   random cone radius = spread + inaccuracy, where
//     inaccuracy = stored penalty (stand / crouch / jump base + firing + landing, recovering
//                  over the recovery time) + moving (by horizontal speed, 34 %..95 % of max)
// The random point is picked like CS: random radius (0..1 × size) at a random angle, twice
// (once for the inaccuracy, once for the fixed spread) and added.

export const GUN_DEFAULTS = {
  // --- AK-47 (CS2: 36 dmg, 4× head, armor 77.5 %: 27 body / 111 head through armor) ---
  akMag: 30,
  akReserve: 90,
  akCycleSec: 0.1, // 600 RPM
  akReloadSec: 2.5, // CS2 2.43 s
  akBodyDamage: 27, // 4 body shots kill (100 HP)
  akHeadDamage: 110, // one head shot kills
  akLegDamage: 20, // CS legs ×0.75
  akRange: 200,
  akSpreadMrad: 0.6,
  akStandMrad: 6.41, // standing still: ~0.4° cone (spread + stand)
  akCrouchMrad: 4.81, // crouched still: ~0.31°
  akMoveMrad: 175, // at (95 % of) full speed: +10°
  akJumpMrad: 140, // in the air: +8° (plus moving: ~18° at full air speed)
  akLandMrad: 34, // landing: CS inaccuracy_land 0.242 × jump
  akFireMrad: 7.8, // added per shot (recovers like the rest)
  akRecoverStandSec: 0.43, // penalty falls to 10 % of its excess in this time
  akRecoverCrouchSec: 0.31,
  akSprayRecoverSec: 0.4, // spray index falls to 10 % in this time once you stop firing
  akPunchDeg: 0.35, // client: extra visual kick per shot (decays fast)

  // --- Desert Eagle (CS2: 53 dmg, 4× head, armor 93.2 %: 54 body with our 2-shot rule) ---
  deagleMag: 7,
  deagleReserve: 35,
  deagleCycleSec: 0.225, // 14 ticks at 60 Hz (0.233 s)
  deagleReloadSec: 2.2,
  deagleBodyDamage: 54, // 2 body shots kill
  deagleHeadDamage: 150, // one head shot kills
  deagleLegDamage: 40,
  deagleRange: 200,
  deagleSpreadMrad: 2,
  deagleStandMrad: 5.2,
  deagleCrouchMrad: 3.9,
  deagleMoveMrad: 110,
  deagleJumpMrad: 300,
  deagleLandMrad: 70,
  deagleFireMrad: 55, // a big per-shot penalty: spamming it is inaccurate
  deagleRecoverStandSec: 0.7,
  deagleRecoverCrouchSec: 0.55,
  deagleSprayRecoverSec: 0.7,
  deaglePunchDeg: 2.2,

  // --- shared ---
  // CS: moving inaccuracy starts above 34 % of the weapon's max speed and is full at 95 %
  // (our max = sprintSpeed). Below 34 % you're as accurate as standing: counter-strafe!
  gunAccurateSpeedFrac: 0.34,
  gunFullSpeedFrac: 0.95,
  gunDrawSec: 0.4, // switching guns: no shot until the new one is up
  gunViewTracking: 0.45, // client: how much of the spray the camera shows (CS view_recoil_tracking)
} as const;

/**
 * Spray patterns: per shot (index 0 = first shot), where the bullet goes relative to the
 * crosshair, in degrees: [pitch (+ = up), yaw (+ = right)]. The index advances by one per shot
 * and slides back toward 0 when you stop firing, so a pattern can be learned and pulled against
 * like in CS. Between entries the offset is interpolated (a half-recovered spray sits between).
 *
 * AK-47: modeled on CS2's AK — the first ~9 shots climb almost straight up (a hair right), then
 * it swings left (shots 11–16), right (19–25) and left again (26–30) with little more climb.
 */
export const AK_PATTERN: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.2, -0.05],
  [0.6, 0.05],
  [1.2, -0.1],
  [1.95, 0.1],
  [2.8, 0.2],
  [3.65, 0.15],
  [4.45, 0.05],
  [5.15, 0.2],
  [5.7, 0.35],
  [6.1, 0.05],
  [6.35, -0.5],
  [6.5, -1.1],
  [6.6, -1.65],
  [6.7, -2.05],
  [6.8, -2.25],
  [6.85, -2.1],
  [6.9, -1.6],
  [6.95, -0.85],
  [7.0, 0],
  [7.05, 0.85],
  [7.1, 1.6],
  [7.1, 2.2],
  [7.15, 2.5],
  [7.2, 2.45],
  [7.2, 2.05],
  [7.25, 1.45],
  [7.25, 0.8],
  [7.3, 0.3],
  [7.3, 0.1],
];

/** Desert Eagle: one big kick per shot that recovers slowly (fire again too soon: it's high). */
export const DEAGLE_PATTERN: readonly (readonly [number, number])[] = [
  [0, 0],
  [2.4, 0.3],
  [4.3, -0.2],
  [5.8, 0.4],
  [6.9, -0.3],
  [7.7, 0.2],
  [8.3, -0.1],
];

export type GunName = 'ak' | 'deagle';
/** `PlayerState.weapon` in CS mode: 0 = AK (key 1), 1 = Desert Eagle (key 2). */
export const GUN_BY_WEAPON: readonly GunName[] = ['ak', 'deagle'];
export const GUN_LABEL: Record<GunName, string> = { ak: 'AK-47', deagle: 'DEAGLE' };
export const GUN_PATTERN: Record<GunName, readonly (readonly [number, number])[]> = {
  ak: AK_PATTERN,
  deagle: DEAGLE_PATTERN,
};
