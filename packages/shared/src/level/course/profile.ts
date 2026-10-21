// The movement profile the surf maps are fitted to (docs/movement-map-design/movement-profile.md,
// measured in the real simulation by `npm run race:lab`). These are the key numbers a map is
// built from; tools/race/test/movement-profile.test.ts re-measures them, so a change to the
// movement physics fails that test until the version here is bumped and every surf map is
// checked again (their tests, timings and recovery states).

export const SURF_PROFILE = {
  version: 'MOVEMENT_PROFILE v1',
  /** standing collision height and width (m) */
  H: 1.8,
  W: 0.8,
  /** jump apex standing (m) */
  Z: 1.2,
  /** running jump at race sprint (12 m/s), no strafe, take-off to the same height (m) */
  J: 8.4,
  /** bunny hop at 16 m/s, steady strafing: metres per hop and speed gained per hop */
  B16: { perHop: 14.3, gain: 1.02 },
  /** reference surf speed: median on the reference chain, steady / human 0.6 (m/s) */
  V: 30.8,
  Vhuman: 30.2,
  /** face angles a steady rider holds at 20 and 30 m/s (degrees) */
  faces: [45, 75] as [number, number],
  /** holding Space re-jumps on landing (hold-to-bhop): not by default (RaceDef.holdToBhop: a map option) */
  holdToBhop: false,
  /**
   * design limits for curves (turn rate of the main line, degrees per second: radius ≥ speed /
   * rate). An assumption until human playtests — the physics (C(v) in the profile) allows far
   * tighter curves; turning the mouse smoothly is the human limit.
   */
  turnRate: { beginner: 60, intermediate: 90, optional: 120 },
  /** the clean-run target of a practiced player (seconds) */
  cleanRun: [165, 195] as [number, number],
} as const;
