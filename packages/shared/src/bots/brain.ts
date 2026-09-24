// Bot brains: produce a PlayerInput each tick from what the bot can perceive.
// Bots use the real movement (sprint, slide-hop, air strafe, dash) and the full kit, so
// balance tests measure accuracy against fast movement, not standing dummies.
// Deterministic: each bot has its own seeded RNG.
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
  projectOnPlane,
  cross,
  rotateToward,
  angleBetween,
  clone,
} from '../math/vec3';
import type { Quat } from '../math/quat';
import { qForward, qFromBasis } from '../math/quat';
import type { RngState } from '../math/rng';
import { rngFromSeed, rngFloat, rngInt } from '../math/rng';
import { lineOfSight, raycast } from '../level/collision';
import type { SimContext } from '../sim/context';
import type { PlayerInput } from '../sim/input';
import { Btn } from '../sim/input';
import type { PlayerState, WorldState } from '../sim/state';
import { Move } from '../sim/state';
import { Phase } from '../sim/combat-state';
import { eyePos } from '../sim/movement';
import { hitboxOf, chestOf } from '../sim/hitbox';
import { isFlying, recallLine } from '../sim/combat';

const DEG = Math.PI / 180;

export interface BotSkill {
  name: 'easy' | 'normal' | 'hard';
  reactionTicks: number; // before engaging a newly seen target
  aimErrorDeg: number; // random aim wobble
  turnDegPerTick: number; // max view turn speed
  leadAccuracy: number; // 0..1 how well it leads moving targets
  deflectChance: number; // chance to attempt a deflect on a close incoming Boomerang
  dodgeChance: number; // chance to dash/jump away from threats
  throwInterval: [number, number]; // ticks between throws
  laserChance: number; // per tick when the Boomerang is away
  slideHop: boolean;
  windupChance: number; // per decision when far from target
  recallSkill: number; // chance to notice a recall line through an enemy
}

export const BOT_SKILLS: Record<BotSkill['name'], BotSkill> = {
  easy: {
    name: 'easy',
    reactionTicks: 30,
    aimErrorDeg: 4.5,
    turnDegPerTick: 5,
    leadAccuracy: 0.4,
    deflectChance: 0.02,
    dodgeChance: 0.15,
    throwInterval: [60, 120],
    laserChance: 0.02,
    slideHop: false,
    windupChance: 0.002,
    recallSkill: 0.2,
  },
  normal: {
    name: 'normal',
    reactionTicks: 16,
    aimErrorDeg: 2.4,
    turnDegPerTick: 9,
    leadAccuracy: 0.75,
    deflectChance: 0.08,
    dodgeChance: 0.35,
    throwInterval: [35, 80],
    laserChance: 0.04,
    slideHop: true,
    windupChance: 0.004,
    recallSkill: 0.5,
  },
  hard: {
    name: 'hard',
    reactionTicks: 8,
    aimErrorDeg: 1.2,
    turnDegPerTick: 14,
    leadAccuracy: 0.95,
    deflectChance: 0.18,
    dodgeChance: 0.6,
    throwInterval: [25, 60],
    laserChance: 0.06,
    slideHop: true,
    windupChance: 0.006,
    recallSkill: 0.85,
  },
};

export interface BotMemory {
  id: number;
  skill: BotSkill;
  rng: RngState;
  target: number | null;
  targetSeenTick: number;
  engageTick: number; // tick when the current target was first seen
  strafeDir: 1 | -1;
  strafeUntil: number;
  throwPhase: number; // >0 while holding LMB
  nextThrowTick: number;
  aimErr: Vec3; // current aim wobble offset (unit-ish)
  aimErrUntil: number;
  goal: Vec3 | null;
  goalUntil: number;
  stuckTicks: number;
  lastPos: Vec3;
  slideTick: number;
  windupActive: boolean;
  deflecting: number; // ticks left holding a deflect look
  jumpCooldown: number;
  /** optional objective: where the bot wants to go when it has no target */
  objective: Vec3 | null;
  /** optional path waypoints (M7) */
  path: Vec3[];
}

export const createBotMemory = (id: number, skill: BotSkill, seed: number): BotMemory => ({
  id,
  skill,
  rng: rngFromSeed(seed * 7919 + id * 104729),
  target: null,
  targetSeenTick: -1000,
  engageTick: 0,
  strafeDir: 1,
  strafeUntil: 0,
  throwPhase: 0,
  nextThrowTick: 30,
  aimErr: v3(),
  aimErrUntil: 0,
  goal: null,
  goalUntil: 0,
  stuckTicks: 0,
  lastPos: v3(),
  slideTick: -1000,
  windupActive: false,
  deflecting: 0,
  jumpCooldown: 0,
  objective: null,
  path: [],
});

const range = (rng: RngState, [a, b]: [number, number]): number =>
  a + rngInt(rng, Math.max(1, b - a + 1));

/** Turn the current view toward a desired direction, at most `maxDeg`, keeping the body's up. */
const turnView = (view: Quat, desired: Vec3, up: Vec3, maxDeg: number): Quat => {
  const fwd = qForward(view);
  const next = rotateToward(fwd, normalize(desired, fwd), maxDeg * DEG);
  // avoid degenerate up (looking straight along it)
  let u = up;
  if (Math.abs(dot(next, u)) > 0.995) u = normalize(cross(cross(next, up), next), up);
  return qFromBasis(next, normalize(projectOnPlane(u, next), up));
};

/** Movement buttons that best approximate a desired planar direction relative to the view. */
const moveButtons = (view: Quat, up: Vec3, desired: Vec3): number => {
  if (lenSq(desired) < 1e-6) return 0;
  const fwd = normalize(projectOnPlane(qForward(view), up), v3(0, 0, -1));
  const right = normalize(cross(fwd, up));
  const d = normalize(projectOnPlane(desired, up));
  const f = dot(d, fwd);
  const r = dot(d, right);
  let b = 0;
  if (f > 0.38) b |= Btn.Forward;
  else if (f < -0.38) b |= Btn.Back;
  if (r > 0.38) b |= Btn.Right;
  else if (r < -0.38) b |= Btn.Left;
  return b;
};

/** Pick a wander goal: level areas, spawns and waypoints. */
const pickGoal = (ctx: SimContext, mem: BotMemory): Vec3 => {
  const def = ctx.level.def;
  const pts: Vec3[] = [
    ...(def.waypoints ?? []).map((w) => w.pos),
    ...(def.areas ?? []).map((a) => a.pos),
    ...def.spawns.map((s) => s.pos),
  ];
  return clone(pts[rngInt(mem.rng, pts.length)] ?? v3());
};

export const botThink = (
  world: WorldState,
  ctx: SimContext,
  self: PlayerState,
  mem: BotMemory,
): PlayerInput => {
  const tick = world.tick + 1;
  const s = mem.skill;
  const rng = mem.rng;
  const c = ctx.config.combat;
  if (!self.alive || self.frozen) return { tick, buttons: 0, view: self.view };

  const eye = eyePos(self, ctx.config.movement);
  const up = self.up;
  let buttons = 0;
  let view = self.view;
  const myB = world.boomerangs.find((b) => b.owner === self.id);

  // ---------------- perception ----------------
  const enemies = world.players.filter((p) => p.alive && p.team !== self.team && p.id !== self.id);
  const visible = enemies.filter((p) => {
    const hb = hitboxOf(p, ctx.config);
    return (
      len(sub(p.pos, self.pos)) < 120 &&
      (lineOfSight(ctx.level, eye, hb.head) || lineOfSight(ctx.level, eye, chestOf(hb)))
    );
  });
  let target = mem.target !== null ? enemies.find((p) => p.id === mem.target) : undefined;
  const targetVisible = !!target && visible.includes(target);
  if (targetVisible) mem.targetSeenTick = tick;
  if (!target || (!targetVisible && tick - mem.targetSeenTick > 120)) {
    target = undefined;
    mem.target = null;
    let best = Infinity;
    for (const p of visible) {
      const d = len(sub(p.pos, self.pos));
      if (d < best) {
        best = d;
        target = p;
      }
    }
    if (target) {
      mem.target = target.id;
      mem.targetSeenTick = tick;
      mem.engageTick = tick;
    }
  }
  const engaged = !!target && tick - mem.engageTick >= s.reactionTicks;

  // ---------------- threats ----------------
  let threat: Vec3 | null = null; // direction of the incoming threat
  let deflectTarget: Vec3 | null = null;
  for (const b of world.boomerangs) {
    const ctrl = world.players.find((p) => p.id === b.controller);
    if (!ctrl || ctrl.team === self.team || !isFlying(b)) continue;
    const rel = sub(eye, b.pos);
    const closing = dot(normalize(b.vel), normalize(rel));
    const d = len(rel);
    if (closing > 0.9 && d < 14) {
      threat = normalize(rel);
      if (d < 3.2 && d > 1.2 && myB?.phase === Phase.Held) deflectTarget = b.pos;
    }
    if (b.phase === Phase.RecallTelegraph && b.recallLethal && b.recallFrom && b.recallTo) {
      const seg = sub(b.recallTo, b.recallFrom);
      const t = Math.max(
        0,
        Math.min(1, dot(sub(self.pos, b.recallFrom), seg) / Math.max(1e-6, dot(seg, seg))),
      );
      const closest = madd(b.recallFrom, seg, t);
      if (len(sub(closest, self.pos)) < 1.5) threat = normalize(sub(self.pos, closest));
    }
  }
  for (const p of enemies) {
    if (p.laserWarn > 0 && visible.includes(p)) {
      const toMe = normalize(sub(eye, eyePos(p, ctx.config.movement)));
      if (dot(qForward(p.view), toMe) > 0.97) threat = toMe;
    }
  }

  // ---------------- movement ----------------
  let moveDir: Vec3;
  const planarTo = (p: Vec3) => projectOnPlane(sub(p, self.pos), up);
  if (target && (targetVisible || tick - mem.targetSeenTick < 120)) {
    const to = planarTo(target.pos);
    const dist = len(to);
    const toN = normalize(to);
    const side = normalize(cross(up, toN));
    if (tick >= mem.strafeUntil) {
      mem.strafeDir = rngFloat(rng) < 0.5 ? 1 : -1;
      mem.strafeUntil = tick + 25 + rngInt(rng, 60);
    }
    let approach = 0;
    if (dist > 20) approach = 1;
    else if (dist < 7 && myB?.phase !== Phase.Held) approach = -0.6;
    else if (dist < 4) approach = myB?.phase === Phase.Held ? 0.6 : -1; // slash range
    moveDir = add(scale(toN, approach), scale(side, mem.strafeDir));
  } else {
    // wander / objective
    const goal = mem.objective ?? mem.goal;
    if (!goal || tick > mem.goalUntil || len(planarTo(goal)) < 3) {
      mem.goal = pickGoal(ctx, mem);
      mem.goalUntil = tick + 600;
    }
    const g = mem.objective ?? mem.goal!;
    moveDir = normalize(planarTo(g));
  }

  // obstacle avoidance: probe ahead at chest height, steer around walls
  if (lenSq(moveDir) > 0.01) {
    const md = normalize(moveDir);
    const probe = raycast(ctx.level, madd(self.pos, up, 0.3), md, 2.5);
    if (probe && Math.abs(dot(probe.normal, up)) < 0.5) {
      const tall = raycast(ctx.level, madd(self.pos, up, 1.4), md, 2.5);
      if (tall) {
        // turn along the wall
        const along = normalize(cross(up, probe.normal));
        moveDir = dot(along, md) >= 0 ? along : scale(along, -1);
      }
    }
  }
  // stuck detection
  if (len(sub(self.pos, mem.lastPos)) < 0.02 && lenSq(moveDir) > 0.01) mem.stuckTicks++;
  else mem.stuckTicks = 0;
  mem.lastPos = clone(self.pos);
  if (mem.stuckTicks > 30) {
    mem.goal = pickGoal(ctx, mem);
    mem.strafeDir = mem.strafeDir === 1 ? -1 : 1;
    mem.stuckTicks = 0;
    buttons |= Btn.Jump;
  }

  // ---------------- aiming ----------------
  let aimDir: Vec3 | null = null;
  if (deflectTarget && mem.deflecting === 0 && rngFloat(rng) < s.deflectChance) mem.deflecting = 8;
  if (mem.deflecting > 0) {
    mem.deflecting--;
    if (deflectTarget) aimDir = sub(deflectTarget, eye);
    if (deflectTarget && len(sub(deflectTarget, eye)) < 2.4) buttons |= Btn.Melee;
  } else if (target && engaged) {
    const hb = hitboxOf(target, ctx.config);
    const aimAt = s.name === 'hard' && rngFloat(rng) < 0.3 ? hb.head : chestOf(hb);
    const dist = len(sub(aimAt, eye));
    const held = myB?.phase === Phase.Held;
    const speed = held ? (self.windup > 0 ? c.windupSpeed : c.quickSpeed) : 1e6;
    const t = held ? dist / speed : c.laserWarnSec;
    let lead = madd(aimAt, target.vel, t * s.leadAccuracy);
    // gravity drop compensation for thrown Boomerangs
    if (held && self.windup === 0)
      lead = madd(lead, up, 0.5 * ctx.config.movement.gravity * c.boomerangGravityScale * t * t);
    if (tick >= mem.aimErrUntil) {
      const e = s.aimErrorDeg * DEG * dist;
      mem.aimErr = v3(
        (rngFloat(rng) - 0.5) * e,
        (rngFloat(rng) - 0.5) * e,
        (rngFloat(rng) - 0.5) * e,
      );
      mem.aimErrUntil = tick + 20 + rngInt(rng, 30);
    }
    aimDir = sub(add(lead, mem.aimErr), eye);
  } else if (lenSq(moveDir) > 0.01) {
    aimDir = moveDir;
  }
  if (aimDir) view = turnView(self.view, aimDir, up, s.turnDegPerTick);
  const aimErrNow = aimDir ? angleBetween(qForward(view), aimDir) : Math.PI;

  // ---------------- dodging ----------------
  if (threat && rngFloat(rng) < s.dodgeChance * 0.25) {
    const side = normalize(cross(up, threat));
    moveDir = scale(side, mem.strafeDir);
    if (self.dashCd === 0) buttons |= Btn.Dash;
    else if (self.grounded && mem.jumpCooldown === 0) {
      buttons |= Btn.Jump;
      mem.jumpCooldown = 20;
    }
  }
  if (mem.jumpCooldown > 0) mem.jumpCooldown--;

  buttons |= moveButtons(view, up, moveDir);

  // slide-hop: slide when fast, jump out of the slide
  const planarSpeed = len(projectOnPlane(self.vel, up));
  if (s.slideHop && self.grounded && self.windup === 0) {
    if (
      self.move !== Move.Slide &&
      planarSpeed > 8.5 &&
      tick - mem.slideTick > 70 &&
      rngFloat(rng) < 0.05
    ) {
      buttons |= Btn.Crouch;
      mem.slideTick = tick;
    } else if (self.move === Move.Slide) {
      buttons |= Btn.Crouch;
      if (tick - mem.slideTick > 12) buttons |= Btn.Jump;
    }
  }

  // ---------------- weapons ----------------
  let releaseTick = false;
  if (myB && target && engaged && targetVisible) {
    const dist = len(sub(target.pos, self.pos));
    const held = myB.phase === Phase.Held;
    if (held) {
      if (dist < 2.6 && self.slashCd === 0) buttons |= Btn.Melee;
      // Wind-up Throw at long range
      if (mem.windupActive) {
        if (self.windup === 0 && !(self.prevButtons & Btn.Alt)) mem.windupActive = false;
        else {
          buttons |= Btn.Alt;
          buttons &= ~(
            Btn.Forward |
            Btn.Back |
            Btn.Left |
            Btn.Right |
            Btn.Crouch |
            Btn.Jump |
            Btn.Dash
          );
          const full = Math.round(c.windupSec / ctx.dt);
          if (self.windup >= full && aimErrNow < 1.2 * DEG) {
            buttons |= Btn.Fire;
            mem.windupActive = false;
          }
        }
      } else if (dist > 28 && self.grounded && rngFloat(rng) < s.windupChance) {
        mem.windupActive = true;
        buttons |= Btn.Alt;
      } else if (mem.throwPhase > 0) {
        mem.throwPhase++;
        if (mem.throwPhase < 6 || aimErrNow > (s.aimErrorDeg * 0.8 + 0.6) * DEG) {
          if (mem.throwPhase < 40) buttons |= Btn.Fire;
          else mem.throwPhase = 0; // give up this throw
        } else {
          mem.throwPhase = 0; // release => throw
          mem.nextThrowTick = tick + range(rng, s.throwInterval);
          releaseTick = true;
        }
      } else if (tick >= mem.nextThrowTick && dist < 45 && aimErrNow < 12 * DEG) {
        mem.throwPhase = 1;
        buttons |= Btn.Fire;
      }
    } else {
      mem.throwPhase = 0;
      mem.windupActive = false;
      // steer the throw toward the target
      if (
        (myB.phase === Phase.Out || myB.phase === Phase.Return) &&
        myB.steerLeft > 0 &&
        rngFloat(rng) < 0.5
      )
        buttons |= Btn.Alt;
      // laser while the Boomerang is away
      if (
        self.laserCharges > 0 &&
        self.laserWarn === 0 &&
        aimErrNow < 2 * DEG &&
        rngFloat(rng) < s.laserChance
      )
        buttons |= Btn.Fire;
      // Lethal Recall when an enemy stands on the (open) line
      if (myB.phase === Phase.Dropped || myB.phase === Phase.Out || myB.phase === Phase.Return) {
        const line = recallLine(myB, self, ctx);
        if (line.lethal) {
          const seg = sub(line.to, line.from);
          for (const e of enemies) {
            const tt = Math.max(
              0,
              Math.min(1, dot(sub(e.pos, line.from), seg) / Math.max(1e-6, dot(seg, seg))),
            );
            const onLine =
              len(sub(madd(line.from, seg, tt), e.pos)) < 1.0 && tt > 0.05 && tt < 0.95;
            const mateOnLine = world.players.some(
              (m) =>
                m.alive &&
                m.team === self.team &&
                m.id !== self.id &&
                len(
                  sub(
                    madd(
                      line.from,
                      seg,
                      Math.max(
                        0,
                        Math.min(
                          1,
                          dot(sub(m.pos, line.from), seg) / Math.max(1e-6, dot(seg, seg)),
                        ),
                      ),
                    ),
                    m.pos,
                  ),
                ) < 1.2,
            );
            if (onLine && !mateOnLine && rngFloat(rng) < s.recallSkill * 0.2) buttons |= Btn.Recall;
          }
        }
      }
      // get a dropped Boomerang back: walk over it when close, otherwise recall it
      if (myB.phase === Phase.Dropped) {
        const d = len(sub(myB.pos, self.pos));
        if (d < 6) {
          moveDir = normalize(projectOnPlane(sub(myB.pos, self.pos), up));
          buttons =
            (buttons & ~(Btn.Forward | Btn.Back | Btn.Left | Btn.Right)) |
            moveButtons(view, up, moveDir);
        } else if (rngFloat(rng) < 0.04) buttons |= Btn.Recall;
      }
    }
    // grenade at mid range
    if (self.grenadesLeft > 0 && dist > 8 && dist < 20 && rngFloat(rng) < 0.003)
      buttons |= Btn.Grenade;
    // A/D held on release curves the throw: release straight unless curving on purpose
    if (releaseTick) buttons &= ~(Btn.Left | Btn.Right);
  } else if (myB) {
    mem.throwPhase = 0;
    if (mem.windupActive) mem.windupActive = false;
    // retrieve a dropped Boomerang: walk to it if close, recall if far
    if (myB.phase === Phase.Dropped) {
      const d = len(sub(myB.pos, self.pos));
      if (d < 15) {
        moveDir = normalize(projectOnPlane(sub(myB.pos, self.pos), up));
        buttons =
          (buttons & ~(Btn.Forward | Btn.Back | Btn.Left | Btn.Right)) |
          moveButtons(view, up, moveDir);
      } else if (rngFloat(rng) < 0.05) buttons |= Btn.Recall;
    }
  }

  return { tick, buttons, view };
};
