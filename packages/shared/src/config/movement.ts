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

  // Mag-boots
  magRange: 10,
  magPull: 22,

  // Dash (M3)
  dashSpeed: 16,
  dashCooldownSec: 3,
  dashDurationSec: 0.15,
} as const;

export type MovementConfig = { -readonly [K in keyof typeof MOVEMENT_DEFAULTS]: number };
