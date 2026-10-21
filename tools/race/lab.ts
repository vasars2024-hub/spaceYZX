// The movement laboratory's measurements (tools/race/movement-lab.ts prints and saves them; the
// surf tests re-check the key ones): what the REAL simulation lets a player do with the surf-map
// (race) movement rules — body size, jumps, bunny hops, surf speed, how tight a curved ramp can
// be at a given speed, which face angles surf, the speed caps. Every number comes from driving a
// player with ordinary inputs through sim/world.ts `step` on a small test level; nothing is
// computed from the config alone except the body size and the caps it states.
//
// Riders: STEADY strafes perfectly (bots/racer.ts strafeToward / surfToward: the timing
// tests' driver); a HUMAN rider (strafe efficiency 0.6..0.8) misses keys and mouse for part of
// its air ticks in a fixed pattern, like HUMAN_RACER.
import {
  addPlayer,
  buildCurve,
  buildLevel,
  Btn,
  createPlayer,
  createWorld,
  defaultConfig,
  normalize,
  resetRacer,
  scale,
  step,
  strafeToward,
  sub,
  surfToward,
  TICK_DT,
  v3,
  yawToView,
  type BoxDef,
  type CurveEl,
  type LevelDef,
  type PlayerState,
  type SimContext,
  type Vec3,
  type WorldState,
} from '@space-yz/shared';

export const M = defaultConfig().movement;

/** A test level: a surf map's race rules (surf movement), a floor at y = 0 when asked. */
export const labLevel = (boxes: BoxDef[], floor = false): LevelDef => ({
  name: 'lab',
  boundsMin: v3(-900, -200, -900),
  boundsMax: v3(900, 400, 900),
  defaultGravity: v3(0, -1, 0),
  boxes: floor ? [{ c: v3(0, -0.5, 0), h: v3(900, 0.5, 900) }, ...boxes] : boxes,
  zones: [],
  rails: [],
  pads: [],
  spawns: [{ pos: v3(0, 0, 0), yawDeg: 0 }],
  towers: [],
  race: {
    parSec: 60,
    start: { respawn: v3(0, 0, 0), yawDeg: 0 },
    grid: [{ pos: v3(0, 0, 0), yawDeg: 0 }],
    checkpoints: [],
    finish: { min: v3(-1, -1000, 890), max: v3(1, -999, 891), respawn: v3(0, 0, 0), yawDeg: 0 },
    killY: -150,
    line: [{ pos: v3(0, 0, 0), cp: 0 }],
    surf: true,
    noJetpack: true,
    noSurge: true,
  },
});

export interface Lab {
  ctx: SimContext;
  world: WorldState;
  p: PlayerState;
}

/** A racer standing (racing) at `feet` on `def`. */
export const labSim = (def: LevelDef, feet: Vec3 = v3(0, 0, 0), yawDeg = 0): Lab => {
  const config = defaultConfig();
  const ctx: SimContext = { level: buildLevel(def), config, dt: TICK_DT };
  const world = createWorld(ctx.level, 1);
  const p = addPlayer(world, createPlayer(1, 0, feet, yawDeg, config));
  resetRacer(p, config.movement, feet, yawDeg, 0);
  return { ctx, world, p };
};

export const tick = (lab: Lab, buttons: number, view = lab.p.view): void =>
  step(lab.world, { 1: { tick: lab.world.tick + 1, buttons, view } }, lab.ctx);

const feetOf = (p: PlayerState): Vec3 => v3(p.pos.x, p.pos.y - 0.9, p.pos.z);
const flatSpeed = (p: PlayerState): number => Math.hypot(p.vel.x, p.vel.z);

/** A human's missed strafes: air ticks with no keys, in a fixed pattern (like HUMAN_RACER). */
export const missed = (t: number, eff: number): boolean => eff < 1 && (t * 0.618034) % 1 >= eff;

// ------------------------------------------------------------------------------------------
// Jumps and bunny hops

/** Jump apex (m above the take-off) standing still: Z. */
export const jumpApex = (): number => {
  const lab = labSim(labLevel([], true));
  for (let i = 0; i < 20; i++) tick(lab, 0);
  let best = 0;
  tick(lab, Btn.Jump);
  for (let i = 0; i < 90; i++) {
    tick(lab, 0);
    best = Math.max(best, feetOf(lab.p).y);
  }
  return best;
};

/**
 * A running jump on flat ground at `speed` (m/s, heading north): how far (m) until you are back
 * down at the take-off height. `strafe`: air-strafing straight on (perfectly) the whole way.
 */
export const runJump = (speed: number, strafe: boolean): number => {
  const lab = labSim(labLevel([], true));
  for (let i = 0; i < 20; i++) tick(lab, 0);
  lab.p.vel = v3(0, 0, -speed);
  const z0 = lab.p.pos.z;
  tick(lab, Btn.Jump | Btn.Forward, yawToView(0));
  for (let i = 0; i < 180; i++) {
    const s = strafe ? strafeToward(lab.p, v3(0, 0, -1), lab.world.tick + 1) : null;
    tick(lab, s ? s.buttons : 0, s ? s.view : yawToView(0));
    if (lab.p.grounded) break;
  }
  return z0 - lab.p.pos.z;
};

export interface BhopResult {
  /** average distance per hop (m) */
  perHop: number;
  /** average speed gained per hop (m/s) */
  gain: number;
  /** speed after the hops */
  end: number;
  hops: number;
}

/**
 * A bunny-hop chain from `speed`: jump on the first ground tick of every landing, air-strafe
 * toward north at strafe efficiency `eff` (1 = perfect). `hold`: keep Space held the whole
 * time instead of pressing it on the way down (does holding re-jump?); `assist`: on a map with
 * the hold-to-bhop option (RaceDef.holdToBhop). B(v).
 */
export const bhop = (
  speed: number,
  eff = 1,
  hops = 8,
  hold = false,
  assist = false,
): BhopResult => {
  const def = labLevel([], true);
  if (assist) def.race!.holdToBhop = true;
  const lab = labSim(def);
  for (let i = 0; i < 20; i++) tick(lab, 0);
  lab.p.vel = v3(0, 0, -speed);
  const z0 = lab.p.pos.z;
  const v0 = speed;
  let landings = 0;
  let wasAir = false;
  let t = 0;
  let jumps = 0;
  for (let i = 0; i < 60 * 30 && landings < hops; i++) {
    t++;
    const p = lab.p;
    if (p.grounded) {
      if (wasAir) landings++;
      wasAir = false;
      if (hold) {
        // (a step starts a fresh event list)
        tick(lab, Btn.Jump | Btn.Forward, yawToView(0));
        if (lab.world.events.some((e) => e.type === 'jump')) jumps++;
        // (held: no fresh press; if it did not jump the chain is over)
        if (!lab.world.events.some((e) => e.type === 'jump') && landings > 0) break;
        continue;
      }
      const fresh = p.prevButtons & Btn.Jump ? 0 : Btn.Jump;
      tick(lab, Btn.Forward | fresh, yawToView(0));
      continue;
    }
    wasAir = true;
    const s = strafeToward(p, v3(0, 0, -1), lab.world.tick + 1);
    let b = missed(t, eff) ? 0 : s.buttons;
    if (hold) b |= Btn.Jump;
    else if (p.vel.y < -1 && t % 2 === 0) b |= Btn.Jump;
    tick(lab, b, s.view);
  }
  const dist = z0 - lab.p.pos.z;
  const n = Math.max(1, landings);
  return {
    perHop: dist / n,
    gain: (flatSpeed(lab.p) - v0) / n,
    end: flatSpeed(lab.p),
    hops: hold ? jumps : landings,
  };
};

// ------------------------------------------------------------------------------------------
// Surfing

export interface RideResult {
  /** rode the whole line (no fall, no red zone, not thrown over the ridge) */
  ok: boolean;
  secs: number;
  /** speed at the end (3D, m/s) */
  speed: number;
  /** horizontal speeds each tick (for medians) */
  speeds: number[];
  /** the biggest one-tick loss of speed (m/s), and of it the part not explained by strafing */
  worstDrop: number;
  /** ticks spent grounded (a surf face must never be ground) */
  grounded: number;
  /** where it failed (feet), when it did */
  failAt?: Vec3;
}

/**
 * Ride a racing line of feet points on a surf face from its first point at `speed` (along the
 * line), the way bots/racer.ts surfs (surfToward), at strafe efficiency `eff`. Ends past the
 * last point (ok when still heading along the line), or failed when it strays more than `fall`
 * metres below the line, `above` metres over it or `offMax` metres beside it (it left the face).
 */
export const rideLine = (
  def: LevelDef,
  line: Vec3[],
  speed: number,
  eff = 1,
  fall = 8,
  /** the farthest (horizontally) it may stray from the line: past it, it left the face */
  offMax = 6,
  /** the most it may rise above the line: past it, it was thrown over the ridge */
  above = 5,
): RideResult => {
  const a = line[0];
  const lab = labSim(def, a, 0);
  const p = lab.p;
  p.pos = v3(a.x, a.y + 0.92, a.z);
  p.vel = scale(normalize(sub(line[1], line[0])), speed);
  let k = 0;
  let worst = 0;
  let prev = speed;
  let grounded = 0;
  const speeds: number[] = [];
  const eff1 = eff >= 1 ? 1 : 1 - (1 - eff) / 3;
  for (let t = 0; t < 60 * 60; t++) {
    const feet = feetOf(p);
    while (k < line.length - 2) {
      const seg = sub(line[k + 1], line[k]);
      const d = sub(feet, line[k + 1]);
      if (seg.x * d.x + seg.z * d.z > 0) k++;
      else break;
    }
    const lastSeg = sub(line[line.length - 1], line[line.length - 2]);
    const pastEnd = sub(feet, line[line.length - 1]);
    if (k >= line.length - 2 && lastSeg.x * pastEnd.x + lastSeg.z * pastEnd.z > 0) {
      // (and leaving it the way the ramp does: it turned you, you did not fly off straight)
      const ls = Math.hypot(lastSeg.x, lastSeg.z);
      const vs = flatSpeed(p);
      const along = vs > 1e-6 ? (p.vel.x * lastSeg.x + p.vel.z * lastSeg.z) / (ls * vs) : 0;
      return {
        ok: along > Math.cos(0.4),
        secs: t / 60,
        speed: prev,
        speeds,
        worstDrop: worst,
        grounded,
      };
    }
    const s = surfToward(p, line[k], line[k + 1], lab.world.tick + 1);
    tick(lab, missed(t, eff1) ? 0 : s.buttons, s.view);
    const sp = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
    worst = Math.max(worst, prev - sp);
    prev = sp;
    speeds.push(flatSpeed(p));
    if (p.grounded) grounded++;
    // the line's height here (between its points)
    const A = line[k];
    const B = line[k + 1];
    const ab = sub(B, A);
    const l2 = ab.x * ab.x + ab.z * ab.z;
    const u =
      l2 > 0 ? Math.max(0, Math.min(1, ((feet.x - A.x) * ab.x + (feet.z - A.z) * ab.z) / l2)) : 0;
    const lineY = A.y + ab.y * u;
    const off = Math.hypot(A.x + ab.x * u - feet.x, A.z + ab.z * u - feet.z);
    const respawned = lab.world.events.some((e) => e.type === 'raceRespawn');
    if (respawned || feet.y < lineY - fall || feet.y > lineY + above || off > offMax)
      return {
        ok: false,
        secs: t / 60,
        speed: sp,
        speeds,
        worstDrop: worst,
        grounded,
        failAt: feet,
      };
  }
  return {
    ok: false,
    secs: 60,
    speed: prev,
    speeds,
    worstDrop: worst,
    grounded,
    failAt: feetOf(p),
  };
};

/** A lone curve on a lab level, and its racing line. */
export const curveLab = (e: CurveEl): { def: LevelDef; line: Vec3[]; pieces: number } => {
  const b = buildCurve(e, { color: 0x888888, trim: 0xffffff, hazard: 0xe8242c }, 0);
  return { def: labLevel(b.boxes), line: b.nodes.map((n) => n.pos), pieces: b.boxes.length };
};

/** A curve element for the lab (ridge at 150 m heading north). */
export const labCurve = (legs: CurveEl['legs'], more: Partial<CurveEl> = {}): CurveEl => ({
  t: 'curve',
  at: [0, 150, 0],
  heading: 0,
  legs,
  height: 12,
  angle: 60,
  side: 'right',
  depth: 0.35,
  ...more,
});

/**
 * C(v): the tightest radius (m, at the ridge) of a nearly level 180° curve a rider holds at
 * entry speed `speed` — following it round, never leaving the face, keeping 90 % of the speed —
 * on a 12 m face of `angle`° (riding a third of the way down):
 * `inside` = the curve turns toward the face (it holds you, like a banked track; too fast and it
 * lifts you over the ridge), else away from it (you hold into it). Bisection 8..240 m.
 */
export const minRadius = (speed: number, angle: number, inside: boolean, eff = 1): number => {
  const ok = (r: number): boolean => {
    const e = labCurve([{ turn: inside ? 180 : -180, radius: r, drop: 2 }], {
      angle,
      height: 12,
    });
    const { def, line } = curveLab(e);
    const res = rideLine(def, line, speed, eff);
    // (held: followed it round, still on the face, keeping at least 90 % of the speed)
    return res.ok && res.speed >= 0.9 * speed;
  };
  let lo = 8;
  let hi = 240;
  if (ok(lo)) return lo;
  if (!ok(hi)) return Infinity;
  for (let i = 0; i < 7; i++) {
    const mid = Math.sqrt(lo * hi);
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
};

/**
 * Holding a straight level face of `angle`° at `speed` for 4 s: rode it? metres of height lost,
 * and how fast you slide down it letting go (vertical m/s after 1 s).
 */
export const faceHold = (angle: number, speed: number) => {
  const e = labCurve([{ len: speed * 4.5 + 20, drop: 0 }], { angle, height: 14 });
  const { def, line } = curveLab(e);
  const r = rideLine(def, line, speed, 1, 6);
  const lab = labSim(def, line[0], 0);
  lab.p.pos = v3(line[0].x, line[0].y + 0.92, line[0].z);
  lab.p.vel = v3(0, 0, -speed);
  for (let i = 0; i < 60; i++) tick(lab, 0);
  return { ok: r.ok, grounded: r.grounded, slide: -lab.p.vel.y };
};

/**
 * Air-strafing turn: holding a perfect strafe at `speed`, how fast (degrees per second) can
 * you turn without losing speed? (Measured over half a second.)
 */
export const strafeTurnRate = (speed: number): number => {
  const lab = labSim(labLevel([], false), v3(0, 100, 0));
  lab.p.pos = v3(0, 100, 0);
  lab.p.vel = v3(0, 0, -speed);
  const h0 = Math.atan2(lab.p.vel.x, -lab.p.vel.z);
  const want = v3(1, 0, 0); // hard right
  for (let i = 0; i < 30; i++) {
    const s = strafeToward(lab.p, want, lab.world.tick + 1);
    tick(lab, s.buttons, s.view);
  }
  const h1 = Math.atan2(lab.p.vel.x, -lab.p.vel.z);
  return (((h1 - h0) * 180) / Math.PI) * 2;
};

/** Free fall from rest: the speed after `sec` seconds (the cap shows as a plateau). */
export const fallSpeed = (sec: number): number => {
  const lab = labSim(labLevel([], false), v3(0, 350, 0));
  lab.p.pos = v3(0, 350, 0);
  for (let i = 0; i < sec * 60; i++) tick(lab, 0);
  return Math.hypot(lab.p.vel.x, lab.p.vel.y, lab.p.vel.z);
};

/** Braking in the air: holding S (back) at `speed`: the speed after one tick. */
export const airBrake = (speed: number): number => {
  const lab = labSim(labLevel([], false), v3(0, 100, 0));
  lab.p.pos = v3(0, 100, 0);
  lab.p.vel = v3(0, 0, -speed);
  tick(lab, Btn.Back, yawToView(0));
  return flatSpeed(lab.p);
};

/** The median of a list. */
export const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
