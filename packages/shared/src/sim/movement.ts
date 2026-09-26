// Apex-style, gravity-aware character movement. All maths runs in the body frame (p.up), so
// every technique works on floors, walls and ceilings.
import type { Vec3 } from '../math/vec3';
import {
  v3,
  add,
  sub,
  scale,
  dot,
  cross,
  len,
  lenSq,
  madd,
  normalize,
  projectOnPlane,
  rotateToward,
  clone,
  lerp,
} from '../math/vec3';
import { qForward, qRight, qUp, qNormalize } from '../math/quat';
import { trackFlick } from './flick';
import type { Capsule } from '../level/collision';
import { capsuleContacts, capsuleOverlaps, depenetrate, nearestSurface } from '../level/collision';
import { railClosest, railPoint, railTangent } from '../level/level';
import { inSkyZone } from '../level/sky-arena';
import type { LevelDef } from '../level/types';
import type { MovementConfig } from '../config/movement';
import type { SimContext } from './context';
import type { PlayerInput } from './input';
import { Btn } from './input';
import type { PlayerState, WorldState } from './state';
import { Move } from './state';
import { gravityAt, isZeroG } from './gravity';

const DEG = Math.PI / 180;

/** The jetpack's numbers where you are: sped up in the sky duel (level/sky-arena.ts). */
export interface JetpackTuning {
  /** full tank, seconds of thrust */
  fuel: number;
  /** fuel refilled per second once the rest is over */
  refillPerSec: number;
  /** rest before the tank refills, seconds */
  delaySec: number;
  upAccel: number;
  maxRise: number;
  dirSpeed: number;
}

export const jetpackTuning = (m: MovementConfig, def: LevelDef, pos: Vec3): JetpackTuning => {
  const sky = inSkyZone(def, pos);
  const fuel = m.jetpackFuelSec * (sky ? m.skyJetpackFuelMul : 1);
  const rec = sky ? m.skyJetpackRechargeMul : 1;
  return {
    fuel,
    refillPerSec: (fuel / m.jetpackRechargeSec) * rec,
    delaySec: m.jetpackRechargeDelaySec / rec,
    upAccel: m.jetpackUpAccel * (sky ? m.skyJetpackUpMul : 1),
    maxRise: m.jetpackMaxRise * (sky ? m.skyJetpackRiseMul : 1),
    dirSpeed: m.jetpackDirSpeed * (sky ? m.skyJetpackDirMul : 1),
  };
};

export const bodyHeight = (p: PlayerState, m: MovementConfig): number =>
  p.crouched ? m.crouchHeight : m.standHeight;

export const capsuleOf = (p: PlayerState, m: MovementConfig, center: Vec3 = p.pos): Capsule => {
  const h = bodyHeight(p, m);
  return { center, up: p.up, halfSeg: Math.max(0, h / 2 - m.radius), radius: m.radius };
};

const standingCapsule = (p: PlayerState, m: MovementConfig, center: Vec3): Capsule => ({
  center,
  up: p.up,
  halfSeg: m.standHeight / 2 - m.radius,
  radius: m.radius,
});

/** Eye position (camera). */
export const eyePos = (p: PlayerState, m: MovementConfig): Vec3 => {
  const h = bodyHeight(p, m);
  const fromTop = p.crouched ? m.eyeFromTopCrouch : m.eyeFromTopStand;
  return madd(p.pos, p.up, h / 2 - fromTop);
};

/** Feet position (bottom of the capsule). */
export const feetPos = (p: PlayerState, m: MovementConfig): Vec3 =>
  madd(p.pos, p.up, -bodyHeight(p, m) / 2);

const planarOf = (v: Vec3, up: Vec3): Vec3 => projectOnPlane(v, up);

const accelerate = (
  vel: Vec3,
  wishDir: Vec3,
  wishSpeed: number,
  accel: number,
  dt: number,
): Vec3 => {
  const cur = dot(vel, wishDir);
  const addSpeed = wishSpeed - cur;
  if (addSpeed <= 0) return vel;
  const accelSpeed = Math.min(accel * dt * wishSpeed, addSpeed);
  return madd(vel, wishDir, accelSpeed);
};

const airAccelerate = (
  vel: Vec3,
  wishDir: Vec3,
  wishSpeed: number,
  cap: number,
  accel: number,
  dt: number,
): Vec3 => {
  const wishSpd = Math.min(wishSpeed, cap);
  const cur = dot(vel, wishDir);
  const addSpeed = wishSpd - cur;
  if (addSpeed <= 0) return vel;
  const accelSpeed = Math.min(accel * wishSpeed * dt, addSpeed);
  return madd(vel, wishDir, accelSpeed);
};

const applyFriction = (vel: Vec3, m: MovementConfig, dt: number): Vec3 => {
  const speed = len(vel);
  if (speed < 1e-4) return v3();
  const control = Math.max(speed, m.stopSpeed);
  const drop = control * m.friction * dt;
  const ns = Math.max(0, speed - drop);
  return scale(vel, ns / speed);
};

/** Keep the planar speed from rising above max(previous, cap). */
const softCap = (vel: Vec3, up: Vec3, prevPlanarSpeed: number, cap: number): Vec3 => {
  const planar = planarOf(vel, up);
  const s = len(planar);
  const limit = Math.max(prevPlanarSpeed, cap);
  if (s <= limit || s < 1e-6) return vel;
  return add(scale(planar, limit / s), scale(up, dot(vel, up)));
};

interface Wish {
  dir: Vec3; // planar unit wish direction (zero if no input)
  fb: number;
  lr: number;
  fwdP: Vec3;
  rightP: Vec3;
}

const computeWish = (p: PlayerState, buttons: number): Wish => {
  const fwd = qForward(p.view);
  let fwdP = projectOnPlane(fwd, p.up);
  if (lenSq(fwdP) < 1e-6) fwdP = projectOnPlane(qUp(p.view), p.up);
  fwdP = normalize(fwdP, v3(0, 0, -1));
  const rightP = normalize(cross(fwdP, p.up));
  const fb = (buttons & Btn.Forward ? 1 : 0) - (buttons & Btn.Back ? 1 : 0);
  const lr = (buttons & Btn.Right ? 1 : 0) - (buttons & Btn.Left ? 1 : 0);
  const dir = normalize(add(scale(fwdP, fb), scale(rightP, lr)));
  return { dir, fb, lr, fwdP, rightP };
};

export interface MoveResult {
  normals: Vec3[];
}

/** Sub-stepped move with depenetration and velocity clipping. */
export const moveAndCollide = (ctx: SimContext, p: PlayerState, dt: number): MoveResult => {
  const m = ctx.config.movement;
  const normals: Vec3[] = [];
  const dispLen = len(p.vel) * dt;
  const steps = Math.max(1, Math.ceil(dispLen / 0.2));
  const sdt = dt / steps;
  for (let i = 0; i < steps; i++) {
    const target = madd(p.pos, p.vel, sdt);
    const res = depenetrate(ctx.level, capsuleOf(p, m, target));
    p.pos = res.center;
    for (const n of res.normals) {
      const vn = dot(p.vel, n);
      if (vn < 0) p.vel = madd(p.vel, n, -vn);
      normals.push(n);
    }
  }
  return { normals };
};

const walkableCos = (m: MovementConfig): number => Math.cos(m.maxWalkableSlopeDeg * DEG);

/** Ground probe: best walkable normal touching the capsule's feet. */
const probeGround = (ctx: SimContext, p: PlayerState): Vec3 | null => {
  const m = ctx.config.movement;
  const contacts = capsuleContacts(ctx.level, capsuleOf(p, m), 0.06);
  let best: Vec3 | null = null;
  let bestDot = walkableCos(m);
  for (const c of contacts) {
    const d = dot(c.normal, p.up);
    if (d >= bestDot) {
      bestDot = d;
      best = c.normal;
    }
  }
  return best;
};

/** Try to change crouch state; standing up needs headroom. */
const setCrouch = (ctx: SimContext, p: PlayerState, crouch: boolean): boolean => {
  const m = ctx.config.movement;
  if (p.crouched === crouch) return true;
  const diff = (m.standHeight - m.crouchHeight) / 2;
  if (crouch) {
    // on the ground keep feet planted; in the air tuck legs (keep head)
    p.pos = madd(p.pos, p.up, p.grounded ? -diff : diff);
    p.crouched = true;
    return true;
  }
  const cands = p.grounded
    ? [madd(p.pos, p.up, diff)]
    : [madd(p.pos, p.up, -diff), madd(p.pos, p.up, diff)];
  for (const c of cands) {
    if (!capsuleOverlaps(ctx.level, standingCapsule(p, m, c))) {
      p.pos = c;
      p.crouched = false;
      return true;
    }
  }
  return false;
};

const resetAirCounters = (p: PlayerState, m: MovementConfig, dt: number): void => {
  p.wallJumpsLeft = m.wallJumpsPerAir;
  p.tapStrafesLeft = m.tapStrafesPerAir;
  p.climbLeft = Math.round(m.climbTimeSec / dt);
  p.lastWallNormal = null;
  p.airTicks = 0;
  p.tapWindow = 0;
};

const doJump = (
  world: WorldState,
  p: PlayerState,
  g: number,
  m: MovementConfig,
  dt: number,
): void => {
  // + g*dt/2 compensates the discrete integration so the apex matches jumpHeight
  const jumpSpeed = Math.sqrt(2 * g * m.jumpHeight) + (g * dt) / 2;
  if (p.landGrace > 0) {
    // bhop: a well-timed jump keeps almost all speed
    const planar = planarOf(p.vel, p.up);
    const vUp = dot(p.vel, p.up);
    p.vel = madd(scale(planar, 1 - m.bhopLandingLoss), p.up, vUp);
  }
  const vUp = dot(p.vel, p.up);
  p.vel = madd(p.vel, p.up, Math.max(jumpSpeed, vUp) - vUp);
  p.grounded = false;
  p.move = Move.Air;
  p.coyote = 0;
  p.jumpBuffer = 0;
  p.landGrace = 0;
  p.airTicks = 0;
  world.events.push({ type: 'jump', player: p.id });
};

/** Find a ledge in front of the player. Returns the standing center on the ledge and its height. */
const findLedge = (
  ctx: SimContext,
  p: PlayerState,
  dir: Vec3,
): { center: Vec3; height: number } | null => {
  const m = ctx.config.movement;
  const feet = feetPos(p, m);
  const step = 0.1;
  for (let h = m.stepHeight; h <= m.climbMaxHeight + 0.05; h += step) {
    // vertical clearance at the current spot, raised by h
    const raised = madd(feet, p.up, h + m.standHeight / 2 + 0.02);
    const cand = madd(raised, dir, m.radius * 2 + 0.15);
    if (capsuleOverlaps(ctx.level, standingCapsule(p, m, cand))) continue;
    if (capsuleOverlaps(ctx.level, standingCapsule(p, m, raised))) return null; // no headroom
    // drop onto the ledge surface
    const dropped = madd(cand, p.up, -(step + 0.05));
    const res = depenetrate(ctx.level, standingCapsule(p, m, dropped));
    const cosW = walkableCos(m);
    if (!res.normals.some((n) => dot(n, p.up) >= cosW)) return null; // nothing to stand on
    const height = dot(sub(res.center, feet), p.up) - m.standHeight / 2;
    if (height < m.stepHeight * 0.5) return null;
    return { center: res.center, height };
  }
  return null;
};

const startMantle = (
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
  target: Vec3,
  dir: Vec3,
): void => {
  const m = ctx.config.movement;
  if (p.crouched) {
    // mantle always ends standing (target was computed with a standing capsule)
    p.pos = madd(p.pos, p.up, (m.standHeight - m.crouchHeight) / 2);
    p.crouched = false;
  }
  const rise = dot(sub(target, p.pos), p.up);
  const mid = madd(p.pos, p.up, Math.max(0, rise));
  const planarSpeed = len(planarOf(p.vel, p.up));
  const exitSpeed = Math.max(m.vaultMinExitSpeed, planarSpeed * m.vaultSpeedKeep);
  p.mantle = {
    from: clone(p.pos),
    mid,
    to: target,
    t: 0,
    dur: Math.max(4, Math.round(m.vaultTimeSec / ctx.dt)),
    exitVel: scale(dir, exitSpeed),
  };
  p.move = Move.Mantle;
  p.vel = v3();
  world.events.push({ type: 'mantle', player: p.id });
};

const advanceMantle = (p: PlayerState): void => {
  const mt = p.mantle!;
  mt.t++;
  const f = Math.min(1, mt.t / mt.dur);
  const split = 0.6;
  p.pos =
    f < split ? lerp(mt.from, mt.mid, f / split) : lerp(mt.mid, mt.to, (f - split) / (1 - split));
  if (f >= 1) {
    p.pos = mt.to;
    p.vel = mt.exitVel;
    p.mantle = null;
    p.move = Move.Ground;
    p.grounded = true;
    p.landGrace = 2;
  }
};

const tryGrabRail = (world: WorldState, ctx: SimContext, p: PlayerState): boolean => {
  const m = ctx.config.movement;
  if (p.railCd > 0 || ctx.level.rails.length === 0) return false;
  const hand = madd(p.pos, p.up, m.railHang);
  for (let i = 0; i < ctx.level.rails.length; i++) {
    const rail = ctx.level.rails[i];
    const c = railClosest(rail, hand);
    if (c.dist > m.railGrabRadius) continue;
    const tan = railTangent(rail, c.s);
    const vAlong = dot(p.vel, tan);
    let dir: 1 | -1;
    if (Math.abs(vAlong) > 1) dir = vAlong > 0 ? 1 : -1;
    else dir = dot(qForward(p.view), tan) >= 0 ? 1 : -1;
    if ((dir === 1 && c.s >= rail.length - 0.5) || (dir === -1 && c.s <= 0.5)) continue;
    p.rail = { rail: i, s: c.s, dir, speed: Math.max(m.railSpeed, Math.abs(vAlong)) };
    p.move = Move.Rail;
    p.grounded = false;
    world.events.push({ type: 'railGrab', player: p.id });
    return true;
  }
  return false;
};

const releaseRail = (world: WorldState, ctx: SimContext, p: PlayerState): void => {
  p.rail = null;
  p.move = Move.Air;
  p.railCd = Math.round(ctx.config.movement.railCooldownSec / ctx.dt);
  resetAirCounters(p, ctx.config.movement, ctx.dt);
  world.events.push({ type: 'railRelease', player: p.id });
};

const advanceRail = (world: WorldState, ctx: SimContext, p: PlayerState, pressed: number): void => {
  const m = ctx.config.movement;
  const r = p.rail!;
  const rail = ctx.level.rails[r.rail];
  const tan = railTangent(rail, r.s);
  p.vel = scale(tan, r.dir * r.speed);
  if (pressed & Btn.Jump) {
    p.vel = madd(p.vel, p.up, m.railJumpUp);
    releaseRail(world, ctx, p);
    return;
  }
  if (pressed & Btn.Crouch) {
    releaseRail(world, ctx, p);
    return;
  }
  r.s += r.dir * r.speed * ctx.dt;
  if (r.s <= 0 || r.s >= rail.length) {
    r.s = Math.max(0, Math.min(rail.length, r.s));
    p.pos = madd(railPoint(rail, r.s), p.up, -m.railHang);
    releaseRail(world, ctx, p);
    return;
  }
  const target = madd(railPoint(rail, r.s), p.up, -m.railHang);
  // if the hang position is blocked (bad rail placement), let go
  if (capsuleOverlaps(ctx.level, capsuleOf(p, m, target), 0.05)) {
    releaseRail(world, ctx, p);
    return;
  }
  p.pos = target;
};

/** Nearby wall normal (roughly perpendicular to up) within `reach`, or null. */
const nearbyWall = (ctx: SimContext, p: PlayerState, reach: number): Vec3 | null => {
  const contacts = capsuleContacts(ctx.level, capsuleOf(p, ctx.config.movement), reach);
  let best: Vec3 | null = null;
  let bestDepth = -Infinity;
  for (const c of contacts) {
    if (Math.abs(dot(c.normal, p.up)) > 0.5) continue;
    if (c.depth > bestDepth) {
      bestDepth = c.depth;
      best = c.normal;
    }
  }
  return best ? normalize(projectOnPlane(best, p.up)) : null;
};

const nearbySurface = (ctx: SimContext, p: PlayerState, reach: number): Vec3 | null => {
  const contacts = capsuleContacts(ctx.level, capsuleOf(p, ctx.config.movement), reach);
  let best: Vec3 | null = null;
  let bestDepth = -Infinity;
  for (const c of contacts)
    if (c.depth > bestDepth) {
      bestDepth = c.depth;
      best = c.normal;
    }
  return best;
};

/** One tick of movement for one player. */
export const updateMovement = (
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
  input: PlayerInput,
): void => {
  const m = ctx.config.movement;
  const dt = ctx.dt;
  // Freeze power-up stun (sim/powerups.ts): no control at all, every button reads as released
  // (prevButtons keeps tracking the real ones, so nothing counts as a fresh press when it ends)
  const stunned = p.stun > 0 && !p.frozen;
  const rawButtons = input.buttons;
  const buttons = stunned ? 0 : rawButtons;
  const pressed = buttons & ~p.prevButtons;
  trackFlick(p, qNormalize(input.view), dt, ctx.config.combat);
  p.view = qNormalize(input.view);

  // timers
  if (p.coyote > 0) p.coyote--;
  if (p.jumpBuffer > 0) p.jumpBuffer--;
  if (p.landGrace > 0) p.landGrace--;
  if (p.slideBoostCd > 0) p.slideBoostCd--;
  if (p.railCd > 0) p.railCd--;
  if (p.dashCd > 0) p.dashCd--;
  if (p.tapWindow > 0) p.tapWindow--;
  if (p.thrusterCharges < m.thrusterCharges) {
    if (--p.thrusterRecharge <= 0) {
      p.thrusterCharges++;
      p.thrusterRecharge = Math.round(m.thrusterRechargeSec / dt);
    }
  } else p.thrusterRecharge = Math.round(m.thrusterRechargeSec / dt);
  // jetpack tank refills after a short rest (sped up in the sky duel)
  const jp = jetpackTuning(m, ctx.level.def, p.pos);
  if (!p.jetOn) {
    if (p.jetCd > 0) p.jetCd--;
    else p.jetFuel = Math.min(jp.fuel, p.jetFuel + jp.refillPerSec * dt);
  }

  // gravity & body orientation
  let g = gravityAt(ctx, world, p.pos);
  const zoneZeroG = isZeroG(g);
  const releaseMag = (): void => {
    p.mag = null;
    p.magT = 0;
    if (!zoneZeroG) p.magCd = Math.round(m.magCooldownSec / dt);
    world.events.push({ type: 'mag', player: p.id, on: false });
  };
  if (p.magCd > 0) p.magCd--;
  // gravity shift in normal gravity runs out after a while
  if (p.mag && !zoneZeroG && ++p.magT > Math.round(m.magMaxSec / dt)) releaseMag();
  if (pressed & Btn.MagBoots && !p.frozen) {
    if (p.mag) releaseMag();
    else if (zoneZeroG) {
      const s = nearestSurface(ctx.level, p.pos, m.magRange);
      if (s) {
        p.mag = s.normal;
        p.magT = 0;
        world.events.push({ type: 'mag', player: p.id, on: true });
      }
    } else if (p.magCd === 0) {
      // the nearest wall or ceiling close to your body, whichever way you face (not the floor
      // you're already standing on)
      const s = nearestSurface(
        ctx.level,
        p.pos,
        m.magNearRange + m.radius,
        (n) => dot(n, p.up) < 0.7,
      );
      if (s) {
        p.mag = s.normal;
        p.magT = 0;
        world.events.push({ type: 'mag', player: p.id, on: true });
      }
    }
  }
  if (p.mag) g = scale(p.mag, -m.magPull);
  p.gravity = g;
  const gMag = len(g);
  if (gMag > 1e-6) {
    const targetUp = scale(g, -1 / gMag);
    p.up = rotateToward(p.up, targetUp, m.upRotateDegPerSec * DEG * dt, qForward(p.view));
  }

  if (p.frozen) {
    p.vel = v3();
    p.prevButtons = rawButtons;
    return;
  }
  if (stunned) {
    // frozen solid: no speed of your own left, but gravity still pulls (you fall, you don't
    // hang in mid-air); off any zip-rail. In zero-G you simply stop where you are.
    if (p.rail) releaseRail(world, ctx, p);
    const gl = len(g);
    const gDir = gl > 1e-6 ? scale(g, 1 / gl) : null;
    p.vel = gDir ? scale(gDir, Math.max(0, dot(p.vel, gDir))) : v3();
    p.dashTicks = 0;
  }

  if (p.mantle) {
    advanceMantle(p);
    p.prevButtons = rawButtons;
    return;
  }
  if (p.rail) {
    advanceRail(world, ctx, p, pressed);
    p.prevButtons = rawButtons;
    return;
  }

  const wish = computeWish(p, buttons);
  const hasWish = lenSq(wish.dir) > 0.5;
  const crouchHeld = (buttons & Btn.Crouch) !== 0;

  // Dash: short burst in the movement direction (works in air and zero-G)
  if (pressed & Btn.Dash && p.dashCd === 0) {
    let dir: Vec3;
    if (zoneZeroG && !p.mag) {
      const f3 = qForward(p.view);
      const r3 = qRight(p.view);
      dir = normalize(add(scale(f3, wish.fb), scale(r3, wish.lr)), f3);
    } else dir = hasWish ? wish.dir : wish.fwdP;
    const along = dot(p.vel, dir);
    p.vel = madd(p.vel, dir, Math.max(0, m.dashSpeed - Math.max(0, along)));
    p.dashCd = Math.round(m.dashCooldownSec / dt);
    p.dashTicks = Math.round(m.dashDurationSec / dt);
    world.events.push({ type: 'dash', player: p.id });
  }
  if (p.dashTicks > 0) p.dashTicks--;
  if (p.grounded) {
    p.jetHold = -1;
    p.jetOn = false;
  }

  // ---------- zero-G float ----------
  if (gMag < 1e-6) {
    p.move = Move.Float;
    p.grounded = false;
    if (p.crouched) setCrouch(ctx, p, false);
    const f3 = qForward(p.view);
    const r3 = qRight(p.view);
    const wish3 = normalize(add(scale(f3, wish.fb), scale(r3, wish.lr)));
    p.vel = madd(p.vel, wish3, m.floatDriftAccel * dt);
    if (pressed & Btn.Jump) {
      const n = nearbySurface(ctx, p, m.pushOffReach);
      if (n) {
        let d = f3;
        const dn = dot(d, n);
        if (dn < 0.4) d = normalize(madd(d, n, 0.4 - dn));
        p.vel = scale(d, Math.max(m.pushOffSpeed, len(p.vel) * 0.5));
        world.events.push({ type: 'pushOff', player: p.id });
      } else if (p.thrusterCharges > 0) {
        const d = lenSq(wish3) > 0.5 ? wish3 : f3;
        p.vel = madd(p.vel, d, m.thrusterImpulse);
        p.thrusterCharges--;
        world.events.push({ type: 'thruster', player: p.id });
      }
    }
    const s = len(p.vel);
    if (s > m.maxFloatSpeed) p.vel = scale(p.vel, m.maxFloatSpeed / s);
    moveAndCollide(ctx, p, dt);
    p.prevButtons = rawButtons;
    return;
  }

  const wasGrounded = p.grounded;
  let jumped = false;
  const prevPlanarSpeed = len(planarOf(p.vel, p.up));

  // jump requests
  if (pressed & Btn.Jump) p.jumpBuffer = Math.round(m.jumpBufferSec / dt) + 1;

  if (p.grounded || p.coyote > 0) {
    if (p.jumpBuffer > 0 && (!p.crouched || p.move === Move.Slide || setCrouch(ctx, p, false))) {
      if (p.move === Move.Slide) setCrouch(ctx, p, false);
      if (p.mag) releaseMag(); // jumping off a gravity-shift surface lets go of it
      doJump(world, p, gMag, m, dt);
      jumped = true;
    }
  }

  if (p.grounded && !jumped) {
    const n = p.groundNormal;
    p.vel = projectOnPlane(p.vel, n);
    const speed = len(p.vel);

    // enter slide
    if (
      p.move !== Move.Slide &&
      crouchHeld &&
      speed >= m.slideStartSpeed &&
      (pressed & Btn.Crouch || p.landGrace > 0)
    ) {
      setCrouch(ctx, p, true);
      p.move = Move.Slide;
      let boosted = false;
      if (p.slideBoostCd === 0 && speed < m.slideBoostMaxSpeed) {
        const add = Math.min(m.slideBoost, m.slideBoostMaxSpeed - speed);
        p.vel = scale(p.vel, (speed + add) / speed);
        p.slideBoostCd = Math.round(m.slideBoostCooldownSec / dt);
        boosted = true;
      }
      world.events.push({ type: 'slide', player: p.id, boosted });
    }

    if (p.move === Move.Slide) {
      p.vel = add(p.vel, scale(projectOnPlane(g, n), dt)); // downhill gains speed
      const s = len(p.vel);
      if (s > 1e-4) p.vel = scale(p.vel, Math.max(0, s - m.slideDecel * dt) / s);
      if (hasWish) {
        const wishG = normalize(projectOnPlane(wish.dir, n));
        p.vel = airAccelerate(p.vel, wishG, m.sprintSpeed, m.slideSteerCap, m.slideSteerAccel, dt);
      }
      const s2 = len(p.vel);
      if (s2 > m.slideMaxSpeed) p.vel = scale(p.vel, m.slideMaxSpeed / s2);
      if (!crouchHeld) {
        if (setCrouch(ctx, p, false)) p.move = Move.Ground;
      } else if (s2 < m.slideEndSpeed) p.move = Move.Ground;
    } else {
      p.move = Move.Ground;
      if (crouchHeld) setCrouch(ctx, p, true);
      else if (p.crouched) setCrouch(ctx, p, false);
      // no friction during landing grace (bhop) or the dash burst
      if (p.landGrace === 0 && p.dashTicks === 0) p.vel = applyFriction(p.vel, m, dt);
      let wishSpeed = p.crouched ? m.crouchSpeed : wish.fb > 0 ? m.sprintSpeed : m.runSpeed;
      // on a slope, run faster along it so your pace across the map stays the same
      wishSpeed /= Math.max(0.7, dot(n, p.up));
      if (p.speedCap > 0) wishSpeed = Math.min(wishSpeed, p.speedCap);
      if (hasWish) {
        const wishG = normalize(projectOnPlane(wish.dir, n));
        p.vel = accelerate(p.vel, wishG, wishSpeed, m.groundAccel, dt);
      }
      if (p.speedCap > 0) {
        const s = len(p.vel);
        if (s > p.speedCap) p.vel = scale(p.vel, p.speedCap / s);
      }
    }
  } else if (!p.grounded) {
    // ---------- air ----------
    p.move = p.move === Move.Climb ? Move.Climb : Move.Air;
    p.airTicks++;
    // air crouch tucks legs
    if (crouchHeld && !p.crouched) setCrouch(ctx, p, true);
    else if (!crouchHeld && p.crouched) setCrouch(ctx, p, false);

    // wall-jump, or else the jetpack
    if (pressed & Btn.Jump && !jumped) {
      const wall = nearbyWall(ctx, p, m.wallJumpReach);
      const canWallJump =
        !!wall && p.wallJumpsLeft > 0 && (!p.lastWallNormal || dot(p.lastWallNormal, wall) < 0.9);
      if (!canWallJump) p.jetHold = 0; // arm: fires if Space stays down (see below)
      if (wall && canWallJump) {
        const planar = scale(projectOnPlane(planarOf(p.vel, p.up), wall), m.wallJumpSpeedKeep);
        p.vel = add(add(planar, scale(wall, m.wallJumpOut)), scale(p.up, m.wallJumpUp));
        p.wallJumpsLeft--;
        p.lastWallNormal = wall;
        p.jumpBuffer = 0;
        p.move = Move.Air;
        world.events.push({ type: 'wallJump', player: p.id });
      }
    }

    // jetpack: armed by a fresh Space press in the air, lights once Space has been held long
    // enough, and burns while Space stays down and there's fuel
    if (p.jetHold >= 0) {
      if (!(buttons & Btn.Jump) || p.jetFuel <= 0) p.jetHold = -1;
      else if (++p.jetHold >= Math.max(1, Math.round(m.jetpackHoldSec / dt))) {
        p.jetHold = -1;
        p.jetOn = true;
        const vUp = dot(p.vel, p.up);
        if (vUp < 0) p.vel = madd(p.vel, p.up, -vUp); // catch the fall
        p.jumpBuffer = 0; // the press was used up here, not as a jump on landing
        world.events.push({ type: 'jetpack', player: p.id });
      }
    }
    if (p.jetOn && (!(buttons & Btn.Jump) || p.jetFuel <= 0)) {
      p.jetOn = false;
      p.jetCd = Math.round(jp.delaySec / dt);
    }

    p.vel = madd(p.vel, g, dt);
    if (p.jetOn) {
      p.jetFuel = Math.max(0, p.jetFuel - dt);
      const vUp = dot(p.vel, p.up);
      const rise = Math.min(jp.upAccel * dt, Math.max(0, jp.maxRise - vUp));
      p.vel = madd(p.vel, p.up, rise);
      // steer freely in any direction (backwards too), up to the jetpack's own speed
      if (hasWish) {
        const planar = planarOf(p.vel, p.up);
        const want = scale(wish.dir, jp.dirSpeed);
        const diff = sub(want, planar);
        const dl = len(diff);
        const step = m.jetpackDirAccel * jp.dirSpeed * dt;
        if (dl > 1e-6) p.vel = madd(p.vel, diff, Math.min(1, step / dl));
      }
    }
    if (hasWish)
      p.vel = airAccelerate(p.vel, wish.dir, m.sprintSpeed, m.airWishCap, m.airAccel, dt);

    // tap-strafe (Apex-style): a quick fresh *forward* tap in the air gives a brief sharp
    // redirect toward the wish direction. Normal A/D air strafing is unaffected.
    if (pressed & Btn.Forward && p.tapStrafesLeft > 0 && prevPlanarSpeed >= m.tapStrafeMinSpeed) {
      p.tapWindow = Math.round(m.tapStrafeWindowSec / dt);
      p.tapStrafesLeft--;
      const planar = planarOf(p.vel, p.up);
      p.vel = madd(scale(planar, m.tapStrafeSpeedKeep), p.up, dot(p.vel, p.up));
    }
    if (p.tapWindow > 0 && hasWish) {
      const planar = planarOf(p.vel, p.up);
      const s = len(planar);
      if (s > 1e-3) {
        const d = rotateToward(scale(planar, 1 / s), wish.dir, m.tapStrafeTurnDegPerTick * DEG);
        p.vel = madd(scale(d, s), p.up, dot(p.vel, p.up));
      }
    }
    if (p.dashTicks === 0 && !p.jetOn) p.vel = softCap(p.vel, p.up, prevPlanarSpeed, m.airSoftCap);

    if (tryGrabRail(world, ctx, p)) {
      p.prevButtons = rawButtons;
      return;
    }
  }

  // global speed limit
  const total = len(p.vel);
  if (total > m.maxSpeed) p.vel = scale(p.vel, m.maxSpeed / total);

  // ---------- move ----------
  const prePos = clone(p.pos);
  const preVel = clone(p.vel);
  const res = moveAndCollide(ctx, p, dt);

  // step up small ledges when walking into them
  if (wasGrounded && !jumped && p.grounded) {
    const blocked = res.normals.some((n) => Math.abs(dot(n, p.up)) < 0.3);
    if (blocked) tryStepUp(ctx, p, prePos, preVel, dt);
  }

  // ground detection
  const vUp = dot(p.vel, p.up);
  // running up a ramp moves you upward too: if you were walking (not jumping), keep looking for
  // ground, or the slope would count as air and eat your speed
  let ground = vUp <= 1.0 || (wasGrounded && !jumped) ? probeGround(ctx, p) : null;
  if (
    !ground &&
    wasGrounded &&
    !jumped &&
    vUp <= 0.5 &&
    (p.move === Move.Ground || p.move === Move.Slide)
  ) {
    // snap down slopes / small drops
    const probe = madd(p.pos, p.up, -m.groundSnap);
    const r = depenetrate(ctx.level, capsuleOf(p, m, probe));
    const cosW = walkableCos(m);
    const n = r.normals.find((nn) => dot(nn, p.up) >= cosW);
    if (n) {
      p.pos = r.center;
      p.vel = projectOnPlane(p.vel, n);
      ground = n;
    }
  }

  if (ground) {
    if (!wasGrounded) {
      const impact = -dot(preVel, p.up);
      world.events.push({ type: 'land', player: p.id, speed: impact });
      p.landGrace = Math.max(1, Math.round(m.landGraceSec / dt));
      resetAirCounters(p, m, dt);
      p.move =
        crouchHeld && len(planarOf(p.vel, p.up)) >= m.slideStartSpeed ? Move.Ground : Move.Ground;
    }
    p.grounded = true;
    p.groundNormal = ground;
    p.vel = projectOnPlane(p.vel, ground);
  } else {
    if (wasGrounded && !jumped) p.coyote = Math.round(m.coyoteSec / dt);
    p.grounded = false;
    if (p.move === Move.Ground || p.move === Move.Slide) p.move = Move.Air;
  }

  // mantle / climb when pushing into a wall
  if (!p.grounded || res.normals.length > 0) {
    const walls = res.normals.filter((n) => Math.abs(dot(n, p.up)) < 0.35);
    if (walls.length > 0 && wish.fb > 0) {
      const wall = normalize(projectOnPlane(walls[0], p.up));
      const into = scale(wall, -1);
      if (dot(wish.dir, into) > 0.5) {
        const ledge = findLedge(ctx, p, into);
        const jumpHeld = (buttons & Btn.Jump) !== 0;
        if (ledge && ledge.height <= m.vaultMaxHeight) {
          startMantle(world, ctx, p, ledge.center, into);
        } else if (!p.grounded && jumpHeld && p.climbLeft > 0) {
          // wall-climb upward (toward a taller ledge or just up the wall)
          p.climbLeft--;
          p.move = Move.Climb;
          const vUpNow = dot(p.vel, p.up);
          p.vel = madd(scale(into, 0.5), p.up, Math.max(vUpNow, m.climbSpeed));
          if (ledge && ledge.height <= m.vaultMaxHeight + 0.3)
            startMantle(world, ctx, p, ledge.center, into);
        } else if (p.grounded && jumpHeld && ledge && ledge.height <= m.climbMaxHeight) {
          // standing at a tall ledge holding jump: hop into a climb
          doJump(world, p, gMag, m, dt);
          p.move = Move.Climb;
        }
      }
    }
  }
  if (p.move === Move.Climb && (p.grounded || !(buttons & Btn.Jump) || p.climbLeft <= 0)) {
    p.move = p.grounded ? Move.Ground : Move.Air;
  }

  p.prevButtons = rawButtons;
};

const tryStepUp = (
  ctx: SimContext,
  p: PlayerState,
  prePos: Vec3,
  preVel: Vec3,
  dt: number,
): void => {
  const m = ctx.config.movement;
  const planarVel = projectOnPlane(preVel, p.up);
  if (lenSq(planarVel) < 0.01) return;
  const raised = madd(prePos, p.up, m.stepHeight);
  if (capsuleOverlaps(ctx.level, capsuleOf(p, m, raised))) return;
  const moved = depenetrate(ctx.level, capsuleOf(p, m, madd(raised, planarVel, dt))).center;
  const down = depenetrate(ctx.level, capsuleOf(p, m, madd(moved, p.up, -(m.stepHeight + 0.05))));
  const cosW = walkableCos(m);
  if (!down.normals.some((n) => dot(n, p.up) >= cosW)) return;
  const gainedPlanar = len(projectOnPlane(sub(down.center, prePos), p.up));
  const normalPlanar = len(projectOnPlane(sub(p.pos, prePos), p.up));
  if (gainedPlanar > normalPlanar + 1e-3 && dot(sub(down.center, prePos), p.up) > 0.01) {
    p.pos = down.center;
    p.vel = planarVel;
  }
};
