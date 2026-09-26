// Combat: Boomerang (Quick / Wind-up / steer / catch / drop / clash / deflect / Lethal Recall),
// Slash, Laser and Gravity Grenade. Friendly fire is on for everything.
import type { Vec3 } from '../math/vec3';
import {
  v3,
  add,
  sub,
  scale,
  dot,
  len,
  lenSq,
  madd,
  normalize,
  clone,
  rotateAxis,
  rotateToward,
  lerp,
  cross,
} from '../math/vec3';
import { qForward, qRight, qUp } from '../math/quat';
import { closestSegSeg, closestPointSeg } from '../math/geom';
import { raycast, lineOfSight } from '../level/collision';
import type { SimContext } from './context';
import type { PlayerInput } from './input';
import { Btn } from './input';
import type { PlayerState, WorldState } from './state';
import type { BoomerangState, GrenadeState } from './combat-state';
import { Phase, Powerup } from './combat-state';
import type { KillKind } from './events';
import { eyePos, feetPos } from './movement';
import { gravityAt, gravityDirAt } from './gravity';
import { hitboxOf, sweepHitbox, rayHitbox, chestOf, type Hitbox } from './hitbox';
import { flatAim, tiltStep } from './flick';
import { loadoutOf } from '../config/loadout';
import { updateGuns } from './guns';

const DEG = Math.PI / 180;
const ticks = (sec: number, dt: number): number => Math.max(1, Math.round(sec / dt));

/** Hits that spend a Freeze charge (Boomerang, Laser, slash). */
const FREEZE_KINDS: ReadonlySet<KillKind> = new Set<KillKind>([
  'boomerang',
  'headshot',
  'windup',
  'recall',
  'deflect',
  'slash',
  'laser',
]);

/** What the round-start shield soaks up (everything but the Wind-up, the map and the bomb). */
const SHIELDED_KINDS: ReadonlySet<KillKind> = new Set<KillKind>([
  'boomerang',
  'headshot',
  'recall',
  'deflect',
  'slash',
  'laser',
  'grenade',
  'blast',
  'ak',
  'deagle',
]);

// ---------------------------------------------------------------------------------------------
// Damage

export const applyDamage = (
  world: WorldState,
  ctx: SimContext,
  attackerId: number,
  victim: PlayerState,
  damage: number,
  kind: KillKind,
  head: boolean,
  pos: Vec3,
  src: Vec3,
  throwId = 0,
): void => {
  if (!victim.alive || victim.frozen || damage <= 0) return;
  if (ctx.noDamage) {
    world.events.push({
      type: 'hit',
      attacker: attackerId,
      victim: victim.id,
      damage,
      head,
      kind,
      pos,
      src,
    });
    return;
  }
  const attacker = world.players.find((p) => p.id === attackerId);
  // round-start shield: the first hit breaks it and does nothing else (not the Wind-up, and
  // not the map / the bomb)
  if (victim.shield && SHIELDED_KINDS.has(kind) && attackerId !== victim.id) {
    victim.shield = false;
    victim.lastHurtTick = world.tick;
    victim.lastAttacker = attackerId;
    world.events.push({ type: 'shieldBreak', attacker: attackerId, victim: victim.id, pos });
    return;
  }
  victim.hp -= damage;
  victim.lastHurtTick = world.tick;
  victim.lastAttacker = attackerId;
  if (victim.windup > 0) cancelWindup(world, victim);
  const teamHit = !!attacker && attacker.id !== victim.id && attacker.team === victim.team;
  if (attacker && !teamHit && attacker.id !== victim.id)
    attacker.damageDealt += Math.min(damage, victim.hp + damage);
  world.events.push({
    type: 'hit',
    attacker: attackerId,
    victim: victim.id,
    damage,
    head,
    kind,
    pos,
    src,
  });
  if (victim.hp <= 0) {
    victim.hp = 0;
    victim.alive = false;
    victim.deaths++;
    victim.vel = v3();
    victim.stun = 0;
    victim.aiming = false;
    victim.laserWarn = 0;
    if (attacker && attacker.id !== victim.id) {
      if (teamHit) attacker.teamKills++;
      else attacker.kills++;
    }
    const b = world.boomerangs.find((bb) => bb.owner === victim.id);
    if (b && b.phase === Phase.Held) dropAt(b, victim.pos);
    world.events.push({
      type: 'kill',
      attacker: attackerId,
      victim: victim.id,
      kind,
      teamKill: teamHit,
      pos: clone(victim.pos),
      src,
      throwId,
    });
  } else if (
    attacker &&
    attacker.powerup === Powerup.Freeze &&
    attacker.powerupCharges > 0 &&
    attacker.team !== victim.team &&
    FREEZE_KINDS.has(kind)
  ) {
    // Freeze power-up: the hit (on an enemy who survives it) also freezes them. A new freeze
    // refreshes a running one, never stacking beyond freezeSec.
    victim.stun = Math.max(victim.stun, ticks(ctx.config.combat.freezeSec, ctx.dt));
    victim.aiming = false;
    victim.laserWarn = 0;
    if (--attacker.powerupCharges <= 0) {
      attacker.powerup = Powerup.None;
      attacker.powerupCharges = 0;
    }
    world.events.push({
      type: 'freeze',
      attacker: attacker.id,
      victim: victim.id,
      pos: clone(pos),
    });
  }
};

const cancelWindup = (world: WorldState, p: PlayerState): void => {
  p.windup = 0;
  p.windupHeld = 0;
  p.speedCap = 0;
  world.events.push({ type: 'windupCancel', player: p.id });
};

// ---------------------------------------------------------------------------------------------
// Boomerang helpers

export const handPos = (p: PlayerState, ctx: SimContext): Vec3 => {
  const eye = eyePos(p, ctx.config.movement);
  return add(
    add(madd(eye, qRight(p.view), 0.28), scale(qUp(p.view), -0.22)),
    scale(qForward(p.view), 0.35),
  );
};

const dropAt = (b: BoomerangState, pos: Vec3): void => {
  b.phase = Phase.Dropped;
  b.pos = clone(pos);
  b.vel = v3();
  b.t = 0;
  b.hitIds = [];
  b.controller = b.owner;
  b.windup = false;
};

/** Terminal speed (m/s) of a falling dropped Boomerang. */
const DROP_MAX_FALL = 30;

/**
 * A dropped Boomerang falls with gravity until it lands on something (it used to hang in the
 * air where it hit a wall). In zero-G it just floats where it is.
 */
const fallDropped = (b: BoomerangState, ctx: SimContext, world: WorldState): void => {
  const c = ctx.config.combat;
  const g = gravityAt(ctx, world, b.pos);
  const gl = len(g);
  if (gl < 1e-6) {
    b.vel = v3();
    return;
  }
  const down = scale(g, 1 / gl);
  const r = c.boomerangRadius * 0.5;
  // resting on a surface
  if (lenSq(b.vel) === 0 && raycast(ctx.level, b.pos, down, r + 0.05, r)) return;
  b.vel = madd(b.vel, g, ctx.dt);
  const speed = len(b.vel);
  if (speed > DROP_MAX_FALL) b.vel = scale(b.vel, DROP_MAX_FALL / speed);
  const sp = Math.min(speed, DROP_MAX_FALL);
  const dir = scale(b.vel, 1 / sp);
  const step = sp * ctx.dt;
  const hit = raycast(ctx.level, b.pos, dir, step, r);
  if (hit) {
    b.pos = madd(hit.point, hit.normal, r);
    b.vel = v3();
  } else b.pos = madd(b.pos, dir, step);
};

const toHeld = (b: BoomerangState): void => {
  b.phase = Phase.Held;
  b.vel = v3();
  b.t = 0;
  b.hitIds = [];
  b.controller = b.owner;
  b.windup = false;
  b.recallFrom = null;
  b.recallTo = null;
};

export const isFlying = (b: BoomerangState): boolean =>
  b.phase === Phase.Out ||
  b.phase === Phase.Return ||
  b.phase === Phase.Deflected ||
  b.phase === Phase.Recall;

/** Where the owner's crosshair points (first level hit along the view, or far away). */
export const aimPoint = (p: PlayerState, ctx: SimContext, maxDist = 150): Vec3 => {
  const eye = eyePos(p, ctx.config.movement);
  const fwd = qForward(p.view);
  const hit = raycast(ctx.level, eye, fwd, maxDist);
  return hit ? hit.point : madd(eye, fwd, maxDist);
};

export type FlightOutcome =
  | { kind: 'none' }
  | { kind: 'wall'; point: Vec3; normal: Vec3 }
  | { kind: 'bounce'; point: Vec3; normal: Vec3 }
  | { kind: 'catch' }
  | { kind: 'expire' };

export interface FlightEnv {
  ctx: SimContext;
  world: WorldState;
  ownerChest: Vec3 | null; // null = owner dead / absent
  steerTarget: Vec3 | null; // non-null while the owner is steering
}

/**
 * Advance one flying Boomerang (Out / Return / Deflected) by one tick. Pure with respect to
 * players: hits are handled by the caller using the returned segment. Shared with the preview.
 */
export const flightStep = (
  b: BoomerangState,
  env: FlightEnv,
): { from: Vec3; to: Vec3; outcome: FlightOutcome } => {
  const { ctx } = env;
  const c = ctx.config.combat;
  const dt = ctx.dt;
  const from = clone(b.pos);
  b.t++;
  let speed = len(b.vel);
  let dir = normalize(b.vel, v3(0, 0, -1));
  const gDir = gravityDirAt(ctx, env.world, b.pos);
  const def = ctx.level.def.defaultGravity;
  const special = gDir.x !== def.x || gDir.y !== def.y || gDir.z !== def.z;
  const gScale = special ? c.boomerangZoneGravityScale / c.boomerangGravityScale : 1;
  const g = scale(gDir, ctx.config.movement.gravity * gScale);

  if (b.phase === Phase.Out) {
    if (!b.windup) {
      if (env.steerTarget)
        dir = rotateToward(
          dir,
          normalize(sub(env.steerTarget, b.pos), dir),
          c.steerDegPerSec * DEG * dt,
        );
      if (b.curve !== 0)
        dir = normalize(rotateAxis(dir, b.curveAxis, -b.curve * c.quickCurveDegPerSec * DEG * dt));
      dir = normalize(madd(scale(dir, speed), g, c.boomerangGravityScale * dt), dir);
    }
    if (b.t >= b.outTicks) {
      b.phase = Phase.Return;
      b.t = 0;
      b.hitIds = [];
    }
  } else if (b.phase === Phase.Return) {
    speed = c.returnSpeed;
    if (env.steerTarget)
      dir = rotateToward(
        dir,
        normalize(sub(env.steerTarget, b.pos), dir),
        c.steerDegPerSec * DEG * dt,
      );
    else if (env.ownerChest) {
      const want = normalize(sub(env.ownerChest, b.pos), dir);
      const maxTurn = c.returnTurnDegPerSec * DEG * dt;
      if (dot(dir, want) < 0.5) {
        // big turn-back: swing round horizontally (around the thrower's up) like a boomerang,
        // continuing the throw's curve direction, instead of diving into the floor
        const axis = b.curveAxis;
        let sign = b.curve !== 0 ? -b.curve : Math.sign(dot(cross(dir, want), axis)) || 1;
        if (b.curve === 0 && Math.abs(dot(cross(dir, want), axis)) < 1e-3) sign = 1;
        dir = normalize(rotateAxis(dir, axis, sign * maxTurn));
      } else dir = rotateToward(dir, want, maxTurn);
    }
    dir = normalize(madd(scale(dir, speed), g, c.boomerangGravityScale * dt), dir);
  } else if (b.phase === Phase.Deflected) {
    dir = normalize(madd(scale(dir, speed), g, c.boomerangGravityScale * dt), dir);
  }
  b.vel = scale(dir, speed);
  const step = speed * dt;
  const hit = raycast(ctx.level, from, dir, step, c.boomerangRadius);
  if (hit) {
    // a Quick Throw's first wall: bounce off it like a real throw would and keep flying (bank
    // it around cover); the next wall drops it
    const canBounce =
      !b.bounced &&
      !b.windup &&
      !b.explosive && // an explosive throw goes off on the first wall instead
      (b.phase === Phase.Out || b.phase === Phase.Return);
    if (canBounce) {
      const point = madd(hit.point, hit.normal, c.boomerangRadius);
      const out = normalize(madd(dir, hit.normal, -2 * dot(dir, hit.normal)), hit.normal);
      b.bounced = true;
      b.pos = point;
      b.vel = scale(out, speed);
      return { from, to: point, outcome: { kind: 'bounce', point, normal: hit.normal } };
    }
    const point = madd(hit.point, hit.normal, c.boomerangRadius * 0.5);
    b.pos = point;
    return { from, to: point, outcome: { kind: 'wall', point, normal: hit.normal } };
  }
  b.pos = madd(from, dir, step);
  if (b.phase === Phase.Return && env.ownerChest) {
    const cp = closestPointSeg(env.ownerChest, from, b.pos);
    if (cp.distSq <= c.catchRadius * c.catchRadius)
      return { from, to: b.pos, outcome: { kind: 'catch' } };
  }
  if (b.phase !== Phase.Out && b.t > ticks(c.maxFlightSec, dt))
    return { from, to: b.pos, outcome: { kind: 'expire' } };
  if (b.phase === Phase.Return && !env.ownerChest)
    return { from, to: b.pos, outcome: { kind: 'expire' } };
  return { from, to: b.pos, outcome: { kind: 'none' } };
};

/** Initial state of a thrown Boomerang (shared by the real throw and the preview). */
export const throwState = (
  b: BoomerangState,
  p: PlayerState,
  ctx: SimContext,
  windup: boolean,
  curve: number,
): void => {
  const c = ctx.config.combat;
  const eye = eyePos(p, ctx.config.movement);
  const fwd = qForward(p.view);
  // start just in front of the eye, but never inside a wall
  const clear = raycast(ctx.level, eye, fwd, 0.6, c.boomerangRadius);
  b.pos = clear ? madd(eye, fwd, Math.max(0, clear.t - 0.05)) : madd(eye, fwd, 0.6);
  b.bounced = false;
  b.explosive = false;
  b.phase = Phase.Out;
  b.t = 0;
  b.windup = windup;
  b.curve = windup ? 0 : curve;
  b.curveAxis = clone(p.up);
  b.tiltRef = flatAim(p.view, p.up);
  const speed = windup ? c.windupSpeed : c.quickSpeed;
  b.vel = scale(fwd, speed);
  b.outTicks = windup ? ticks(c.windupRange / c.windupSpeed, ctx.dt) : ticks(c.quickOutSec, ctx.dt);
  b.steerLeft = windup ? 0 : ticks(c.steerSec, ctx.dt);
  b.hitIds = [];
  b.controller = p.id;
  b.recallFrom = null;
  b.recallTo = null;
};

export interface PathPrediction {
  points: Vec3[];
  end: 'wall' | 'catch' | 'expire' | 'open';
  wallPoint: Vec3 | null;
  teammatesOnPath: number[];
  enemiesOnPath: number[];
  /** Where a Quick Throw would bounce off its first wall, if it does. */
  bouncePoint: Vec3 | null;
  /** First enemy the path runs into (where they are expected to be by then), if any. */
  enemyHit: { id: number; index: number; point: Vec3; head: boolean } | null;
}

/** A hitbox moved by `off` (an enemy's expected position a moment from now). */
const shiftHitbox = (hb: Hitbox, off: Vec3): Hitbox => ({
  ...hb,
  head: add(hb.head, off),
  bodyA: add(hb.bodyA, off),
  bodyB: add(hb.bodyB, off),
});

/**
 * Predict a Quick Throw's full path (out, curve, return) with the same flight code as the real
 * throw. Assumes the thrower stays where they are. Used for the private preview line.
 * `leadSec`: enemies are checked where they will be if they keep their current velocity (for up
 * to this many seconds), so a path that meets a running enemy counts as on target.
 */
export const predictThrow = (
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
  curve: number,
  maxTicks = 200,
  from?: BoomerangState,
  steer = false,
  leadSec = 0,
): PathPrediction => {
  const b: BoomerangState = from
    ? JSON.parse(JSON.stringify(from))
    : {
        id: p.id,
        owner: p.id,
        controller: p.id,
        phase: Phase.Held,
        pos: v3(),
        vel: v3(),
        t: 0,
        outTicks: 0,
        curve: 0,
        curveAxis: v3(0, 1, 0),
        tiltRef: v3(0, 0, -1),
        windup: false,
        steerLeft: 0,
        hitIds: [],
        throwId: 0,
        recallFrom: null,
        recallTo: null,
      };
  if (!from) throwState(b, p, ctx, false, curve);
  const chest = chestOf(hitboxOf(p, ctx.config));
  const target = steer ? aimPoint(p, ctx) : null;
  const points: Vec3[] = [clone(b.pos)];
  const mates = new Set<number>();
  const foes = new Set<number>();
  let enemyHit: PathPrediction['enemyHit'] = null;
  let bouncePoint: Vec3 | null = null;
  const others = world.players.filter((o) => o.alive && o.id !== p.id);
  const mateHbs = others.filter((o) => o.team === p.team).map((o) => hitboxOf(o, ctx.config));
  const foes0 = others
    .filter((o) => o.team !== p.team)
    .map((o) => ({ hb: hitboxOf(o, ctx.config), vel: o.vel }));
  const r0 = ctx.config.combat.boomerangRadius;
  const result = (end: PathPrediction['end'], wallPoint: Vec3 | null): PathPrediction => ({
    points,
    end,
    wallPoint,
    teammatesOnPath: [...mates],
    enemiesOnPath: [...foes],
    enemyHit,
    bouncePoint,
  });
  for (let i = 0; i < maxTicks; i++) {
    const useSteer = !!target && b.steerLeft > 0;
    if (useSteer) b.steerLeft--;
    const r = flightStep(b, {
      ctx,
      world,
      ownerChest: chest,
      steerTarget: useSteer ? target : null,
    });
    points.push(clone(b.pos));
    for (const hb of mateHbs) if (sweepHitbox(r.from, r.to, r0, hb)) mates.add(hb.id);
    const lead = Math.min((i + 1) * ctx.dt, leadSec);
    for (const f of foes0) {
      if (foes.has(f.hb.id)) continue;
      const hb = lead > 0 ? shiftHitbox(f.hb, scale(f.vel, lead)) : f.hb;
      const hit = sweepHitbox(r.from, r.to, r0, hb);
      if (!hit) continue;
      foes.add(f.hb.id);
      if (!enemyHit)
        enemyHit = { id: f.hb.id, index: points.length - 1, point: hit.point, head: hit.head };
    }
    if (r.outcome.kind === 'bounce') bouncePoint = r.outcome.point;
    if (r.outcome.kind === 'wall') return result('wall', r.outcome.point);
    if (r.outcome.kind === 'catch') return result('catch', null);
    if (r.outcome.kind === 'expire') return result('expire', null);
  }
  return result('open', null);
};

/** Recall line: fixed at the moment R is pressed; lethal only if the whole path is open. */
export const recallLine = (
  b: BoomerangState,
  p: PlayerState,
  ctx: SimContext,
): { from: Vec3; to: Vec3; lethal: boolean } => {
  const to = chestOf(hitboxOf(p, ctx.config));
  const from = clone(b.pos);
  const lethal = lineOfSight(ctx.level, from, to);
  return { from, to, lethal };
};

// ---------------------------------------------------------------------------------------------
// Double boomerang: twins

/**
 * A Double-boomerang Quick Throw: next to the real Boomerang `b` (just thrown), a twin flies
 * the mirrored curve — or, for a straight throw, angled `twinStraightDeg` to the right. It
 * can't be caught, recalled or steered, and never returns (see updateTwins).
 */
export const throwTwin = (
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
  b: BoomerangState,
): BoomerangState => {
  const t: BoomerangState = {
    ...b,
    // an id the thrower's prediction gives it too (the tick and the owner, not a counter)
    id: world.tick * 256 + (p.id & 255),
    pos: clone(b.pos),
    vel: clone(b.vel),
    curve: b.curve === 0 ? 0 : -b.curve,
    curveAxis: clone(b.curveAxis),
    tiltRef: clone(b.tiltRef),
    explosive: false,
    steerLeft: 0,
    hitIds: [],
    recallFrom: null,
    recallTo: null,
  };
  if (b.curve === 0)
    t.vel = rotateAxis(b.vel, b.curveAxis, -ctx.config.combat.twinStraightDeg * DEG);
  world.twins.push(t);
  world.events.push({ type: 'twinThrow', player: p.id, twin: t.id });
  return t;
};

/** A twin's flight for one tick: like a Quick Throw's way out (one wall bounce), then gone. */
const updateTwins = (
  world: WorldState,
  ctx: SimContext,
  liveHitboxes: Hitbox[],
  only?: number,
): void => {
  const c = ctx.config.combat;
  let gone = false;
  for (const t of world.twins) {
    if (only !== undefined && t.owner !== only) continue;
    const res = flightStep(t, { ctx, world, ownerChest: null, steerTarget: null });
    // (the thrower's own twin never hits them; hits judged like the real Boomerang's)
    const targets = ctx.rewindHitboxes?.(t.controller) ?? liveHitboxes;
    const hits: { t: number; hb: Hitbox; head: boolean; point: Vec3 }[] = [];
    for (const hb of targets) {
      if (hb.id === t.controller || t.hitIds.includes(hb.id)) continue;
      const h = sweepHitbox(res.from, res.to, c.boomerangRadius, hb);
      if (h) hits.push({ t: h.t, hb, head: h.head, point: h.point });
    }
    hits.sort((x, y) => x.t - y.t || x.hb.id - y.hb.id);
    for (const h of hits) {
      t.hitIds.push(h.hb.id);
      const victim = world.players.find((q) => q.id === h.hb.id);
      if (!victim) continue;
      applyDamage(
        world,
        ctx,
        t.controller,
        victim,
        h.head ? c.quickHeadDamage : c.quickBodyDamage,
        h.head ? 'headshot' : 'boomerang',
        h.head,
        h.point,
        madd(res.from, normalize(t.vel), -2),
        t.throwId,
      );
    }
    const o = res.outcome;
    if (o.kind === 'bounce' && t.phase === Phase.Out) {
      world.events.push({ type: 'twinBounce', twin: t.id, pos: clone(o.point) });
      continue;
    }
    // its 2nd wall, or the end of its way out (flightStep turned it for home): gone
    if (o.kind === 'wall' || t.phase !== Phase.Out) {
      const wall = o.kind === 'wall' || o.kind === 'bounce';
      world.events.push({ type: 'twinEnd', twin: t.id, pos: clone(t.pos), wall });
      t.phase = Phase.Dropped;
      gone = true;
    }
  }
  if (gone) world.twins = world.twins.filter((t) => t.phase === Phase.Out);
};

// ---------------------------------------------------------------------------------------------
// Grenade

const activateGrenade = (world: WorldState, g: GrenadeState, shot: boolean): void => {
  if (g.phase !== 0) return;
  g.phase = 1;
  g.t = 0;
  g.vel = v3();
  world.events.push({ type: 'grenadeActivate', grenade: g.id, pos: clone(g.pos), shot });
};

const updateGrenades = (world: WorldState, ctx: SimContext, hbs: Hitbox[], only?: number): void => {
  const c = ctx.config.combat;
  const dt = ctx.dt;
  for (const g of world.grenades) {
    // Prediction: other players' grenades are simulated by the server (their state comes from
    // snapshots), but an active one still pulls *us* — predict that pull so it doesn't cause
    // corrections every snapshot.
    const foreign = only !== undefined && g.owner !== only;
    if (foreign && g.phase !== 1) continue;
    if (!foreign) g.t++;
    if (g.phase === 0) {
      g.vel = madd(g.vel, gravityAt(ctx, world, g.pos), dt);
      const speed = len(g.vel);
      const dir = normalize(g.vel);
      const hit = speed > 1e-6 ? raycast(ctx.level, g.pos, dir, speed * dt, c.grenadeRadius) : null;
      if (hit) {
        g.pos = madd(hit.point, hit.normal, 0.02);
        const vn = dot(g.vel, hit.normal);
        g.vel = scale(madd(g.vel, hit.normal, -2 * vn), 0.4); // bounce, lose energy
      } else g.pos = madd(g.pos, g.vel, dt);
      // touching a player (not the thrower) sets it off. (Judged where players are now, so a
      // predicting client only knows about touching itself.)
      for (const hb of hbs) {
        if (only !== undefined && hb.id !== only) continue;
        if (hb.id === g.owner && g.t < ticks(0.4, dt)) continue;
        if (sweepHitbox(g.pos, g.pos, c.grenadeRadius, hb)) {
          activateGrenade(world, g, false);
          break;
        }
      }
      if (g.phase === 0 && g.t >= ticks(c.grenadeFuseSec, dt)) activateGrenade(world, g, false);
    } else if (g.phase === 1) {
      // pull players toward the center
      for (const p of world.players) {
        if (!p.alive || (foreign && p.id !== only)) continue;
        const d = sub(g.pos, p.pos);
        const dist = len(d);
        if (dist > c.grenadePullRadius || dist < 0.3) continue;
        if (!lineOfSight(ctx.level, g.pos, p.pos)) continue;
        const k = 1 - dist / c.grenadePullRadius;
        p.vel = madd(p.vel, normalize(d), c.grenadePullAccel * (0.4 + 0.6 * k) * dt);
      }
      if (!foreign && g.t >= ticks(c.grenadePullSec, dt)) {
        g.phase = 2;
        world.events.push({ type: 'grenadePop', grenade: g.id, pos: clone(g.pos) });
        for (const p of world.players) {
          // (judged where players are now: a predicting client only knows its own position)
          if (!p.alive || (only !== undefined && p.id !== only)) continue;
          const dist = len(sub(p.pos, g.pos));
          if (dist > c.grenadeDamageRadius || !lineOfSight(ctx.level, g.pos, p.pos)) continue;
          const dmg = Math.round(c.grenadeDamage * (1 - (dist / c.grenadeDamageRadius) * 0.6));
          applyDamage(world, ctx, g.owner, p, dmg, 'grenade', false, clone(p.pos), clone(g.pos));
        }
      }
    }
  }
  world.grenades = world.grenades.filter((g) => g.phase !== 2);
};

/**
 * An explosive Quick Throw goes off at `at`: enemies of its controller within `blastRadius`
 * (in line of sight) take `blastDamage`, judged where they are now like a grenade's pop (a
 * predicting client only knows its own position, so prediction shows just the explosion).
 */
const detonate = (
  world: WorldState,
  ctx: SimContext,
  b: BoomerangState,
  at: Vec3,
  only: number | undefined,
): void => {
  const c = ctx.config.combat;
  b.explosive = false;
  const owner = world.players.find((p) => p.id === b.owner);
  if (owner) owner.blastCount = 0;
  world.events.push({ type: 'blast', player: b.controller, boomerang: b.id, pos: clone(at) });
  const team = world.players.find((p) => p.id === b.controller)?.team;
  for (const p of world.players) {
    if (!p.alive || p.id === b.controller || p.team === team) continue;
    if (only !== undefined && p.id !== only) continue;
    const chest = madd(p.pos, p.up, 0.2);
    if (len(sub(chest, at)) > c.blastRadius || !lineOfSight(ctx.level, at, chest)) continue;
    applyDamage(
      world,
      ctx,
      b.controller,
      p,
      c.blastDamage,
      'blast',
      false,
      clone(chest),
      clone(at),
      b.throwId,
    );
  }
};

// ---------------------------------------------------------------------------------------------
// Laser (hitscan). `hitboxes` may be rewound by the server for lag compensation.

const fireLaser = (
  world: WorldState,
  ctx: SimContext,
  p: PlayerState,
  hitboxes: Hitbox[],
): void => {
  const c = ctx.config.combat;
  const eye = eyePos(p, ctx.config.movement);
  const dir = qForward(p.view);
  const wall = raycast(ctx.level, eye, dir, c.laserRange);
  let best = wall ? wall.t : c.laserRange;
  let target:
    { kind: 'player'; hb: Hitbox; head: boolean } | { kind: 'grenade'; g: GrenadeState } | null =
    null;
  for (const hb of hitboxes) {
    if (hb.id === p.id) continue;
    const h = rayHitbox(eye, dir, best, hb);
    if (h && h.dist < best) {
      best = h.dist;
      target = { kind: 'player', hb, head: h.head };
    }
  }
  for (const g of world.grenades) {
    if (g.phase !== 0) continue;
    // shoot the grenade where the shooter saw it (their own is drawn where it is now)
    const gp = (g.owner !== p.id && ctx.rewindPos?.(p.id, 'grenade', g.id)) || g.pos;
    const cp = closestPointSeg(gp, eye, madd(eye, dir, best));
    if (cp.distSq <= c.grenadeHitRadius * c.grenadeHitRadius) {
      best = cp.t * best;
      target = { kind: 'grenade', g };
    }
  }
  const to = madd(eye, dir, best);
  let hitId = -1;
  if (target?.kind === 'player') {
    const victim = world.players.find((q) => q.id === target.hb.id);
    if (victim) {
      hitId = victim.id;
      applyDamage(
        world,
        ctx,
        p.id,
        victim,
        target.head ? c.laserHeadDamage : c.laserBodyDamage,
        'laser',
        target.head,
        to,
        eye,
      );
    }
  } else if (target?.kind === 'grenade') {
    target.g.pos = clone(to);
    activateGrenade(world, target.g, true);
  }
  world.events.push({ type: 'laserFire', player: p.id, from: eye, to, hit: hitId });
};

// ---------------------------------------------------------------------------------------------
// Main combat step

export interface CombatOptions {
  /** Prediction: only this player's actions, Boomerang and grenades are simulated. */
  only?: number;
}

export const updateCombat = (
  world: WorldState,
  ctx: SimContext,
  inputs: Record<number, PlayerInput>,
  prevButtons: Record<number, number> = {},
  opts: CombatOptions = {},
): void => {
  const only = opts.only;
  const c = ctx.config.combat;
  const dt = ctx.dt;
  const liveHitboxes = world.players.filter((p) => p.alive).map((p) => hitboxOf(p, ctx.config));

  // ---- Freeze power-up stun: counts down; stunned players can't act this tick ----
  const stunned = new Set<number>();
  for (const p of world.players) {
    if (only !== undefined && p.id !== only) continue;
    if (p.stun > 0) {
      p.stun--;
      if (!p.frozen) stunned.add(p.id);
    }
  }

  // ---- per-player actions ----
  for (const p of world.players) {
    if (only !== undefined && p.id !== only) continue;
    const input = inputs[p.id];
    const buttons = input?.buttons ?? 0;
    const prev = prevButtons[p.id] ?? 0;
    const pressed = buttons & ~prev;
    const released = prev & ~buttons;
    const b = world.boomerangs.find((bb) => bb.owner === p.id);
    if (p.slashCd > 0) p.slashCd--;
    if (p.slashTicks > 0) p.slashTicks--;
    if (p.laserCd > 0) p.laserCd--;
    if (p.laserReload > 0 && --p.laserReload === 0) {
      const take = Math.min(c.laserCharges - p.laserCharges, p.laserReserve);
      p.laserCharges += take;
      p.laserReserve -= take;
    }
    if (!p.alive || !b) {
      p.aiming = false;
      continue;
    }
    if (p.frozen) {
      p.aiming = false;
      continue;
    }
    if (stunned.has(p.id)) {
      // frozen by a Freeze hit: no throws, shots, slashes, grenades or weapon switches
      p.aiming = false;
      p.aimTicks = 0;
      p.laserWarn = 0;
      if (p.windup > 0) cancelWindup(world, p);
      continue;
    }
    const held = b.phase === Phase.Held;
    if (held) b.pos = handPos(p, ctx);
    // what this match's kit allows (CS mode: guns + slash only)
    const lo = loadoutOf(ctx.config);
    if (lo.guns) updateGuns(world, ctx, p, buttons, pressed, () => liveHitboxes);

    // --- weapon switch: 1 = Boomerang, 2 = Laser (CS mode: the guns handle 1 / 2) ---
    if (lo.guns) {
      // AK-47 / Desert Eagle (sim/guns.ts)
    } else if (pressed & Btn.Slot1 && p.weapon !== 0) {
      p.weapon = 0;
      p.laserReload = 0; // switching away cancels a reload
    } else if (pressed & Btn.Slot2 && p.weapon !== 1) {
      p.weapon = 1;
      if (p.windup > 0) cancelWindup(world, p);
      p.aiming = false;
      p.aimTicks = 0;
    }
    // the Boomerang in hand is only thrown while it's the chosen weapon
    const boomerangOut = held && p.weapon === 0 && lo.boomerang;
    // the Laser fires when chosen, and whenever the Boomerang is away
    const laserOut = lo.laser && (p.weapon === 1 || !held);

    // --- Wind-up Throw (hold RMB with the Boomerang in hand) ---
    if (p.windup > 0) {
      const cancel =
        !held ||
        !(buttons & Btn.Alt) ||
        pressed & (Btn.Jump | Btn.Dash) ||
        p.crouched ||
        !p.grounded ||
        p.move === 2; // sliding
      if (cancel) cancelWindup(world, p);
      else {
        const full = ticks(c.windupSec, dt);
        if (p.windup < full) {
          p.windup++;
          if (p.windup === full) world.events.push({ type: 'windupReady', player: p.id });
        } else if (++p.windupHeld > ticks(c.windupHoldSec, dt)) {
          cancelWindup(world, p); // wound down: start over
        }
        if (p.windup > 0) p.speedCap = c.windupWalkSpeed;
        if (p.windup >= full && pressed & Btn.Fire) {
          b.throwId = world.nextId++;
          throwState(b, p, ctx, true, 0);
          p.windup = 0;
          p.windupHeld = 0;
          p.speedCap = 0;
          world.events.push({ type: 'throw', player: p.id, boomerang: b.id, windup: true });
        }
      }
    } else if (boomerangOut && pressed & Btn.Alt && !p.aiming && p.grounded && !p.crouched) {
      p.windup = 1;
      p.speedCap = c.windupWalkSpeed;
      world.events.push({ type: 'windupStart', player: p.id });
    }

    // --- Quick Throw: hold LMB to aim, release to throw (straight); turning while it flies
    // out tilts it (see the flight update) ---
    if (boomerangOut && p.windup === 0) {
      if (buttons & Btn.Fire) {
        p.aiming = true;
        p.aimTicks++;
      } else if (released & Btn.Fire && p.aiming) {
        b.throwId = world.nextId++;
        throwState(b, p, ctx, false, 0);
        // every blastEvery-th throw explodes; the charge stays until one actually goes off
        if (p.blastCount >= c.blastEvery - 1) b.explosive = true;
        else p.blastCount++;
        p.aiming = false;
        p.aimTicks = 0;
        world.events.push({ type: 'throw', player: p.id, boomerang: b.id, windup: false });
        // Double boomerang power-up: this throw splits
        if (lo.powerups && p.powerup === Powerup.Double && p.powerupCharges > 0) {
          throwTwin(world, ctx, p, b);
          if (--p.powerupCharges <= 0) {
            p.powerup = Powerup.None;
            p.powerupCharges = 0;
          }
        }
      }
    }
    if (!(buttons & Btn.Fire) || !boomerangOut) {
      if (!boomerangOut) p.aiming = false;
      if (!(buttons & Btn.Fire)) {
        p.aiming = false;
        p.aimTicks = 0;
      }
    }

    // --- Laser: LMB while it's out (a warning line, then the shot) ---
    if (
      laserOut &&
      pressed & Btn.Fire &&
      p.laserWarn === 0 &&
      p.laserCd === 0 &&
      p.laserReload === 0 &&
      p.laserCharges > 0
    ) {
      p.laserCharges--;
      p.laserWarn = ticks(c.laserWarnSec, dt);
      p.laserCd = ticks(c.laserWarnSec + c.laserFireCdSec, dt);
      world.events.push({ type: 'laserWarn', player: p.id });
    }
    // reload: R while the Laser is chosen, or by itself when the magazine is empty
    const wantReload =
      (laserOut && p.weapon === 1 && pressed & Btn.Recall) || (laserOut && p.laserCharges === 0);
    if (
      wantReload &&
      p.laserReload === 0 &&
      p.laserWarn === 0 &&
      p.laserCharges < c.laserCharges &&
      p.laserReserve > 0
    ) {
      p.laserReload = ticks(c.laserReloadSec, dt);
      world.events.push({ type: 'laserReload', player: p.id });
    }
    if (p.laserWarn > 0 && --p.laserWarn === 0) {
      const boxes = ctx.rewindHitboxes?.(p.id) ?? liveHitboxes;
      fireLaser(world, ctx, p, boxes);
    }

    // --- Lethal Recall (R with the Boomerang chosen; with the Laser chosen R reloads) ---
    if (
      lo.boomerang &&
      pressed & Btn.Recall &&
      p.weapon === 0 &&
      (b.phase === Phase.Out ||
        b.phase === Phase.Return ||
        b.phase === Phase.Dropped ||
        b.phase === Phase.Deflected)
    ) {
      const line = recallLine(b, p, ctx);
      b.phase = Phase.RecallTelegraph;
      b.t = 0;
      b.vel = v3();
      b.controller = p.id;
      b.recallFrom = line.from;
      b.recallTo = line.to;
      b.recallLethal = line.lethal;
      b.hitIds = [];
      b.throwId = world.nextId++;
      world.events.push({
        type: 'recallStart',
        player: p.id,
        boomerang: b.id,
        from: line.from,
        to: line.to,
        lethal: line.lethal,
      });
    }

    // --- Pick up a dropped Boomerang by walking over it ---
    if (b.phase === Phase.Dropped && len(sub(b.pos, p.pos)) < c.pickupRadius + 0.6) {
      toHeld(b);
      world.events.push({ type: 'pickup', player: p.id, boomerang: b.id });
    }

    // --- Gravity Grenade ---
    if (lo.grenade && pressed & Btn.Grenade && p.grenadesLeft > 0) {
      p.grenadesLeft--;
      const eye = eyePos(p, ctx.config.movement);
      const fwd = qForward(p.view);
      const g: GrenadeState = {
        id: world.nextId++,
        owner: p.id,
        pos: madd(eye, fwd, 0.5),
        vel: add(scale(normalize(madd(fwd, p.up, 0.15)), c.grenadeSpeed), scale(p.vel, 0.5)),
        phase: 0,
        t: 0,
      };
      world.grenades.push(g);
      world.events.push({ type: 'grenadeThrow', player: p.id, grenade: g.id });
    }

    // --- Slash (E) with the Boomerang in hand ---
    if (pressed & Btn.Melee && p.slashCd === 0 && held && p.windup === 0) {
      p.slashTicks = ticks(c.slashActiveSec, dt);
      p.slashCd = ticks(c.slashCooldownSec, dt);
      p.slashHit = false;
      const fwdP = normalize(
        sub(qForward(p.view), scale(p.up, dot(qForward(p.view), p.up))),
        qForward(p.view),
      );
      p.vel = madd(p.vel, fwdP, c.slashLunge);
      world.events.push({ type: 'slash', player: p.id });
      // damage everyone in the cone once, at the start of the swing
      const eye = eyePos(p, ctx.config.movement);
      const fwd = qForward(p.view);
      const boxes = ctx.rewindHitboxes?.(p.id) ?? liveHitboxes;
      for (const hb of boxes) {
        if (hb.id === p.id) continue;
        const target = chestOf(hb);
        const to = sub(target, eye);
        const d = len(to);
        const near = Math.min(d, len(sub(hb.head, eye)));
        if (near > c.slashRange + hb.bodyR) continue;
        if (dot(normalize(to), fwd) < Math.cos(c.slashConeDeg * DEG) && near > 0.8) continue;
        if (!lineOfSight(ctx.level, eye, target)) continue;
        const victim = world.players.find((q) => q.id === hb.id);
        if (victim) {
          applyDamage(world, ctx, p.id, victim, c.slashDamage, 'slash', false, target, eye);
          p.slashHit = true;
        }
      }
      if (p.slashHit) p.slashCd = Math.min(p.slashCd, ticks(c.slashHitCooldownSec, dt));
    }
  }

  // ---- deflects: active slashes meeting incoming Boomerangs / grenades ----
  for (const p of world.players) {
    if (only !== undefined && p.id !== only) continue;
    if (!p.alive || p.slashTicks <= 0) continue;
    const eye = eyePos(p, ctx.config.movement);
    const fwd = qForward(p.view);
    const cosCone = Math.cos(c.deflectConeDeg * DEG);
    for (const b of world.boomerangs) {
      if (!isFlying(b) || b.controller === p.id) continue;
      // deflectable where it is now, or (lag compensation) where the slasher saw it. A client
      // predicting its own swing only knows where it saw someone else's Boomerang.
      const inCone = (pos: Vec3): boolean => {
        const d = sub(pos, eye);
        const dist = len(d);
        if (dist > c.slashRange + c.boomerangRadius || dist < 1e-6) return false;
        return dot(scale(d, 1 / dist), fwd) >= cosCone;
      };
      const remote = only !== undefined && b.owner !== only;
      if (remote || !inCone(b.pos)) {
        const seen = ctx.rewindPos?.(p.id, 'boomerang', b.id);
        if (!seen || !inCone(seen)) continue;
      }
      if (b.phase === Phase.Recall) {
        dropAt(b, madd(feetPos(p, ctx.config.movement), p.up, 0.2));
      } else {
        b.vel = scale(b.vel, -1);
        b.phase = Phase.Deflected;
        b.t = 0;
        b.controller = p.id;
        b.hitIds = [];
      }
      p.slashHit = true;
      p.slashCd = Math.min(p.slashCd, ticks(c.slashHitCooldownSec, dt));
      world.events.push({ type: 'deflect', player: p.id, boomerang: b.id, pos: clone(b.pos) });
    }
    for (const g of world.grenades) {
      if (g.phase !== 0) continue;
      // like deflects: where the grenade is now, or where the slasher saw it
      const reach = (pos: Vec3): boolean =>
        len(sub(pos, eye)) <= c.slashRange + c.grenadeHitRadius &&
        dot(normalize(sub(pos, eye)), fwd) >= Math.cos(c.slashConeDeg * DEG);
      const foreign = only !== undefined && g.owner !== only;
      const seen = g.owner !== p.id ? ctx.rewindPos?.(p.id, 'grenade', g.id) : null;
      if ((!foreign && reach(g.pos)) || (!!seen && reach(seen))) activateGrenade(world, g, true);
    }
  }

  // ---- Boomerang flight ----
  const segs = new Map<number, [Vec3, Vec3]>();
  for (const b of world.boomerangs) {
    if (only !== undefined && b.owner !== only) continue;
    const owner = world.players.find((q) => q.id === b.owner);
    if (b.phase === Phase.Held) {
      if (owner) b.pos = handPos(owner, ctx);
      continue;
    }
    if (b.phase === Phase.Dropped) {
      fallDropped(b, ctx, world);
      continue;
    }

    if (b.phase === Phase.RecallTelegraph) {
      if (++b.t >= ticks(c.recallTelegraphSec, dt)) {
        b.phase = Phase.Recall;
        b.t = 0;
        b.pos = clone(b.recallFrom ?? b.pos);
        world.events.push({ type: 'recallGo', player: b.owner, boomerang: b.id });
      }
      continue;
    }

    if (b.phase === Phase.Recall) {
      const from = b.recallFrom!;
      const to = b.recallTo!;
      const total = len(sub(to, from));
      b.t++;
      const prevPos = clone(b.pos);
      const traveled = Math.min(total, b.t * c.recallSpeed * dt);
      b.pos = total > 1e-6 ? lerp(from, to, traveled / total) : clone(to);
      b.vel = total > 1e-6 ? scale(normalize(sub(to, from)), c.recallSpeed) : v3();
      // lethal line: judged where players are *now* (the line is telegraphed so it can be
      // dodged), which a predicting client can't know: the server reports those kills
      if (b.recallLethal && only === undefined) {
        for (const hb of liveHitboxes) {
          if (hb.id === b.owner || b.hitIds.includes(hb.id)) continue;
          if (sweepHitbox(prevPos, b.pos, c.recallKillRadius, hb)) {
            b.hitIds.push(hb.id);
            const victim = world.players.find((q) => q.id === hb.id);
            if (victim)
              applyDamage(
                world,
                ctx,
                b.owner,
                victim,
                10000,
                'recall',
                false,
                clone(b.pos),
                clone(from),
                b.throwId,
              );
          }
        }
      }
      segs.set(b.id, [prevPos, clone(b.pos)]);
      if (traveled >= total - 1e-6) {
        if (owner && owner.alive) {
          toHeld(b);
          b.pos = handPos(owner, ctx);
          world.events.push({ type: 'catch', player: owner.id, boomerang: b.id });
        } else dropAt(b, b.pos);
      }
      continue;
    }

    // Out / Return / Deflected
    const ownerAlive = !!owner && owner.alive;
    const steering =
      ownerAlive &&
      b.controller === b.owner &&
      (b.phase === Phase.Out || b.phase === Phase.Return) &&
      b.steerLeft > 0 &&
      !stunned.has(b.owner) &&
      !!((inputs[b.owner]?.buttons ?? 0) & Btn.Alt);
    if (steering) b.steerLeft--;
    // tilt: on the way out, flicking the view left/right curves a Quick Throw that way
    // (RMB steering takes over while it's held)
    if (b.phase === Phase.Out && !b.windup) {
      const tilting = ownerAlive && b.controller === b.owner && !steering && !stunned.has(b.owner);
      b.curve = tilting ? tiltStep(owner!.view, b, c, ctx.dt) : 0;
    }
    const env: FlightEnv = {
      ctx,
      world,
      ownerChest:
        ownerAlive && b.phase === Phase.Return
          ? chestOf(hitboxOf(owner!, ctx.config))
          : ownerAlive
            ? chestOf(hitboxOf(owner!, ctx.config))
            : null,
      steerTarget: steering ? aimPoint(owner!, ctx) : null,
    };
    const res = flightStep(b, env);
    segs.set(b.id, [res.from, res.to]);

    // player hits along the swept segment (hits on the way out AND back). The thrower sees
    // their own Boomerang where it really is but everyone else a little in the past, so
    // (server) the targets are rewound to what the Boomerang's controller saw.
    const targets = ctx.rewindHitboxes?.(b.controller) ?? liveHitboxes;
    const hits: { t: number; hb: Hitbox; head: boolean; point: Vec3 }[] = [];
    for (const hb of targets) {
      if (b.hitIds.includes(hb.id)) continue;
      if (hb.id === b.controller) continue; // your own throw can't hit you (a deflected one can)
      if (hb.id === b.owner && b.phase === Phase.Return) continue; // owner catches instead
      const h = sweepHitbox(res.from, res.to, c.boomerangRadius, hb);
      if (h) hits.push({ t: h.t, hb, head: h.head, point: h.point });
    }
    hits.sort((x, y) => x.t - y.t || x.hb.id - y.hb.id);
    for (const h of hits) {
      b.hitIds.push(h.hb.id);
      const victim = world.players.find((q) => q.id === h.hb.id);
      if (!victim) continue;
      let dmg: number;
      let kind: KillKind;
      if (b.windup) {
        dmg = 10000;
        kind = 'windup';
      } else {
        dmg = h.head ? c.quickHeadDamage : c.quickBodyDamage;
        kind = b.phase === Phase.Deflected ? 'deflect' : h.head ? 'headshot' : 'boomerang';
      }
      applyDamage(
        world,
        ctx,
        b.controller,
        victim,
        dmg,
        kind,
        h.head,
        h.point,
        madd(res.from, normalize(b.vel), -2),
        b.throwId,
      );
      // an explosive throw goes off on the first player it hits
      if (b.explosive) detonate(world, ctx, b, h.point, only);
    }

    if (res.outcome.kind === 'bounce') {
      world.events.push({ type: 'wallBounce', boomerang: b.id, pos: clone(res.outcome.point) });
    } else if (res.outcome.kind === 'wall') {
      // (before dropAt: a deflected throw's blast is still the deflector's)
      if (b.explosive) detonate(world, ctx, b, res.outcome.point, only);
      dropAt(b, res.outcome.point);
      world.events.push({ type: 'wallHit', boomerang: b.id, pos: clone(res.outcome.point) });
    } else if (res.outcome.kind === 'catch' && owner) {
      toHeld(b);
      b.pos = handPos(owner, ctx);
      world.events.push({ type: 'catch', player: owner.id, boomerang: b.id });
    } else if (res.outcome.kind === 'expire') {
      dropAt(b, b.pos);
    }
  }

  // ---- clashes: two flying Boomerangs of different owners that meet both drop ----
  const flying =
    only !== undefined ? [] : world.boomerangs.filter((b) => segs.has(b.id) && isFlying(b));
  for (let i = 0; i < flying.length; i++)
    for (let j = i + 1; j < flying.length; j++) {
      const a = flying[i];
      const b = flying[j];
      if (a.owner === b.owner) continue;
      const [a0, a1] = segs.get(a.id)!;
      const [b0, b1] = segs.get(b.id)!;
      // closest approach of two points moving linearly over the tick
      const rel0 = sub(a0, b0);
      const relV = sub(sub(a1, a0), sub(b1, b0));
      const vv = dot(relV, relV);
      const t = vv > 1e-12 ? Math.max(0, Math.min(1, -dot(rel0, relV) / vv)) : 0;
      const dsq = lenSq(madd(rel0, relV, t));
      const rr = 2 * c.boomerangRadius;
      if (dsq <= rr * rr) {
        const at = lerp(lerp(a0, a1, t), lerp(b0, b1, t), 0.5);
        dropAt(a, at);
        dropAt(b, at);
        world.events.push({ type: 'clash', a: a.id, b: b.id, pos: at });
      }
    }

  updateTwins(world, ctx, liveHitboxes, only);
  updateGrenades(world, ctx, liveHitboxes, only);

  // unused helpers kept for tooling
  void closestSegSeg;
  void cross;
};
