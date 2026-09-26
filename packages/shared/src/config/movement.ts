// Every movement number in one place. Units: metres, seconds, m/s, m/s².
// The live tuning panel edits a copy of this object; "Copy values" exports it as JSON.

export const MOVEMENT_DEFAULTS = {
  // Body
  radius: 0.4,
  standHeight: 1.8,
  crouchHeight: 1.1,
  eyeFromTopStand: 0.2,
  eyeFromTopCrouch: 0.15,
  stepHeight: 0.4,
  maxWalkableSlopeDeg: 50,
  groundSnap: 0.3,

  // Gravity
  gravity: 20,
  upRotateDegPerSec: 600,

  // Ground
  sprintSpeed: 9,
  runSpeed: 6.5,
  crouchSpeed: 3.5,
  groundAccel: 10,
  friction: 6,
  stopSpeed: 2,

  // Jump & bhop
  jumpHeight: 1.2,
  jumpBufferSec: 0.1,
  coyoteSec: 0.1,
  landGraceSec: 0.05,
  bhopLandingLoss: 0.02,

  // Air
  airAccel: 10,
  airWishCap: 0.75,
  airSoftCap: 15,
  maxSpeed: 30,

  // Tap-strafe: fresh strafe press in the air = brief sharp redirect
  tapStrafeMinSpeed: 6,
  tapStrafeWindowSec: 0.08,
  tapStrafeTurnDegPerTick: 12,
  tapStrafeSpeedKeep: 0.94,
  tapStrafesPerAir: 2,

  // Slide
  slideStartSpeed: 7,
  slideEndSpeed: 4,
  slideBoost: 3,
  slideBoostMaxSpeed: 13,
  slideBoostCooldownSec: 2,
  slideDecel: 2.5,
  slideSteerAccel: 8,
  slideSteerCap: 1.5,
  slideMaxSpeed: 20,

  // Mantle / climb
  vaultMaxHeight: 1.25,
  climbMaxHeight: 2.6,
  vaultTimeSec: 0.22,
  vaultSpeedKeep: 0.85,
  vaultMinExitSpeed: 4,
  climbSpeed: 6,
  climbTimeSec: 0.5,

  // Wall-jump
  wallJumpReach: 0.35,
  wallJumpOut: 6,
  wallJumpUp: 6.5,
  wallJumpSpeedKeep: 0.9,
  wallJumpsPerAir: 2,

  // Zip-rail
  railGrabRadius: 1.0,
  railSpeed: 16,
  railHang: 1.1,
  railJumpUp: 5,
  railCooldownSec: 0.4,

  // Zero-G
  floatDriftAccel: 0.8,
  pushOffSpeed: 9,
  pushOffReach: 0.4,
  thrusterImpulse: 6,
  thrusterCharges: 3,
  thrusterRechargeSec: 2.5,
  maxFloatSpeed: 20,

  // Jetpack (everyone, in normal gravity): press and *hold* Space in the air (with no wall to
  // jump off) to fly. While it burns you rise and steer freely with WASD, backwards too.
  // Holding is required so mouse-wheel jump taps (bunny hops) never start it.
  jetpackHoldSec: 0.1,
  jetpackFuelSec: 0.8, // thrust time on a full tank
  jetpackUpAccel: 34, // m/s² along your up (gravity is ~20: a gentle climb)
  jetpackMaxRise: 7, // m/s: no rocketing to the ceiling
  jetpackDirAccel: 3, // how fast you reach the steering speed (× speed per second)
  jetpackDirSpeed: 12, // m/s you can steer to in any direction while it burns
  jetpackRechargeDelaySec: 0.6, // rest before the tank starts refilling
  jetpackRechargeSec: 2.5, // empty → full
  // Sky duel overtime (up at the floating arena, level/sky-arena.ts): a sped-up jetpack
  skyJetpackFuelMul: 3, // bigger tank
  skyJetpackRechargeMul: 2.5, // refills this many times faster (and after half the rest)
  skyJetpackUpMul: 1.6, // stronger up-thrust
  skyJetpackRiseMul: 1.6, // higher climb speed limit
  skyJetpackDirMul: 1.5, // faster steering speed

  // Mag-boots
  magRange: 10, // zero-G: reach for the nearest surface
  magPull: 22,
  // Gravity shift (F) in normal gravity: stick to the nearest wall or ceiling within reach of
  // your body (you don't have to face it); F again, a jump, or the time limit lets go
  magNearRange: 2.5,
  magMaxSec: 10,
  magCooldownSec: 2,

  // Dash (M3)
  dashSpeed: 16,
  dashCooldownSec: 3,
  dashDurationSec: 0.15,
} as const;

export type MovementConfig = { -readonly [K in keyof typeof MOVEMENT_DEFAULTS]: number };
