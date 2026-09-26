// Map-analysis metrics for competitive layout review. Every function here is pure: it takes a
// built Level (buildLevel(mapDef(id))) plus the per-map setup from maps.ts and returns plain,
// JSON-serializable numbers. The CLI (analyze.ts) prints them and draws the plans (plan.ts).
//
// Conventions
//  - A "sample" is a spot where a player can stand (or float, in zero-G). Samples are found on a
//    grid: rays are cast along gravity through the level, and every surface facing against
//    gravity where the standing capsule fits (and gravity really pulls into that surface) becomes
//    a sample. Wall/ceiling gravity zones get their own passes; zero-G zones get mag-boot surfaces
//    (every face) plus a coarse grid of floating points.
//  - Samples that cannot be reached from the spawns (roofs, the top of the Tower...) are marked
//    unreachable and ignored by every metric.
//  - Eye/chest/head heights and hitbox sizes come from the game's own code (eyePos, hitboxOf).
//  - Visibility uses the game's line-of-sight rules (see rays.ts): player bodies never block.
import {
  add,
  capsuleOverlaps,
  chestOf,
  closestPointOnBox,
  createPlayer,
  createWorld,
  defaultConfig,
  dot,
  eyePos,
  feetPos,
  gravityDirAt,
  hitboxOf,
  isZeroG,
  len,
  madd,
  Move,
  normalize,
  pointInAabb,
  railClosest,
  railPoint,
  rayBox,
  scale,
  sub,
  TICK_DT,
  v3,
  waypointRoute,
  type Capsule,
  type GameConfig,
  type Level,
  type SimContext,
  type Vec3,
  type WaypointDef,
  type WorldState,
} from '@space-yz/shared';
import { RayIndex, rayBoxExit } from './rays';
import type { ChokepointDef, MapAnalysisConfig, Team } from './maps';
import { measureRoutes, type TimingReport } from './timing';

// ------------------------------------------------------------------------------------------
// options

export interface AnalysisOptions {
  quick: boolean;
  /** walkable grid spacing (m) for floors and wall/ceiling gravity surfaces */
  spacing: number;
  /** grid spacing (m) for mag-boot surfaces inside zero-G zones */
  zeroGSpacing: number;
  /** spacing (m) of floating sample points inside zero-G zones (0 = none) */
  floatSpacing: number;
  /** horizontal sightline rays per sample (a third as many again at each pitch below) */
  sightRays: number;
  sightPitchDeg: number[];
  /** sightlines are cast from every n-th grid sample in both grid directions */
  sightStride: number;
  /** stride for the pairwise visibility metrics (Towers, chokepoints, height advantage) */
  pairStride: number;
  /** exposure (how many spots see you) is measured on every n-th lane spot... */
  exposureStride: number;
  /** ...from viewers: standing spots (floor and wall/ceiling gravity) on every n-th grid spot */
  viewerStride: number;
  maxSight: number;
  /** a sample is "open ground" when its nearest cover is farther than this (m) */
  openCover: number;
  /** head glitch: the defender sees the attacker while less than this share of the hitbox shows */
  glitchFrac: number;
  /** "raised" = at least this far (m) above the lowest floor within 4 m */
  heightMin: number;
  log: (msg: string) => void;
}

export const defaultOptions = (quick = false): AnalysisOptions => ({
  quick,
  spacing: quick ? 2 : 1,
  zeroGSpacing: quick ? 4 : 2,
  floatSpacing: quick ? 8 : 4,
  sightRays: quick ? 36 : 72,
  sightPitchDeg: [-10, 10],
  sightStride: 1,
  pairStride: quick ? 2 : 1,
  exposureStride: 2,
  viewerStride: 4,
  maxSight: 250,
  openCover: 8,
  glitchFrac: 0.15,
  heightMin: 2,
  log: () => {},
});

// ------------------------------------------------------------------------------------------
// small helpers

type Axis = 0 | 1 | 2;
const AXES: Axis[] = [0, 1, 2];
const comp = (v: Vec3, a: Axis): number => (a === 0 ? v.x : a === 1 ? v.y : v.z);
const withComp = (v: Vec3, a: Axis, val: number): Vec3 =>
  a === 0 ? v3(val, v.y, v.z) : a === 1 ? v3(v.x, val, v.z) : v3(v.x, v.y, val);
const axisVec = (a: Axis, sign: number): Vec3 => withComp(v3(0, 0, 0), a, sign);
const dominantAxis = (v: Vec3): Axis => {
  const ax = Math.abs(v.x),
    ay = Math.abs(v.y),
    az = Math.abs(v.z);
  return ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
};
const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));
export const r1 = (x: number): number => Math.round(x * 10) / 10;
export const r2 = (x: number): number => Math.round(x * 100) / 100;
export const rp = (p: Vec3): Vec3 => v3(r1(p.x), r1(p.y), r1(p.z));
const pct = (n: number, d: number): number => (d > 0 ? r1((100 * n) / d) : 0);
const gridRange = (lo: number, hi: number, s: number): number[] => {
  const out: number[] = [];
  for (let k = Math.ceil(lo / s - 0.5); k <= Math.floor(hi / s - 0.5); k++) out.push(k);
  return out;
};
const colKey = (pass: number, gi: number, gj: number): number =>
  (pass * 4096 + (gi + 2048)) * 4096 + (gj + 2048);
const countBy = (names: string[]): { region: string; count: number }[] => {
  const m = new Map<string, number>();
  for (const n of names) m.set(n, (m.get(n) ?? 0) + 1);
  return [...m.entries()]
    .map(([region, count]) => ({ region, count }))
    .sort((a, b) => b.count - a.count || a.region.localeCompare(b.region));
};

/** Unit vectors spanning the plane perpendicular to an axis-aligned `up`. */
const tangents = (up: Vec3): [Vec3, Vec3] => {
  const a = dominantAxis(up);
  if (a === 1) return [v3(1, 0, 0), v3(0, 0, 1)];
  if (a === 0) return [v3(0, 0, 1), v3(0, 1, 0)];
  return [v3(1, 0, 0), v3(0, 1, 0)];
};

// ------------------------------------------------------------------------------------------
// body model (from the game code)

export interface BodyModel {
  crouched: boolean;
  height: number;
  radius: number;
  /** heights above the feet, along the body's up */
  eye: number;
  head: number;
  headR: number;
  bodyA: number;
  bodyB: number;
  bodyR: number;
  chest: number;
  /** ~40 points (side offset s, height h) covering the hitbox silhouette, equal area each */
  silhouette: { s: number; h: number }[];
}

export const bodyModel = (game: GameConfig, crouched: boolean): BodyModel => {
  const m = game.movement;
  const p = createPlayer(0, 0, v3(0, 0, 0), 0, game);
  const height = crouched ? m.crouchHeight : m.standHeight;
  p.crouched = crouched;
  p.move = Move.Ground;
  p.pos = v3(0, height / 2, 0);
  const feet = feetPos(p, m).y;
  const hb = hitboxOf(p, game);
  const model = {
    crouched,
    height,
    radius: m.radius,
    eye: eyePos(p, m).y - feet,
    head: hb.head.y - feet,
    headR: hb.headR,
    bodyA: hb.bodyA.y - feet,
    bodyB: hb.bodyB.y - feet,
    bodyR: hb.bodyR,
    chest: chestOf(hb).y - feet,
  };
  // silhouette seen from the side: head disc + body "stadium" (capsule outline)
  const area =
    Math.PI * model.headR ** 2 +
    2 * model.bodyR * (model.bodyB - model.bodyA) +
    Math.PI * model.bodyR ** 2;
  const step = Math.sqrt(area / 40);
  const inside = (s: number, h: number): boolean => {
    if (s * s + (h - model.head) ** 2 <= model.headR ** 2) return true;
    const hc = Math.max(model.bodyA, Math.min(model.bodyB, h));
    return s * s + (h - hc) ** 2 <= model.bodyR ** 2;
  };
  const silhouette: { s: number; h: number }[] = [];
  const h0 = model.bodyA - model.bodyR;
  const h1 = model.head + model.headR;
  const R = Math.max(model.bodyR, model.headR);
  const ns = Math.max(1, Math.round((2 * R) / step));
  for (let j = 0; (j + 0.5) * step + h0 <= h1; j++)
    for (let i = 0; i < ns; i++) {
      const s = -R + (i + 0.5) * ((2 * R) / ns);
      const h = h0 + (j + 0.5) * step;
      if (inside(s, h)) silhouette.push({ s, h });
    }
  return { ...model, silhouette };
};

// ------------------------------------------------------------------------------------------
// analyzer context

export type SampleKind = 'floor' | 'gravity' | 'mag' | 'float';

export interface Sample {
  id: number;
  kind: SampleKind;
  pass: number;
  gi: number;
  gj: number;
  feet: Vec3;
  up: Vec3;
  eye: Vec3;
  chest: Vec3;
  head: Vec3;
  centre: Vec3;
  /** supporting box (-1 when floating) */
  box: number;
  /** gravity zone at the body centre (-1 = default gravity) */
  zone: number;
  region: number;
  reachable: boolean;
}

export interface Pass {
  id: number;
  kind: SampleKind;
  axis: Axis;
  down: Vec3;
  up: Vec3;
  u: Axis;
  v: Axis;
  min: Vec3;
  max: Vec3;
  spacing: number;
  zeroG: boolean;
  zone: number;
}

export interface Analyzer {
  level: Level;
  config: MapAnalysisConfig;
  opts: AnalysisOptions;
  game: GameConfig;
  rays: RayIndex;
  stand: BodyModel;
  crouch: BodyModel;
  ctx: SimContext;
  world: WorldState;
  passes: Pass[];
  samples: Sample[];
  /** column index → sample ids (per pass grid) */
  columns: Map<number, number[]>;
}

const LIFT = 0.1; // capsule test lifted a little so ramps count as walkable

export const createAnalyzer = (
  level: Level,
  config: MapAnalysisConfig,
  opts: AnalysisOptions,
): Analyzer => {
  const game = defaultConfig();
  return {
    level,
    config,
    opts,
    game,
    rays: new RayIndex(level, 2),
    stand: bodyModel(game, false),
    crouch: bodyModel(game, true),
    ctx: { level, config: game, dt: TICK_DT },
    world: createWorld(level, 1),
    passes: [],
    samples: [],
    columns: new Map(),
  };
};

export const regionIndexOf = (config: MapAnalysisConfig, p: Vec3): number => {
  for (let i = 0; i < config.regions.length; i++) {
    const r = config.regions[i];
    if (
      p.x >= r.min.x &&
      p.x <= r.max.x &&
      p.y >= r.min.y &&
      p.y <= r.max.y &&
      p.z >= r.min.z &&
      p.z <= r.max.z
    )
      return i;
  }
  return -1;
};

export const regionName = (an: Analyzer, i: number): string =>
  i >= 0 ? an.config.regions[i].name : 'other';

/** Gravity zone that decides gravity at p (same priority rule as the game), -1 = default. */
const zoneAt = (level: Level, p: Vec3): number => {
  let best = -1;
  let bestPri = -Infinity;
  level.zones.forEach((z, i) => {
    const pri = z.priority ?? 0;
    if (
      pri >= bestPri &&
      p.x >= z.min.x &&
      p.x <= z.max.x &&
      p.y >= z.min.y &&
      p.y <= z.max.y &&
      p.z >= z.min.z &&
      p.z <= z.max.z
    ) {
      best = i;
      bestPri = pri;
    }
  });
  return best;
};

const standingCapsule = (an: Analyzer, feet: Vec3, up: Vec3, lift = LIFT): Capsule => {
  const m = an.game.movement;
  return {
    center: madd(feet, up, m.standHeight / 2 + lift),
    up,
    halfSeg: m.standHeight / 2 - m.radius,
    radius: m.radius,
  };
};

const makeSample = (
  an: Analyzer,
  kind: SampleKind,
  pass: number,
  gi: number,
  gj: number,
  feet: Vec3,
  up: Vec3,
  box: number,
): Sample => {
  const st = an.stand;
  const centre = madd(feet, up, an.game.movement.standHeight / 2);
  return {
    id: an.samples.length,
    kind,
    pass,
    gi,
    gj,
    feet,
    up,
    eye: madd(feet, up, st.eye),
    chest: madd(feet, up, st.chest),
    head: madd(feet, up, st.head),
    centre,
    box,
    zone: zoneAt(an.level, centre),
    region: regionIndexOf(an.config, madd(feet, up, 0.1)),
    reachable: false,
  };
};

// ------------------------------------------------------------------------------------------
// 1. walkable samples

const makePasses = (an: Analyzer): Pass[] => {
  const { level, opts } = an;
  const def = level.def;
  const passes: Pass[] = [];
  const isDown = (g: Vec3) => dot(normalize(g), v3(0, -1, 0)) > 0.999;
  const push = (
    kind: SampleKind,
    down: Vec3,
    min: Vec3,
    max: Vec3,
    spacing: number,
    zone: number,
    zeroG: boolean,
  ) => {
    const axis = dominantAxis(down);
    const d = axisVec(axis, Math.sign(comp(down, axis)));
    const others = AXES.filter((a) => a !== axis);
    passes.push({
      id: passes.length,
      kind,
      axis,
      down: d,
      up: scale(d, -1),
      u: others[0],
      v: others[1],
      min,
      max,
      spacing,
      zeroG,
      zone,
    });
  };
  const g0 = def.defaultGravity;
  if (!isZeroG(g0))
    push(
      isDown(g0) ? 'floor' : 'gravity',
      normalize(g0),
      def.boundsMin,
      def.boundsMax,
      opts.spacing,
      -1,
      false,
    );
  level.zones.forEach((z, i) => {
    if (isZeroG(z.gravity)) {
      for (const a of AXES)
        for (const s of [-1, 1])
          push('mag', axisVec(a, s), z.min, z.max, opts.zeroGSpacing, i, true);
    } else if (isZeroG(g0) || dot(normalize(z.gravity), normalize(g0)) < 0.999) {
      push(
        isDown(z.gravity) ? 'floor' : 'gravity',
        normalize(z.gravity),
        z.min,
        z.max,
        opts.spacing,
        i,
        false,
      );
    }
  });
  return passes;
};

const samplePass = (an: Analyzer, pass: Pass): void => {
  const { level, rays } = an;
  const m = an.game.movement;
  const walkCos = Math.cos((m.maxWalkableSlopeDeg * Math.PI) / 180);
  const cosLimit = pass.zeroG ? 0.999 : walkCos;
  const s = pass.spacing;
  const downSign = comp(pass.down, pass.axis);
  const startA = downSign < 0 ? comp(pass.max, pass.axis) + 0.5 : comp(pass.min, pass.axis) - 0.5;
  const total = comp(pass.max, pass.axis) - comp(pass.min, pass.axis) + 1;
  for (const gi of gridRange(comp(pass.min, pass.u), comp(pass.max, pass.u), s))
    for (const gj of gridRange(comp(pass.min, pass.v), comp(pass.max, pass.v), s)) {
      let base = withComp(v3(0, 0, 0), pass.u, (gi + 0.5) * s);
      base = withComp(base, pass.v, (gj + 0.5) * s);
      let t = 0;
      for (let guard = 0; t < total && guard < 64; guard++) {
        const o = withComp(base, pass.axis, startA + downSign * t);
        const hit = rays.raycast(o, pass.down, total - t);
        if (!hit) break;
        const box = level.boxes[hit.box];
        if (hit.t > 0) {
          const hb = rayBox(box, o, pass.down, total - t + 1, 0);
          const normal = hb ? hb.normal : pass.up;
          if (dot(normal, pass.up) >= cosLimit) {
            const feet = madd(o, pass.down, hit.t);
            const cap = standingCapsule(an, feet, pass.up);
            if (!capsuleOverlaps(level, cap)) {
              const g = gravityDirAt(an.ctx, an.world, cap.center);
              const ok = pass.zeroG
                ? isZeroG(g)
                : !isZeroG(g) && dot(normalize(g), pass.down) > 0.999;
              if (ok)
                an.samples.push(
                  makeSample(an, pass.kind, pass.id, gi, gj, feet, pass.up, box.index),
                );
            }
          }
        }
        const exit = rayBoxExit(box, o, pass.down);
        t += Math.max(exit, hit.t) + 1e-3;
      }
    }
};

/** Floating points inside zero-G zones (a free-floating player's eye). */
const sampleFloats = (an: Analyzer, floatPass: number): void => {
  const s = an.opts.floatSpacing;
  if (s <= 0) return;
  const up = v3(0, 1, 0);
  const st = an.stand;
  an.level.zones.forEach((z) => {
    if (!isZeroG(z.gravity)) return;
    for (const gi of gridRange(z.min.x + 0.5, z.max.x - 0.5, s))
      for (const gk of gridRange(z.min.y + 0.5, z.max.y - 0.5, s))
        for (const gj of gridRange(z.min.z + 0.5, z.max.z - 0.5, s)) {
          const p = v3((gi + 0.5) * s, (gk + 0.5) * s, (gj + 0.5) * s);
          if (!isZeroG(gravityDirAt(an.ctx, an.world, p))) continue;
          const cap: Capsule = { center: p, up, halfSeg: 0, radius: st.height / 2 };
          if (capsuleOverlaps(an.level, cap)) continue;
          const feet = madd(p, up, -st.eye);
          const smp = makeSample(an, 'float', floatPass, gi, gj, feet, up, -1);
          an.samples.push(smp);
        }
  });
};

/** The body's up at p (against gravity; +y in zero-G). */
const upAt = (an: Analyzer, p: Vec3): Vec3 => {
  const g = gravityDirAt(an.ctx, an.world, p);
  return isZeroG(g) ? v3(0, 1, 0) : scale(normalize(g), -1);
};

/**
 * Which samples a player can actually get to: flood fill from the spawns and the bot waypoints
 * (the waypoint graph covers every lane, including the drops into gravity zones), walking
 * between grid neighbours (steps, climbs up to jump + mantle height, drops), across gravity
 * boundaries between nearby samples, and freely inside zero-G zones.
 */
const markReachable = (an: Analyzer): void => {
  const { samples, rays, level } = an;
  const m = an.game.movement;
  const maxClimb = m.climbMaxHeight + m.jumpHeight;
  const edges: number[][] = samples.map(() => []);
  const passOf = (sm: Sample) => an.passes[sm.pass];
  // same-pass grid neighbours
  for (const a of samples) {
    const pa = passOf(a);
    if (pa.zeroG || a.kind === 'float') continue;
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        if (di === 0 && dj === 0) continue;
        const col = an.columns.get(colKey(a.pass, a.gi + di, a.gj + dj));
        if (!col) continue;
        for (const bi of col) {
          const b = samples[bi];
          const dh = dot(sub(b.feet, a.feet), a.up);
          if (Math.abs(dh) <= m.stepHeight) {
            if (rays.los(a.centre, b.centre)) edges[a.id].push(b.id);
          } else if (dh > 0) {
            if (dh > maxClimb) continue;
            const cap = standingCapsule(an, madd(a.feet, a.up, dh), a.up);
            // the way up must be clear too (not just the top): no climbing through a thin
            // ceiling onto the roof above it
            if (
              !capsuleOverlaps(level, cap) &&
              rays.los(a.centre, cap.center) &&
              rays.los(cap.center, b.centre)
            )
              edges[a.id].push(b.id);
          } else {
            const cap = standingCapsule(an, madd(b.feet, b.up, -dh), b.up);
            if (!capsuleOverlaps(level, cap) && rays.los(a.centre, cap.center))
              edges[a.id].push(b.id);
          }
        }
      }
  }
  // across passes (e.g. floor ↔ wall-walk surface at a gravity boundary)
  const hash = new Map<string, number[]>();
  const hk = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const cellOf = (p: Vec3) => [Math.floor(p.x / 2), Math.floor(p.y / 2), Math.floor(p.z / 2)];
  for (const s of samples) {
    const [x, y, z] = cellOf(s.centre);
    const k = hk(x, y, z);
    let l = hash.get(k);
    if (!l) hash.set(k, (l = []));
    l.push(s.id);
  }
  for (const a of samples) {
    if (a.kind === 'float') continue;
    const [x, y, z] = cellOf(a.centre);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const l = hash.get(hk(x + dx, y + dy, z + dz));
          if (!l) continue;
          for (const bi of l) {
            const b = samples[bi];
            if (b.pass === a.pass || b.kind === 'float') continue;
            if (a.zone === b.zone && passOf(a).zeroG && passOf(b).zeroG) continue;
            const r = 1.5 * Math.max(passOf(a).spacing, passOf(b).spacing);
            if (dist(a.centre, b.centre) <= r && rays.los(a.centre, b.centre))
              edges[a.id].push(b.id);
          }
        }
  }
  // zero-G zones: everything inside one zone is reachable from anywhere in it
  const zeroGroups = new Map<number, number[]>();
  for (const s of samples)
    if (s.kind === 'mag' || s.kind === 'float') {
      let l = zeroGroups.get(s.zone);
      if (!l) zeroGroups.set(s.zone, (l = []));
      l.push(s.id);
    }
  // seeds: spawns and waypoints
  const seeds: number[] = [];
  /** nearest sample to p (feet or body centre) that the point `eye` sees */
  const nearest = (p: Vec3, eye: Vec3, maxD: number, useCentre: boolean): number => {
    let best = -1;
    let bd = maxD;
    for (const s of samples) {
      const d = dist(useCentre ? s.centre : s.feet, p);
      if (d < bd && rays.los(eye, s.centre)) {
        bd = d;
        best = s.id;
      }
    }
    return best;
  };
  for (const sp of level.def.spawns) {
    // a spawn position is the feet, exactly on the floor, where a ray counts as inside the floor
    // box: look from the body centre instead
    const up = upAt(an, add(sp.pos, v3(0, 1, 0)));
    const i = nearest(sp.pos, madd(sp.pos, up, m.standHeight / 2), 2.5, false);
    if (i >= 0) seeds.push(i);
  }
  for (const w of level.def.waypoints ?? []) {
    const i = nearest(w.pos, w.pos, 3, true);
    if (i >= 0) seeds.push(i);
  }
  const queue: number[] = [];
  const reach = (i: number) => {
    if (samples[i].reachable) return;
    samples[i].reachable = true;
    queue.push(i);
    const g = samples[i];
    if (g.kind === 'mag' || g.kind === 'float') {
      for (const j of zeroGroups.get(g.zone) ?? []) {
        if (!samples[j].reachable) {
          samples[j].reachable = true;
          queue.push(j);
        }
      }
    }
  };
  for (const s of seeds) reach(s);
  for (let qi = 0; qi < queue.length; qi++) for (const j of edges[queue[qi]]) reach(j);
};

export interface SampleSummary {
  candidates: number;
  reachable: number;
  unreachable: number;
  byKind: Record<SampleKind, number>;
  byRegion: { region: string; count: number }[];
}

/** Find every walkable sample (see the conventions at the top of this file). */
export const findSamples = (an: Analyzer): SampleSummary => {
  an.passes = makePasses(an);
  an.samples = [];
  for (const p of an.passes) samplePass(an, p);
  const floatPass = an.passes.length;
  an.passes.push({
    id: floatPass,
    kind: 'float',
    axis: 1,
    down: v3(0, -1, 0),
    up: v3(0, 1, 0),
    u: 0,
    v: 2,
    min: an.level.def.boundsMin,
    max: an.level.def.boundsMax,
    spacing: an.opts.floatSpacing,
    zeroG: true,
    zone: -1,
  });
  sampleFloats(an, floatPass);
  an.columns = new Map();
  for (const s of an.samples) {
    const k = colKey(s.pass, s.gi, s.gj);
    let l = an.columns.get(k);
    if (!l) an.columns.set(k, (l = []));
    l.push(s.id);
  }
  markReachable(an);
  const ok = an.samples.filter((s) => s.reachable);
  const byKind: Record<SampleKind, number> = { floor: 0, gravity: 0, mag: 0, float: 0 };
  for (const s of ok) byKind[s.kind]++;
  return {
    candidates: an.samples.length,
    reachable: ok.length,
    unreachable: an.samples.length - ok.length,
    byKind,
    byRegion: countBy(ok.map((s) => regionName(an, s.region))),
  };
};

/** grid index counted outward from 0 on both sides, so strides stay mirror-symmetric */
const fromCentre = (g: number): number => (g >= 0 ? g : -1 - g);

const onStride = (an: Analyzer, s: Sample, stride: number): boolean =>
  stride <= 1 ||
  s.kind === 'float' ||
  (fromCentre(s.gi) % stride === 0 && fromCentre(s.gj) % stride === 0);

const reachableSamples = (an: Analyzer, stride = 1): Sample[] =>
  an.samples.filter((s) => s.reachable && onStride(an, s, stride));

/**
 * A metric measured only on every n-th grid spot: give each skipped spot (for which `want`
 * is true) the value of the nearest measured spot on the same surface, for smooth heat maps.
 */
export const fillStride = (
  an: Analyzer,
  layer: Float32Array,
  stride: number,
  want: (s: Sample) => boolean,
): void => {
  if (stride <= 1) return;
  const src = layer.slice();
  for (const s of an.samples) {
    if (!s.reachable || !Number.isNaN(src[s.id]) || !want(s)) continue;
    let best = NaN;
    let bd = Infinity;
    for (let di = 1 - stride; di < stride; di++)
      for (let dj = 1 - stride; dj < stride; dj++)
        for (const id of an.columns.get(colKey(s.pass, s.gi + di, s.gj + dj)) ?? []) {
          if (Number.isNaN(src[id])) continue;
          const o = an.samples[id];
          if (Math.abs(dot(sub(o.feet, s.feet), s.up)) > 1) continue;
          const d = dist(o.feet, s.feet);
          if (d < bd) {
            bd = d;
            best = src[id];
          }
        }
    layer[s.id] = best;
  }
};

/** Connected groups of the given spots (grid neighbours on one surface, steps ≤ 0.6 m). */
const clusters = (an: Analyzer, ids: Set<number>): Sample[][] => {
  const seenIds = new Set<number>();
  const out: Sample[][] = [];
  for (const id of [...ids].sort((a, b) => a - b)) {
    if (seenIds.has(id)) continue;
    const group: Sample[] = [];
    const stack = [id];
    seenIds.add(id);
    while (stack.length) {
      const s = an.samples[stack.pop()!];
      group.push(s);
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++)
          for (const j of an.columns.get(colKey(s.pass, s.gi + di, s.gj + dj)) ?? []) {
            if (!ids.has(j) || seenIds.has(j)) continue;
            if (Math.abs(dot(sub(an.samples[j].feet, s.feet), s.up)) > 0.6) continue;
            seenIds.add(j);
            stack.push(j);
          }
    }
    out.push(group);
  }
  return out;
};

/** The regions a group of spots covers, most spots first (at most three, joined by " + "). */
const regionsOf = (an: Analyzer, group: Sample[]): string =>
  countBy(group.map((s) => regionName(an, s.region)))
    .slice(0, 3)
    .map((r) => r.region)
    .join(' + ');

/** Centroid and extent of a group of spots. */
const extent = (group: Sample[]): { c: Vec3; min: Vec3; max: Vec3 } => {
  const c = scale(
    group.reduce((acc, s) => add(acc, s.feet), v3()),
    1 / group.length,
  );
  const min = v3(Infinity, Infinity, Infinity);
  const max = v3(-Infinity, -Infinity, -Infinity);
  for (const s of group) {
    min.x = Math.min(min.x, s.feet.x);
    min.y = Math.min(min.y, s.feet.y);
    min.z = Math.min(min.z, s.feet.z);
    max.x = Math.max(max.x, s.feet.x);
    max.y = Math.max(max.y, s.feet.y);
    max.z = Math.max(max.z, s.feet.z);
  }
  return { c, min, max };
};

/** A reachable floor (normal gravity) sample close to `p`, if any. */
export const floorSampleNear = (an: Analyzer, p: Vec3, maxDy = 0.6): Sample | null => {
  const pass = an.passes.find((q) => q.kind === 'floor' && q.zone === -1);
  if (!pass) return null;
  const s = pass.spacing;
  const gi = Math.round(p.x / s - 0.5);
  const gj = Math.round(p.z / s - 0.5);
  let best: Sample | null = null;
  let bd = 0.75 * s + 0.1;
  for (let di = -1; di <= 1; di++)
    for (let dj = -1; dj <= 1; dj++)
      for (const id of an.columns.get(colKey(pass.id, gi + di, gj + dj)) ?? []) {
        const c = an.samples[id];
        if (!c.reachable || Math.abs(c.feet.y - p.y) > maxDy) continue;
        const d = Math.hypot(c.feet.x - p.x, c.feet.z - p.z);
        if (d <= bd) {
          bd = d;
          best = c;
        }
      }
  return best;
};

// ------------------------------------------------------------------------------------------
// 2. route timings (bot waypoint graph)

export interface Timing {
  dist: number;
  time: number;
}

export interface LaneTiming {
  lane: string;
  team: Team;
  toMid: Timing | null;
  toEnemyTower: Timing | null;
}

export interface ChokeTiming {
  name: string;
  side: Team;
  lane: string;
  final: boolean;
  pos: Vec3;
  width: number;
  height: number;
  defender: Timing | null;
  attacker: Timing | null;
  /** attacker time − defender time (s); positive = defenders arrive first */
  lead: number | null;
}

export interface RouteReport {
  available: boolean;
  sprintSpeed: number;
  /** each team starts at its spawn centroid and joins the graph at any waypoint it can see */
  starts: { team: Team; spawnCentroid: Vec3; entries: { waypoint: Vec3; offset: number }[] }[];
  lanes: LaneTiming[];
  chokes: ChokeTiming[];
  mirror: { ok: boolean; issues: string[] };
}

const pathLength = (wps: WaypointDef[], route: number[]): number => {
  let d = 0;
  for (let i = 1; i < route.length; i++) d += dist(wps[route[i - 1]].pos, wps[route[i]].pos);
  return d;
};

/** All shortest distances from `from` over the waypoint graph (Euclidean link lengths). */
export const waypointDistances = (wps: WaypointDef[], from: number): number[] => {
  const n = wps.length;
  const d = new Array<number>(n).fill(Infinity);
  const done = new Array<boolean>(n).fill(false);
  d[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && d[i] < Infinity && (u < 0 || d[i] < d[u])) u = i;
    if (u < 0) break;
    done[u] = true;
    for (const v of wps[u].links) {
      const nd = d[u] + dist(wps[u].pos, wps[v].pos);
      if (nd < d[v]) d[v] = nd;
    }
  }
  return d;
};

const withoutNodes = (wps: WaypointDef[], blocked: number[]): WaypointDef[] =>
  wps.map((w, i) => ({
    ...w,
    links: blocked.includes(i) ? [] : w.links.filter((l) => !blocked.includes(l)),
  }));

const nearestWaypointTo = (an: Analyzer, wps: WaypointDef[], p: Vec3): number => {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < wps.length; i++) {
    const d = dist(wps[i].pos, p);
    if (d < bd && an.rays.los(p, wps[i].pos)) {
      bd = d;
      best = i;
    }
  }
  if (best < 0)
    for (let i = 0; i < wps.length; i++) {
      const d = dist(wps[i].pos, p);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
  return best;
};

/** The opening (width × height) with the smallest cross-section within 6 m of the chokepoint. */
const opening = (an: Analyzer, c: ChokepointDef): { width: number; height: number } => {
  const across = c.across === 'x' ? v3(1, 0, 0) : v3(0, 0, 1);
  const along = c.across === 'x' ? v3(0, 0, 1) : v3(1, 0, 0);
  let best = { width: Infinity, height: Infinity };
  for (let o = -6; o <= 6; o += 0.5) {
    const p = madd(c.pos, along, o);
    const inside = an.rays.raycast(p, across, 0.01);
    if (inside && inside.t === 0) continue;
    const w = an.rays.distance(p, across, 60) + an.rays.distance(p, scale(across, -1), 60);
    const h = an.rays.distance(p, v3(0, 1, 0), 60) + an.rays.distance(p, v3(0, -1, 0), 60);
    if (w * h < best.width * best.height - 1e-6) best = { width: w, height: h };
  }
  return { width: r1(best.width), height: r1(best.height) };
};

export const routeTimings = (an: Analyzer): RouteReport => {
  const def = an.level.def;
  const wps = def.waypoints ?? [];
  const speed = an.game.movement.sprintSpeed;
  const report: RouteReport = {
    available: wps.length > 1,
    sprintSpeed: speed,
    starts: [],
    lanes: [],
    chokes: [],
    mirror: { ok: true, issues: [] },
  };
  if (!report.available) return report;
  const timing = (d: number): Timing | null =>
    Number.isFinite(d) ? { dist: r1(d), time: r2(d / speed) } : null;
  // entry waypoints: every waypoint within 20 m in plain view of the spawn centroid
  const starts: { idx: number; offset: number }[][] = [];
  for (const team of [0, 1] as const) {
    const sp = def.spawns.filter((s) => s.team === team);
    const c = scale(
      sp.reduce((acc, s) => add(acc, s.pos), v3()),
      1 / Math.max(1, sp.length),
    );
    const centroid = add(c, v3(0, 1, 0));
    let entries = wps
      .map((w, idx) => ({ idx, offset: dist(centroid, w.pos) }))
      .filter((e) => e.offset <= 20 && an.rays.los(centroid, wps[e.idx].pos));
    if (entries.length === 0) {
      const idx = nearestWaypointTo(an, wps, centroid);
      entries = [{ idx, offset: dist(centroid, wps[idx].pos) }];
    }
    starts.push(entries);
    report.starts.push({
      team,
      spawnCentroid: rp(c),
      entries: entries.map((e) => ({ waypoint: rp(wps[e.idx].pos), offset: r1(e.offset) })),
    });
  }
  /** shortest start → node route length in graph g */
  const routeLen = (g: WaypointDef[], team: Team, node: number): number => {
    let best = Infinity;
    for (const e of starts[team]) {
      const r = waypointRoute(g, e.idx, node);
      if (!r.length) continue;
      best = Math.min(best, e.offset + pathLength(g, r));
    }
    return best;
  };
  const nodeAt = (p: { x: number; z: number }): number => {
    let best = -1;
    let bd = 1.5;
    wps.forEach((w, i) => {
      const d = Math.hypot(w.pos.x - p.x, w.pos.z - p.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  const laneNodes = an.config.lanes.map((l) => nodeAt(l.centre));
  /** every waypoint of a lane's middle (closed while timing the other lanes) */
  const laneMids = an.config.lanes.map((l, i) =>
    [laneNodes[i], ...(l.alsoBlock ?? []).map(nodeAt)].filter((n) => n >= 0),
  );
  const towerNode = (team: Team): number => {
    const t = def.towers.find((tw) => tw.team === team);
    return t ? nearestWaypointTo(an, wps, add(t.pos, v3(0, 1, 0))) : -1;
  };
  const towerGap = (team: Team, node: number): number => {
    const t = def.towers.find((tw) => tw.team === team);
    if (!t || node < 0) return 0;
    return Math.max(0, Math.hypot(wps[node].pos.x - t.pos.x, wps[node].pos.z - t.pos.z) - t.radius);
  };
  an.config.lanes.forEach((lane, li) => {
    const node = laneNodes[li];
    const blocked = laneMids.filter((_, j) => j !== li).flat();
    const g = withoutNodes(wps, blocked);
    for (const team of [0, 1] as const) {
      let toMid: Timing | null = null;
      let toTower: Timing | null = null;
      if (node >= 0) {
        const mid = routeLen(g, team, node);
        toMid = timing(mid);
        const enemy = (1 - team) as Team;
        const tn = towerNode(enemy);
        // spawn → this lane's middle → the enemy Tower (the other lanes' middles closed)
        const on = tn >= 0 ? waypointRoute(g, node, tn) : [];
        if (on.length) toTower = timing(mid + pathLength(g, on) + towerGap(enemy, tn));
      }
      report.lanes.push({ lane: lane.name, team, toMid, toEnemyTower: toTower });
    }
  });
  const distFrom = starts.map((entries) => {
    const d = new Array<number>(wps.length).fill(Infinity);
    for (const e of entries)
      waypointDistances(wps, e.idx).forEach((x, i) => (d[i] = Math.min(d[i], x + e.offset)));
    return d;
  });
  const toPoint = (team: Team, p: Vec3): number => {
    let best = Infinity;
    wps.forEach((w, i) => {
      const d = dist(w.pos, p);
      if (d > 30 || !Number.isFinite(distFrom[team][i])) return;
      if (distFrom[team][i] + d < best && an.rays.los(w.pos, p)) best = distFrom[team][i] + d;
    });
    return best;
  };
  for (const c of an.config.chokepoints) {
    const def0 = timing(toPoint(c.side, c.pos));
    const att = timing(toPoint((1 - c.side) as Team, c.pos));
    const o = opening(an, c);
    report.chokes.push({
      name: c.name,
      side: c.side,
      lane: c.lane,
      final: !!c.final,
      pos: rp(c.pos),
      width: o.width,
      height: o.height,
      defender: def0,
      attacker: att,
      lead: def0 && att ? r2(att.time - def0.time) : null,
    });
  }
  // mirror check: both teams should need the same time for mirrored targets (asymmetric maps
  // are balanced with measured routes instead: see timing.ts)
  if (!an.config.mirrorX) return report;
  const eq = (a: Timing | null, b: Timing | null) =>
    (a === null && b === null) || (!!a && !!b && Math.abs(a.time - b.time) <= 0.05);
  for (const lane of an.config.lanes) {
    const [a, b] = [0, 1].map((t) =>
      report.lanes.find((l) => l.lane === lane.name && l.team === t),
    );
    if (!eq(a?.toMid ?? null, b?.toMid ?? null))
      report.mirror.issues.push(
        `${lane.name}: time to mid differs (A ${a?.toMid?.time} s, B ${b?.toMid?.time} s)`,
      );
    if (!eq(a?.toEnemyTower ?? null, b?.toEnemyTower ?? null))
      report.mirror.issues.push(
        `${lane.name}: time to the enemy Tower differs (A ${a?.toEnemyTower?.time} s, B ${b?.toEnemyTower?.time} s)`,
      );
  }
  for (const c of report.chokes) {
    const m = report.chokes.find(
      (o) =>
        o.side !== c.side && Math.abs(o.pos.x + c.pos.x) < 0.2 && Math.abs(o.pos.z - c.pos.z) < 0.2,
    );
    if (!m) continue;
    if (c.side === 0 && (!eq(c.defender, m.defender) || !eq(c.attacker, m.attacker)))
      report.mirror.issues.push(`${c.name}: timings differ from its mirror ${m.name}`);
  }
  report.mirror.ok = report.mirror.issues.length === 0;
  return report;
};

// ------------------------------------------------------------------------------------------
// 3. sightlines

export const SHORT = 15;
export const LONG = 35;

export interface SightStats {
  /** region name, lane label or "all" */
  region: string;
  samples: number;
  meanMax: number;
  maxMax: number;
  /** samples whose longest sightline is short (<15 m) / medium / long (>35 m) */
  maxClass: [number, number, number];
  /** share of all rays (%) that are short / medium / long */
  rayPct: [number, number, number];
  /** share of all rays (%) per histogram bin (see SightReport.edges) */
  hist: number[];
  /** number of spots whose longest sightline falls in each histogram bin */
  longestHist: number[];
}

export interface Sightline {
  from: Vec3;
  to: Vec3;
  length: number;
  fromRegion: string;
  toRegion: string;
  /** region at the middle of the line (tells apart parallel corridors) */
  via: string;
}

export interface SightEdge {
  at: number;
  /** why this bin edge matters (weapon reach, fog), empty for plain steps */
  note: string;
}

export interface SightReport {
  rays: number;
  samples: number;
  /** histogram bin edges (m): bin i = [edges[i-1], edges[i]) */
  edges: SightEdge[];
  perRegion: SightStats[];
  /** the same numbers grouped by lane (main hall, north, south, connectors, bases) */
  perLane: SightStats[];
  overall: SightStats;
  longest: Sightline[];
}

/**
 * Histogram bin edges for sightline lengths: fixed steps plus the ranges that matter in this
 * game — how far a Quick Throw flies before it turns back, the Wind-up Throw range, and the
 * distance where the map's fog hides everything.
 */
export const sightEdges = (an: Analyzer): SightEdge[] => {
  const c = an.game.combat;
  const notes = new Map<number, string>();
  const put = (at: number, note: string) => {
    const k = Math.round(at);
    if (k > 0 && k < an.opts.maxSight)
      notes.set(k, notes.get(k) ? `${notes.get(k)}; ${note}` : note);
  };
  for (const at of [10, 35, 60, 90]) put(at, '');
  put(c.quickSpeed * c.quickOutSec, "the Quick Throw's turn-back point");
  put(c.windupRange, "the Wind-up Throw's range");
  const fog = an.level.def.fog;
  if (fog) put(fog.far, 'the fog limit');
  return [...notes.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([at, note]) => ({ at, note: note.replace(/^; /, '') }));
};

/**
 * Name of the region that mirrors `name` across x = 0 (same box with x flipped); the name
 * itself for regions that are their own mirror image or have none.
 */
export const mirroredRegionName = (config: MapAnalysisConfig, name: string): string => {
  const r = config.regions.find((x) => x.name === name);
  if (!r) return name;
  const eq = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const m = config.regions.find(
    (x) =>
      eq(x.min.x, -r.max.x) &&
      eq(x.max.x, -r.min.x) &&
      eq(x.min.y, r.min.y) &&
      eq(x.max.y, r.max.y) &&
      eq(x.min.z, r.min.z) &&
      eq(x.max.z, r.max.z),
  );
  return m ? m.name : name;
};

/** Lane label for a region's lane key (config.laneLabels, else the key itself). */
export const laneLabel = (config: MapAnalysisConfig, lane: string): string =>
  config.laneLabels?.[lane] ?? lane;

/**
 * About n unit (cos, sin) pairs evenly around a circle, built from one octant by swapping and
 * flipping signs, so the set is exactly mirror-symmetric (mirrored maps give mirrored numbers).
 */
export const circle = (n: number, offsetSteps = 0): [number, number][] => {
  const step = (2 * Math.PI) / n;
  const out = new Map<string, [number, number]>();
  for (let k = 0; (k + offsetSteps) * step <= Math.PI / 4 + 1e-9; k++) {
    const a = (k + offsetSteps) * step;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (const [x, y] of [
      [c, s],
      [s, c],
    ])
      for (const sx of [1, -1])
        for (const sy of [1, -1]) {
          const p: [number, number] = [sx * x, sy * y];
          out.set(`${p[0].toFixed(9)},${p[1].toFixed(9)}`, p);
        }
  }
  return [...out.values()].sort((p, q) => Math.atan2(p[1], p[0]) - Math.atan2(q[1], q[0]));
};

const rayDirections = (an: Analyzer, up: Vec3): Vec3[] => {
  const [t1, t2] = tangents(up);
  const out: Vec3[] = [];
  for (const [c, s] of circle(an.opts.sightRays)) out.push(add(scale(t1, c), scale(t2, s)));
  const np = Math.max(8, Math.round(an.opts.sightRays / 3));
  for (const pd of an.opts.sightPitchDeg) {
    const p = (pd * Math.PI) / 180;
    for (const [c, s] of circle(np, 0.5)) {
      const h = add(scale(t1, c), scale(t2, s));
      out.push(add(scale(h, Math.cos(p)), scale(up, Math.sin(p))));
    }
  }
  return out;
};

export const sightlines = (an: Analyzer, maxSight: Float32Array): SightReport => {
  const opts = an.opts;
  const edges = sightEdges(an);
  const nb = edges.length + 1;
  const binOf = (d: number) => {
    let i = 0;
    while (i < edges.length && d >= edges[i].at) i++;
    return i;
  };
  const dirCache = new Map<string, Vec3[]>();
  const dirsFor = (up: Vec3) => {
    const k = `${up.x},${up.y},${up.z}`;
    let d = dirCache.get(k);
    if (!d) dirCache.set(k, (d = rayDirections(an, up)));
    return d;
  };
  type Acc = {
    n: number;
    sum: number;
    max: number;
    mc: number[];
    rc: number[];
    h: number[];
    lh: number[];
  };
  const acc = new Map<string, Acc>();
  const get = (name: string): Acc => {
    let a = acc.get(name);
    if (!a)
      acc.set(
        name,
        (a = {
          n: 0,
          sum: 0,
          max: 0,
          mc: [0, 0, 0],
          rc: [0, 0, 0],
          h: new Array<number>(nb).fill(0),
          lh: new Array<number>(nb).fill(0),
        }),
      );
    return a;
  };
  const cls = (d: number) => (d < SHORT ? 0 : d <= LONG ? 1 : 2);
  const tops: { s: Sample; d: number; dir: Vec3 }[] = [];
  let rayCount = 0;
  let sampleCount = 0;
  maxSight.fill(NaN);
  for (const s of reachableSamples(an, opts.sightStride)) {
    const dirs = dirsFor(s.up);
    let best = 0;
    let bestDir = dirs[0];
    const region = s.region >= 0 ? an.config.regions[s.region] : null;
    const targets = [
      get(`r:${region ? region.name : 'other'}`),
      get(`l:${region ? region.lane : 'other'}`),
      get('*'),
    ];
    for (const d of dirs) {
      const h = an.rays.distance(s.eye, d, opts.maxSight);
      rayCount++;
      const c = cls(h);
      const b = binOf(h);
      for (const x of targets) {
        x.rc[c]++;
        x.h[b]++;
      }
      if (h > best) {
        best = h;
        bestDir = d;
      }
    }
    sampleCount++;
    maxSight[s.id] = best;
    for (const x of targets) {
      x.n++;
      x.sum += best;
      x.max = Math.max(x.max, best);
      x.mc[cls(best)]++;
      x.lh[binOf(best)]++;
    }
    tops.push({ s, d: best, dir: bestDir });
  }
  const stats = (region: string, x: Acc): SightStats => {
    const rt = x.rc[0] + x.rc[1] + x.rc[2];
    return {
      region,
      samples: x.n,
      meanMax: r1(x.n ? x.sum / x.n : 0),
      maxMax: r1(x.max),
      maxClass: [x.mc[0], x.mc[1], x.mc[2]],
      rayPct: [pct(x.rc[0], rt), pct(x.rc[1], rt), pct(x.rc[2], rt)],
      hist: x.h.map((v) => pct(v, rt)),
      longestHist: x.lh.slice(),
    };
  };
  // Longest distinct sightlines: each sample's longest ray, skipping near-duplicates (the same
  // line seen from a nearby spot or from its other end), lines between the same two regions
  // through the same middle region (parallel copies), and mirror images on mirrored maps.
  tops.sort((p, q) => q.d - p.d || p.s.id - q.s.id);
  const longest: Sightline[] = [];
  const keys = new Set<string>();
  const mirror = (p: Vec3) => v3(-p.x, p.y, p.z);
  const near = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, tol: number) =>
    (dist(a, c) < tol && dist(b, d) < tol) || (dist(a, d) < tol && dist(b, c) < tol);
  /** distance from p to the segment a–b */
  const toSeg = (p: Vec3, a: Vec3, b: Vec3) => {
    const ab = sub(b, a);
    const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / Math.max(1e-9, dot(ab, ab))));
    return dist(p, madd(a, ab, t));
  };
  /** c–d lies along a–b (a shorter piece of the same line) */
  const inside = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) =>
    toSeg(c, a, b) < 1.5 && toSeg(d, a, b) < 1.5;
  /** c–d runs next to a–b: nearly parallel (< 4°), within 8 m, overlapping for most of c–d */
  const alongside = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => {
    const lab = dist(a, b);
    const u = scale(sub(b, a), 1 / Math.max(1e-9, lab));
    const w = sub(d, c);
    const lcd = len(w);
    if (Math.abs(dot(u, w)) < Math.cos((4 * Math.PI) / 180) * lcd) return false;
    const off = (p: Vec3) => {
      const q = sub(p, a);
      return len(madd(q, u, -dot(q, u)));
    };
    if (off(c) > 8 || off(d) > 8) return false;
    const [p0, p1] = [dot(sub(c, a), u), dot(sub(d, a), u)].sort((x, y) => x - y);
    return Math.min(p1, lab) - Math.max(p0, 0) > 0.5 * lcd;
  };
  for (const t of tops) {
    if (longest.length >= 12) break;
    const to = madd(t.s.eye, t.dir, t.d);
    const dup = longest.some((l) => {
      const tol = Math.max(8, 0.12 * Math.min(l.length, t.d));
      const same = (a: Vec3, b: Vec3) =>
        near(a, b, t.s.eye, to, tol) || inside(a, b, t.s.eye, to) || alongside(a, b, t.s.eye, to);
      return same(l.from, l.to) || (!!an.config.mirrorX && same(mirror(l.from), mirror(l.to)));
    });
    if (dup) continue;
    const toIn = madd(t.s.eye, t.dir, Math.max(0, t.d - 1));
    const fromRegion = regionName(an, t.s.region);
    const toRegion = regionName(an, regionIndexOf(an.config, toIn));
    const via = regionName(an, regionIndexOf(an.config, madd(t.s.eye, t.dir, t.d / 2)));
    const key = [fromRegion, toRegion].sort().join('|') + `|${via}`;
    if (keys.has(key)) continue;
    keys.add(key);
    if (an.config.mirrorX) {
      const m = (n: string) => mirroredRegionName(an.config, n);
      keys.add([m(fromRegion), m(toRegion)].sort().join('|') + `|${m(via)}`);
    }
    longest.push({
      from: rp(t.s.eye),
      to: rp(to),
      length: r1(t.d),
      fromRegion,
      toRegion,
      via,
    });
  }
  const group = (prefix: string, label: (k: string) => string) =>
    [...acc.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, x]) => stats(label(k.slice(prefix.length)), x));
  const perRegion = group('r:', (k) => k).sort((p, q) => p.region.localeCompare(q.region));
  const laneOrder = [
    ...new Set([
      ...Object.keys(an.config.laneLabels ?? {}),
      ...an.config.regions.map((r) => r.lane),
    ]),
  ];
  const perLane = group('l:', (k) => k)
    .sort((p, q) => laneOrder.indexOf(p.region) - laneOrder.indexOf(q.region))
    .map((x) => ({ ...x, region: laneLabel(an.config, x.region) }));
  return {
    rays: rayCount,
    samples: sampleCount,
    edges,
    perRegion,
    perLane,
    overall: stats('all', get('*')),
    longest,
  };
};

// ------------------------------------------------------------------------------------------
// 4. spawn safety

export interface SpawnSpot {
  dist: number;
  pos: Vec3;
  region: string;
}

export interface SpawnExposure {
  team: Team;
  pos: Vec3;
  /** reachable samples outside the team's base with eye-to-eye line of sight to this spawn */
  exposedBy: number;
  /** of those, samples on the enemy half or in the shared middle */
  fromEnemySide: number;
  closest: SpawnSpot | null;
  /** closest sample on the enemy half or in the shared middle that sees this spawn */
  closestEnemySide: SpawnSpot | null;
  farthest: SpawnSpot | null;
  byRegion: { region: string; count: number }[];
  /** enemy spawns with line of sight to this one */
  enemySpawnsSee: number;
}

export interface SpawnPair {
  /** a spawn of team A and a spawn of team B whose standing eyes see each other */
  a: Vec3;
  b: Vec3;
  dist: number;
}

export interface SpawnReport {
  spawns: SpawnExposure[];
  teams: {
    team: Team;
    spawns: number;
    exposedSpawns: number;
    exposingSamples: number;
    /** of those, samples on the enemy half or in the shared middle */
    exposingFromEnemySide: number;
    byRegion: { region: string; count: number }[];
  }[];
  spawnPairsWithSight: number;
  pairs: SpawnPair[];
}

/** Which team's half a sample is on (null = shared middle or no region). */
const sideOf = (an: Analyzer, s: Sample): Team | null =>
  s.region >= 0 ? an.config.regions[s.region].side : null;

/**
 * Spawn safety: for every spawn point, the reachable spots outside that team's base whose eye
 * sees the spawn's standing eye (and which of them are on the enemy half or in the middle),
 * plus every pair of opposing spawns that see each other.
 */
export const spawnSafety = (an: Analyzer, exposure: Uint16Array): SpawnReport => {
  const def = an.level.def;
  const samples = reachableSamples(an);
  const eyes = def.spawns.map((s) => madd(s.pos, upAt(an, add(s.pos, v3(0, 1, 0))), an.stand.eye));
  const out: SpawnExposure[] = [];
  const teamSets = [new Set<number>(), new Set<number>()];
  exposure.fill(0);
  def.spawns.forEach((sp, i) => {
    const team = (sp.team ?? 0) as Team;
    const eye = eyes[i];
    let n = 0;
    let enemySide = 0;
    let closest: SpawnSpot | null = null;
    let closestEnemy: SpawnSpot | null = null;
    let farthest: SpawnSpot | null = null;
    const regions: string[] = [];
    for (const s of samples) {
      const rn = regionName(an, s.region);
      if (rn === an.config.baseRegion[team]) continue;
      if (!an.rays.los(s.eye, eye)) continue;
      n++;
      exposure[s.id]++;
      teamSets[team].add(s.id);
      const d = dist(s.eye, eye);
      regions.push(rn);
      const spot = { dist: d, pos: s.feet, region: rn };
      if (!closest || d < closest.dist) closest = spot;
      if (!farthest || d > farthest.dist) farthest = spot;
      if (sideOf(an, s) !== team) {
        enemySide++;
        if (!closestEnemy || d < closestEnemy.dist) closestEnemy = spot;
      }
    }
    const enemySee = def.spawns.filter(
      (o, j) => (o.team ?? 0) !== team && an.rays.los(eyes[j], eye),
    ).length;
    const fmt = (c: SpawnSpot | null) =>
      c ? { dist: r1(c.dist), pos: rp(c.pos), region: c.region } : null;
    out.push({
      team,
      pos: rp(sp.pos),
      exposedBy: n,
      fromEnemySide: enemySide,
      closest: fmt(closest),
      closestEnemySide: fmt(closestEnemy),
      farthest: fmt(farthest),
      byRegion: countBy(regions),
      enemySpawnsSee: enemySee,
    });
  });
  const teams = ([0, 1] as const).map((team) => ({
    team,
    spawns: out.filter((s) => s.team === team).length,
    exposedSpawns: out.filter((s) => s.team === team && s.exposedBy > 0).length,
    exposingSamples: teamSets[team].size,
    exposingFromEnemySide: [...teamSets[team]].filter((id) => sideOf(an, an.samples[id]) !== team)
      .length,
    byRegion: countBy([...teamSets[team]].map((id) => regionName(an, an.samples[id].region))),
  }));
  const pairs: SpawnPair[] = [];
  def.spawns.forEach((a, i) =>
    def.spawns.forEach((b, j) => {
      if ((a.team ?? 0) !== 0 || (b.team ?? 0) !== 1) return;
      if (an.rays.los(eyes[i], eyes[j]))
        pairs.push({ a: rp(a.pos), b: rp(b.pos), dist: r1(dist(eyes[i], eyes[j])) });
    }),
  );
  pairs.sort((p, q) => p.dist - q.dist);
  return { spawns: out, teams, spawnPairsWithSight: pairs.length, pairs };
};

// ------------------------------------------------------------------------------------------
// 5. Tower exposure

export interface TowerScoring {
  /** a touch counts within this horizontal distance (m) of the Tower's axis */
  reach: number;
  /** standing spots just inside that distance where a carrier was placed */
  carrierSpots: number;
  /** spots whose eye sees the chest of a carrier standing at any of them */
  seenFrom: number;
  /** of those, spots outside the base the Tower stands in */
  fromOutsideBase: number;
  closestOutsideBase: SpawnSpot | null;
  farthest: SpawnSpot | null;
  byRegion: { region: string; count: number }[];
  /** the same, only the spots outside the base */
  outsideByRegion: { region: string; count: number }[];
}

export interface TowerExposure {
  team: Team;
  pos: Vec3;
  /** samples that can see the Tower's upper half */
  visibleFrom: number;
  tested: number;
  fromOwnHalf: number;
  fromEnemyHalf: number;
  fromShared: number;
  minDist: number | null;
  maxDist: number | null;
  farthest: { pos: Vec3; region: string } | null;
  byRegion: { region: string; count: number }[];
  /** how exposed an enemy carrier is at the moment it touches this Tower */
  scoring: TowerScoring;
}

/**
 * Tower exposure: from which spots the Tower's upper half can be seen, and — what decides a
 * round — from which spots a carrier touching the Tower can be seen (its chest, standing on
 * a ring just inside the touch distance: Tower radius + the rules' touch radius).
 */
export const towerExposure = (an: Analyzer): TowerExposure[] => {
  const samples = reachableSamples(an, an.opts.pairStride);
  const up = v3(0, 1, 0);
  return an.level.def.towers.map((t) => {
    const targets: Vec3[] = [];
    for (const f of [0.625, 0.875])
      for (const [c, s] of circle(8))
        targets.push(v3(t.pos.x + t.radius * c, t.pos.y + t.height * f, t.pos.z + t.radius * s));
    // carrier spots: a ring 0.3 m inside the touch distance, feet on the floor there
    const reach = t.radius + an.game.rules.towerTouchRadius;
    const chests: Vec3[] = [];
    for (const [c, s] of circle(16)) {
      const x = t.pos.x + (reach - 0.3) * c;
      const z = t.pos.z + (reach - 0.3) * s;
      const o = v3(x, t.pos.y + 2, z);
      const h = an.rays.raycast(o, v3(0, -1, 0), 4);
      if (!h || h.t <= 0) continue;
      const feet = v3(x, o.y - h.t, z);
      if (capsuleOverlaps(an.level, standingCapsule(an, feet, up))) continue;
      chests.push(madd(feet, up, an.stand.chest));
    }
    let n = 0;
    let own = 0;
    let enemy = 0;
    let shared = 0;
    let minD = Infinity;
    let maxD = -Infinity;
    let far: TowerExposure['farthest'] = null;
    const regions: string[] = [];
    const base = an.config.baseRegion[t.team];
    let seen = 0;
    let outside = 0;
    let closestOut: SpawnSpot | null = null;
    let farSeen: SpawnSpot | null = null;
    const seenRegions: string[] = [];
    const outsideRegions: string[] = [];
    for (const s of samples) {
      const hd = Math.hypot(s.eye.x - t.pos.x, s.eye.z - t.pos.z);
      const rn = regionName(an, s.region);
      if (chests.some((p) => an.rays.los(s.eye, p))) {
        seen++;
        seenRegions.push(rn);
        const spot = { dist: r1(hd), pos: rp(s.feet), region: rn };
        if (!farSeen || hd > farSeen.dist) farSeen = spot;
        if (rn !== base) {
          outside++;
          outsideRegions.push(rn);
          if (!closestOut || hd < closestOut.dist) closestOut = spot;
        }
      }
      if (hd < t.radius + 0.5) continue;
      if (!targets.some((p) => an.rays.los(s.eye, p))) continue;
      n++;
      const side = sideOf(an, s);
      if (side === t.team) own++;
      else if (side === null) shared++;
      else enemy++;
      regions.push(rn);
      if (hd < minD) minD = hd;
      if (hd > maxD) {
        maxD = hd;
        far = { pos: rp(s.feet), region: rn };
      }
    }
    return {
      team: t.team,
      pos: rp(t.pos),
      visibleFrom: n,
      tested: samples.length,
      fromOwnHalf: own,
      fromEnemyHalf: enemy,
      fromShared: shared,
      minDist: n ? r1(minD) : null,
      maxDist: n ? r1(maxD) : null,
      farthest: far,
      byRegion: countBy(regions),
      scoring: {
        reach: r1(reach),
        carrierSpots: chests.length,
        seenFrom: seen,
        fromOutsideBase: outside,
        closestOutsideBase: closestOut,
        farthest: farSeen,
        byRegion: countBy(seenRegions),
        outsideByRegion: countBy(outsideRegions),
      },
    };
  });
};

// ------------------------------------------------------------------------------------------
// 6. chokepoint coverage

export interface CoverageSpot {
  count: number;
  of: number;
  pos: Vec3;
  region: string;
  sees: string[];
}

export interface CoverageSide {
  side: Team;
  chokes: string[];
  best: CoverageSpot | null;
  /** samples that see every chokepoint of this side */
  seeAll: number;
  finalChokes: string[];
  bestFinal: CoverageSpot | null;
  seeAllFinal: number;
  seeAllFinalByRegion: { region: string; count: number }[];
}

const chokeTargets = (c: ChokepointDef): Vec3[] => {
  const out: Vec3[] = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const o = -c.halfWidth + 0.5 + ((2 * c.halfWidth - 1) * i) / (n - 1);
    for (const dy of [0, 0.6])
      out.push(
        c.across === 'x'
          ? v3(c.pos.x + o, c.pos.y + dy, c.pos.z)
          : v3(c.pos.x, c.pos.y + dy, c.pos.z + o),
      );
  }
  return out;
};

export const chokepointCoverage = (an: Analyzer, seen: Float32Array): CoverageSide[] => {
  const samples = reachableSamples(an, an.opts.pairStride);
  seen.fill(NaN);
  for (const s of samples) seen[s.id] = 0;
  const res: CoverageSide[] = [];
  for (const side of [0, 1] as const) {
    const chokes = an.config.chokepoints.filter((c) => c.side === side);
    if (chokes.length === 0) continue;
    const targets = chokes.map(chokeTargets);
    const finals = chokes.map((c, i) => (c.final ? i : -1)).filter((i) => i >= 0);
    let best: (CoverageSpot & { score: number }) | null = null;
    let bestFinal: (CoverageSpot & { score: number }) | null = null;
    // more chokepoints, then more points seen, then a mirror-independent position order
    const better = (
      cur: (CoverageSpot & { score: number }) | null,
      count: number,
      score: number,
      s: Sample,
    ): boolean => {
      if (!cur) return true;
      if (count !== cur.count) return count > cur.count;
      if (score !== cur.score) return score > cur.score;
      const [ax, bx] = [Math.abs(s.feet.x), Math.abs(cur.pos.x)];
      if (Math.abs(ax - bx) > 0.05) return ax < bx;
      if (Math.abs(s.feet.z - cur.pos.z) > 0.05) return s.feet.z < cur.pos.z;
      return s.feet.y < cur.pos.y - 0.05;
    };
    let seeAll = 0;
    let seeAllFinal = 0;
    const allFinalRegions: string[] = [];
    for (const s of samples) {
      // points seen per chokepoint (a finer score, used to rank spots that see as many)
      const pts = targets.map((ts) => ts.filter((p) => an.rays.los(s.eye, p)).length);
      const vis = pts.map((n) => n > 0);
      const count = vis.filter(Boolean).length;
      const fcount = finals.filter((i) => vis[i]).length;
      const score = pts.reduce((a, b) => a + b, 0);
      const fscore = finals.reduce((a, i) => a + pts[i], 0);
      seen[s.id] = Math.max(seen[s.id], count);
      const spot = (cnt: number, of: number, sc: number): CoverageSpot & { score: number } => ({
        count: cnt,
        of,
        pos: rp(s.feet),
        region: regionName(an, s.region),
        sees: chokes.filter((_, i) => vis[i]).map((c) => c.name),
        score: sc,
      });
      if (count === chokes.length) seeAll++;
      if (finals.length && fcount === finals.length) {
        seeAllFinal++;
        allFinalRegions.push(regionName(an, s.region));
      }
      if (better(best, count, score, s)) best = spot(count, chokes.length, score);
      if (finals.length && better(bestFinal, fcount, fscore, s)) {
        bestFinal = spot(fcount, finals.length, fscore);
        bestFinal.sees = bestFinal.sees.filter((n) => finals.some((i) => chokes[i].name === n));
      }
    }
    for (const b of [best, bestFinal]) if (b) delete (b as { score?: number }).score;
    res.push({
      side,
      chokes: chokes.map((c) => c.name),
      best,
      seeAll,
      finalChokes: finals.map((i) => chokes[i].name),
      bestFinal,
      seeAllFinal,
      seeAllFinalByRegion: countBy(allFinalRegions),
    });
  }
  fillStride(an, seen, an.opts.pairStride, () => true);
  return res;
};

// ------------------------------------------------------------------------------------------
// 7. open ground

export interface OpenZone {
  region: string;
  samples: number;
  area: number;
  centroid: Vec3;
  min: Vec3;
  max: Vec3;
  maxCover: number;
  /** mean share (%) of viewer spots that see a player's chest here */
  exposure: number;
  /** the zone is the top of a small box (a crate, low cover) rather than open floor */
  onBox: boolean;
}

export interface ExposedZone {
  region: string;
  /** the zone is the top of a small box (a crate, low cover) rather than open floor */
  onBox: boolean;
  area: number;
  centroid: Vec3;
  min: Vec3;
  max: Vec3;
  /** mean / max share (%) of viewer spots that see a player's chest here */
  exposure: number;
  maxExposure: number;
  /** mean distance to the nearest cover */
  cover: number;
}

export interface OpenReport {
  threshold: number;
  /** viewer spots used for exposure (standing spots on every viewerStride-th grid spot) */
  viewers: number;
  /** a lane spot counts as "exposed" at or above this share of viewers (90th percentile) */
  exposedFrom: number;
  perRegion: {
    region: string;
    samples: number;
    meanCover: number;
    openPct: number;
    meanExposure: number;
    maxExposure: number;
  }[];
  zones: OpenZone[];
  exposedZones: ExposedZone[];
}

/**
 * Distance from a standing spot to the nearest obstacle that blocks from knee to chest height
 * (0.3–1.0 m above the floor along the body's up), measured in the floor plane. The box the
 * player stands on does not count (a ramp is not cover for someone walking up it).
 */
export const nearestCover = (an: Analyzer, s: Sample, maxD = 40): number => {
  const a = dominantAxis(s.up);
  const sign = Math.sign(comp(s.up, a));
  const f = comp(s.feet, a);
  const lo = Math.min(f + sign * 0.3, f + sign * 1.0);
  const hi = Math.max(f + sign * 0.3, f + sign * 1.0);
  const [u, v] = AXES.filter((x) => x !== a);
  const pu = comp(s.feet, u);
  const pv = comp(s.feet, v);
  const q = madd(s.feet, s.up, 0.65);
  let best = maxD;
  for (const b of an.level.boxes) {
    if (!b.collide || b.index === s.box) continue;
    if (comp(b.min, a) > lo || comp(b.max, a) < hi) continue;
    let d: number;
    if (b.rotated) {
      d = dist(q, closestPointOnBox(b, q));
    } else {
      const du = Math.max(comp(b.min, u) - pu, 0, pu - comp(b.max, u));
      const dv = Math.max(comp(b.min, v) - pv, 0, pv - comp(b.max, v));
      d = Math.hypot(du, dv);
    }
    if (d < best) best = d;
  }
  return best;
};

/**
 * Open ground in the lanes (bases excluded): distance to the nearest cover for every spot, and
 * "exposure" — the share of viewer spots all over the map whose eye sees a player's chest here.
 * Open zones are spots farther than `openCover` from cover; exposed zones are the most-watched
 * 10% of lane spots. Both are grouped into connected zones.
 */
export const openGround = (
  an: Analyzer,
  cover: Float32Array,
  exposure: Float32Array,
): OpenReport => {
  cover.fill(NaN);
  exposure.fill(NaN);
  const opts = an.opts;
  const laneOf = (s: Sample) => (s.region >= 0 ? an.config.regions[s.region].lane : 'other');
  const inPool = (s: Sample) =>
    s.reachable && (s.kind === 'floor' || s.kind === 'gravity') && laneOf(s) !== 'base';
  const pool = an.samples.filter(inPool);
  for (const s of pool) cover[s.id] = nearestCover(an, s);
  // viewers: standing spots (floor and wall/ceiling gravity) on a coarse grid; zero-G spots
  // are left out so the huge shaft volume does not outweigh the places where fights happen
  const viewers = reachableSamples(an, opts.viewerStride).filter(
    (s) => s.kind === 'floor' || s.kind === 'gravity',
  );
  for (const t of pool) {
    if (!onStride(an, t, opts.exposureStride)) continue;
    let n = 0;
    for (const v of viewers) if (v.id !== t.id && an.rays.los(v.eye, t.chest)) n++;
    exposure[t.id] = (100 * n) / Math.max(1, viewers.length);
  }
  fillStride(an, exposure, opts.exposureStride, inPool);
  const th = opts.openCover;
  const sorted = pool
    .map((s) => exposure[s.id])
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b);
  const p90 = sorted.length ? sorted[Math.floor(0.9 * (sorted.length - 1))] : Infinity;
  const per = new Map<
    string,
    { n: number; sum: number; open: number; ex: number; exN: number; exMax: number }
  >();
  for (const s of pool) {
    const k = regionName(an, s.region);
    let e = per.get(k);
    if (!e) per.set(k, (e = { n: 0, sum: 0, open: 0, ex: 0, exN: 0, exMax: 0 }));
    e.n++;
    e.sum += cover[s.id];
    if (cover[s.id] > th) e.open++;
    if (Number.isFinite(exposure[s.id])) {
      e.ex += exposure[s.id];
      e.exN++;
      e.exMax = Math.max(e.exMax, exposure[s.id]);
    }
  }
  const mean = (g: Sample[], layer: Float32Array) => {
    const vals = g.map((s) => layer[s.id]).filter((x) => Number.isFinite(x));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  const areaOf = (g: Sample[]) => g.length * an.passes[g[0].pass].spacing ** 2;
  // standing on a small box (footprint < 12 m): a crate top or low cover, not open floor
  const onSmallBox = (x: Sample) => {
    const b = x.box >= 0 ? an.level.boxes[x.box] : null;
    if (!b || b.rotated) return false;
    const [u, v] = AXES.filter((a) => a !== dominantAxis(x.up));
    return Math.max(2 * comp(b.h, u), 2 * comp(b.h, v)) < 12;
  };
  const onBox = (g: Sample[]) => 2 * g.filter(onSmallBox).length > g.length;
  const zones: OpenZone[] = clusters(
    an,
    new Set(pool.filter((s) => cover[s.id] > th).map((s) => s.id)),
  )
    .map((g) => {
      const e = extent(g);
      return {
        region: regionsOf(an, g),
        samples: g.length,
        area: r1(areaOf(g)),
        centroid: rp(e.c),
        min: rp(e.min),
        max: rp(e.max),
        maxCover: r1(Math.max(...g.map((s) => cover[s.id]))),
        exposure: r1(mean(g, exposure)),
        onBox: onBox(g),
      };
    })
    .sort((a, b) => b.area - a.area || a.centroid.x - b.centroid.x);
  const exposedZones: ExposedZone[] = clusters(
    an,
    new Set(pool.filter((s) => exposure[s.id] >= p90).map((s) => s.id)),
  )
    .filter((g) => areaOf(g) >= 4)
    .map((g) => {
      const e = extent(g);
      return {
        region: regionsOf(an, g),
        onBox: onBox(g),
        area: r1(areaOf(g)),
        centroid: rp(e.c),
        min: rp(e.min),
        max: rp(e.max),
        exposure: r1(mean(g, exposure)),
        maxExposure: r1(Math.max(...g.map((s) => exposure[s.id]))),
        cover: r1(mean(g, cover)),
      };
    })
    .sort((a, b) => b.area * b.exposure - a.area * a.exposure || a.centroid.x - b.centroid.x);
  return {
    threshold: th,
    viewers: viewers.length,
    exposedFrom: r1(p90),
    perRegion: [...per.entries()]
      .map(([region, e]) => ({
        region,
        samples: e.n,
        meanCover: r1(e.sum / e.n),
        openPct: pct(e.open, e.n),
        meanExposure: r1(e.exN ? e.ex / e.exN : 0),
        maxExposure: r1(e.exMax),
      }))
      .sort((a, b) => b.meanExposure - a.meanExposure || a.region.localeCompare(b.region)),
    zones: zones.slice(0, 12),
    exposedZones: exposedZones.slice(0, 12),
  };
};

// ------------------------------------------------------------------------------------------
// 8. peek balance / head glitches

export interface CoverBox {
  box: number;
  center: Vec3;
  size: Vec3;
  /** cover height above the floor it stands on */
  height: number;
  region: string;
}

export interface PeekSpot {
  box: number;
  face: string;
  stance: 'stand' | 'crouch';
  pos: Vec3;
  region: string;
  coverHeight: number;
  pairs: number;
  /** attackers whose chest the defender's eye can see */
  defenderSees: number;
  /** defender sees the attacker while < glitchFrac of the defender's hitbox is visible */
  glitches: number;
  /** attacker sees part of the defender while the defender cannot see the attacker at all */
  blind: number;
  /** smallest visible share of the defender while the defender sees the attacker */
  minShownWhileSeeing: number | null;
  /** largest visible share of the defender while the defender is blind */
  maxShownWhileBlind: number | null;
  worst: { attacker: Vec3; distance: number; shown: number } | null;
}

export interface PeekReport {
  coverBoxes: CoverBox[];
  spots: number;
  pairs: number;
  glitchPairs: number;
  blindPairs: number;
  byStance: {
    stance: string;
    pairs: number;
    glitchPairs: number;
    blindPairs: number;
    meanShown: number;
  }[];
  glitchSpots: PeekSpot[];
  blindSpots: PeekSpot[];
}

/** Share (0..1) of a body's hitbox silhouette visible from `from`. */
export const visibleShare = (an: Analyzer, body: BodyModel, feet: Vec3, from: Vec3): number => {
  const up = v3(0, 1, 0);
  let w = sub(feet, from);
  w = normalize(v3(w.x, 0, w.z), v3(1, 0, 0));
  const side = v3(-w.z, 0, w.x);
  let vis = 0;
  for (const p of body.silhouette) {
    const q = madd(madd(feet, up, p.h), side, p.s);
    if (an.rays.los(from, q)) vis++;
  }
  return vis / body.silhouette.length;
};

export const peekBalance = (an: Analyzer): PeekReport => {
  const { level, rays } = an;
  const down = v3(0, -1, 0);
  const up = v3(0, 1, 0);
  const angles = [-60, -40, -20, 0, 20, 40, 60];
  const dists = [5, 10, 15, 20, 25, 30];
  const floorAt = (x: number, y: number, z: number, maxDrop: number): number | null => {
    const o = v3(x, y, z);
    const h = rays.raycast(o, down, maxDrop);
    return h && h.t > 0 ? y - h.t : null;
  };
  const standsAt = (feet: Vec3): boolean =>
    !capsuleOverlaps(level, standingCapsule(an, feet, up)) &&
    dot(gravityDirAt(an.ctx, an.world, add(feet, v3(0, 1, 0))), down) > 0.999;
  const coverBoxes: CoverBox[] = [];
  const spots: PeekSpot[] = [];
  const stanceAcc = new Map<string, { pairs: number; g: number; b: number; shown: number }>();
  for (const b of level.boxes) {
    if (!b.collide || b.rotated) continue;
    const size = v3(2 * b.h.x, 2 * b.h.y, 2 * b.h.z);
    if (size.x > 20 || size.z > 20) continue;
    let counted = false;
    const faces: { name: string; n: Vec3; t: Vec3; half: number; c: Vec3 }[] = [
      { name: '+x', n: v3(1, 0, 0), t: v3(0, 0, 1), half: b.h.z, c: v3(b.max.x, 0, b.c.z) },
      { name: '-x', n: v3(-1, 0, 0), t: v3(0, 0, 1), half: b.h.z, c: v3(b.min.x, 0, b.c.z) },
      { name: '+z', n: v3(0, 0, 1), t: v3(1, 0, 0), half: b.h.x, c: v3(b.c.x, 0, b.max.z) },
      { name: '-z', n: v3(0, 0, -1), t: v3(1, 0, 0), half: b.h.x, c: v3(b.c.x, 0, b.min.z) },
    ];
    for (const f of faces) {
      const offsets = f.half >= 0.9 ? [0, -(f.half - 0.4), f.half - 0.4] : [0];
      for (const o of offsets) {
        const px = f.c.x + f.n.x * 0.6 + f.t.x * o;
        const pz = f.c.z + f.n.z * 0.6 + f.t.z * o;
        const fy = floorAt(px, b.max.y + 0.3, pz, b.max.y - b.min.y + 3);
        if (fy === null) continue;
        const coverH = b.max.y - fy;
        if (coverH < 0.9 || coverH > 1.7 || b.min.y > fy + 0.3) continue;
        const dFeet = v3(px, fy, pz);
        if (!standsAt(dFeet) || !floorSampleNear(an, dFeet)) continue;
        if (!counted) {
          counted = true;
          coverBoxes.push({
            box: b.index,
            center: rp(b.c),
            size: rp(size),
            height: r2(coverH),
            region: regionName(an, regionIndexOf(an.config, dFeet)),
          });
        }
        // attackers in a fan on the far side of the box
        const attackers: Vec3[] = [];
        for (const ad of angles) {
          const a = (ad * Math.PI) / 180;
          const dir = v3(
            -f.n.x * Math.cos(a) - f.t.x * Math.sin(a),
            0,
            -f.n.z * Math.cos(a) - f.t.z * Math.sin(a),
          );
          for (const d of dists) {
            const ax = px + dir.x * d;
            const az = pz + dir.z * d;
            const ay = floorAt(ax, fy + 3, az, 6);
            if (ay === null) continue;
            const aFeet = v3(ax, ay, az);
            if (!floorSampleNear(an, aFeet) || !standsAt(aFeet)) continue;
            attackers.push(aFeet);
          }
        }
        for (const body of [an.stand, an.crouch]) {
          const stance = body.crouched ? 'crouch' : 'stand';
          const dEye = madd(dFeet, up, body.eye);
          const spot: PeekSpot = {
            box: b.index,
            face: f.name,
            stance,
            pos: rp(dFeet),
            region: regionName(an, regionIndexOf(an.config, dFeet)),
            coverHeight: r2(coverH),
            pairs: 0,
            defenderSees: 0,
            glitches: 0,
            blind: 0,
            minShownWhileSeeing: null,
            maxShownWhileBlind: null,
            worst: null,
          };
          let sa = stanceAcc.get(stance);
          if (!sa) stanceAcc.set(stance, (sa = { pairs: 0, g: 0, b: 0, shown: 0 }));
          for (const aFeet of attackers) {
            const aEye = madd(aFeet, up, an.stand.eye);
            const aChest = madd(aFeet, up, an.stand.chest);
            const aHead = madd(aFeet, up, an.stand.head);
            const sees = rays.los(dEye, aChest);
            const shown = visibleShare(an, body, dFeet, aEye);
            spot.pairs++;
            sa.pairs++;
            sa.shown += shown;
            if (sees) {
              spot.defenderSees++;
              spot.minShownWhileSeeing = Math.min(spot.minShownWhileSeeing ?? 1, r2(shown));
              if (shown < an.opts.glitchFrac) {
                spot.glitches++;
                sa.g++;
                if (!spot.worst || shown < spot.worst.shown)
                  spot.worst = {
                    attacker: rp(aFeet),
                    distance: r1(dist(aFeet, dFeet)),
                    shown: r2(shown),
                  };
              }
            } else if (shown > 0 && !rays.los(dEye, aHead)) {
              spot.blind++;
              sa.b++;
              spot.maxShownWhileBlind = Math.max(spot.maxShownWhileBlind ?? 0, r2(shown));
              if (!spot.worst || (spot.glitches === 0 && shown > spot.worst.shown))
                spot.worst = {
                  attacker: rp(aFeet),
                  distance: r1(dist(aFeet, dFeet)),
                  shown: r2(shown),
                };
            }
          }
          if (spot.pairs > 0) spots.push(spot);
        }
      }
    }
  }
  const pairs = spots.reduce((a, s) => a + s.pairs, 0);
  return {
    coverBoxes,
    spots: spots.length,
    pairs,
    glitchPairs: spots.reduce((a, s) => a + s.glitches, 0),
    blindPairs: spots.reduce((a, s) => a + s.blind, 0),
    byStance: [...stanceAcc.entries()].map(([stance, x]) => ({
      stance,
      pairs: x.pairs,
      glitchPairs: x.g,
      blindPairs: x.b,
      meanShown: r2(x.pairs ? x.shown / x.pairs : 0),
    })),
    glitchSpots: spots
      .filter((s) => s.glitches > 0)
      .sort((a, b) => b.glitches - a.glitches || a.box - b.box)
      .slice(0, 20),
    blindSpots: spots
      .filter((s) => s.blind > 0)
      .sort((a, b) => b.blind - a.blind || a.box - b.box)
      .slice(0, 20),
  };
};

// ------------------------------------------------------------------------------------------
// 9. height advantage

export interface PowerPosition {
  region: string;
  samples: number;
  centroid: Vec3;
  floorY: number;
  /** mean height above the lowest nearby floor */
  height: number;
  /** ground spots (≥ heightMin lower, ≤ 60 m away) whose chest this spot's eye sees */
  overlookMean: number;
  overlookMax: number;
  /** of those ground spots, how many see this spot's chest back / its head or chest */
  seeBackMean: number;
  seeBackAnyMean: number;
  /** overlook ÷ see-back (chest); > 1.5 = the high ground is hard to answer */
  ratio: number;
  best: { pos: Vec3; overlook: number; seeBack: number; seeBackAny: number };
}

export interface HeightReport {
  raisedSamples: number;
  groundSamples: number;
  positions: PowerPosition[];
}

export const heightAdvantage = (an: Analyzer): HeightReport => {
  const floors = reachableSamples(an).filter((s) => s.kind === 'floor');
  const pass = an.passes.find((q) => q.kind === 'floor' && q.zone === -1);
  if (!pass) return { raisedSamples: 0, groundSamples: 0, positions: [] };
  const sp = pass.spacing;
  const k = Math.ceil(4 / sp);
  const lowest = new Map<number, number>();
  for (const s of floors) {
    let lo = s.feet.y;
    for (let di = -k; di <= k; di++)
      for (let dj = -k; dj <= k; dj++)
        for (const id of an.columns.get(colKey(s.pass, s.gi + di, s.gj + dj)) ?? []) {
          const o = an.samples[id];
          if (o.reachable && o.kind === 'floor' && o.feet.y < lo) lo = o.feet.y;
        }
    lowest.set(s.id, lo);
  }
  const raised = floors.filter((s) => s.feet.y - lowest.get(s.id)! >= an.opts.heightMin);
  const raisedSet = new Set(raised.map((s) => s.id));
  const ground = floors.filter((s) => onStride(an, s, an.opts.pairStride) && !raisedSet.has(s.id));
  const stats = new Map<number, { o: number; b: number; a: number }>();
  for (const r of raised) {
    let o = 0,
      bk = 0,
      any = 0;
    for (const g of ground) {
      if (r.feet.y - g.feet.y < an.opts.heightMin) continue;
      if (Math.hypot(r.feet.x - g.feet.x, r.feet.z - g.feet.z) > 60) continue;
      if (!an.rays.los(r.eye, g.chest)) continue;
      o++;
      if (an.rays.los(g.eye, r.chest)) {
        bk++;
        any++;
      } else if (an.rays.los(g.eye, r.head)) any++;
    }
    stats.set(r.id, { o, b: bk, a: any });
  }
  // group raised samples into connected positions
  const positions: PowerPosition[] = clusters(an, raisedSet).map((group) => {
    const st = group.map((s) => stats.get(s.id)!);
    const n = group.length;
    const mean = (f: (x: { o: number; b: number; a: number }) => number) =>
      st.reduce((acc, x) => acc + f(x), 0) / n;
    let bi = 0;
    st.forEach((x, i) => {
      if (x.o > st[bi].o) bi = i;
    });
    const c = extent(group).c;
    const oMean = mean((x) => x.o);
    const bMean = mean((x) => x.b);
    return {
      region: countBy(group.map((s) => regionName(an, s.region)))[0].region,
      samples: n,
      centroid: rp(c),
      floorY: r1(c.y),
      height: r1(group.reduce((a, s) => a + s.feet.y - lowest.get(s.id)!, 0) / n),
      overlookMean: r1(oMean),
      overlookMax: Math.max(...st.map((x) => x.o)),
      seeBackMean: r1(bMean),
      seeBackAnyMean: r1(mean((x) => x.a)),
      ratio: r2(oMean / Math.max(1, bMean)),
      best: {
        pos: rp(group[bi].feet),
        overlook: st[bi].o,
        seeBack: st[bi].b,
        seeBackAny: st[bi].a,
      },
    };
  });
  positions.sort((a, b) => b.overlookMax - a.overlookMax || a.centroid.x - b.centroid.x);
  return { raisedSamples: raised.length, groundSamples: ground.length, positions };
};

// ------------------------------------------------------------------------------------------
// 10. movement features: can players get to the zip-rails and gravity pads?

export interface RailCheck {
  from: Vec3;
  to: Vec3;
  length: number;
  /** a player can grab it: standing or jumping from a reachable spot, or floating in zero-G */
  reachable: boolean;
  how: string;
  /** closest approach of a jumping player's hand to the rail, minus the grab radius (m); ≤ 0 = grabs */
  gap: number | null;
  /** the spot that gets closest */
  bestSpot: { pos: Vec3; region: string } | null;
}

export interface PadCheck {
  zone: string;
  centre: Vec3;
  /** reachable spots where a standing player's body centre is inside the trigger volume */
  spots: number;
  reachable: boolean;
}

export interface FeatureReport {
  rails: RailCheck[];
  pads: PadCheck[];
}

/**
 * Zip-rails: a player grabs a rail when their hand (body centre + railHang along up) comes
 * within railGrabRadius of it. Tested from every reachable standing spot, from standing
 * height up to the top of a jump; a rail that runs through a reachable zero-G zone counts as
 * reachable (players float to it). Gravity pads: triggered when a player's body centre is
 * inside the pad volume; counted over reachable standing spots.
 */
export const featureReach = (an: Analyzer): FeatureReport => {
  const m = an.game.movement;
  const standing = an.samples.filter((s) => s.reachable && s.kind !== 'float');
  const zeroGZones = new Set(
    an.samples
      .filter((s) => s.reachable && (s.kind === 'mag' || s.kind === 'float'))
      .map((s) => s.zone),
  );
  const rails: RailCheck[] = an.level.rails.map((rail) => {
    let gap = Infinity;
    let best: Sample | null = null;
    for (const s of standing) {
      for (let h = 0; h <= m.jumpHeight + 1e-9; h += 0.1) {
        const hand = madd(s.feet, s.up, m.standHeight / 2 + m.railHang + h);
        const g = railClosest(rail, hand).dist - m.railGrabRadius;
        if (g < gap) {
          gap = g;
          best = s;
        }
      }
    }
    let floats = false;
    for (let t = 0; t <= rail.length && !floats; t += 0.5) {
      const zi = zoneAt(an.level, railPoint(rail, t));
      floats = zi >= 0 && zeroGZones.has(zi) && isZeroG(an.level.zones[zi].gravity);
    }
    const jumps = gap <= 0;
    return {
      from: rp(rail.points[0]),
      to: rp(rail.points[rail.points.length - 1]),
      length: r1(rail.length),
      reachable: jumps || floats,
      how: jumps ? 'jump from a standing spot' : floats ? 'float to it in zero-G' : 'no way found',
      gap: Number.isFinite(gap) ? r1(gap) : null,
      bestSpot: best ? { pos: rp(best.feet), region: regionName(an, best.region) } : null,
    };
  });
  const pads: PadCheck[] = an.level.def.pads.map((pad) => {
    const n = standing.filter((s) => pointInAabb(s.centre, pad.min, pad.max)).length;
    return {
      zone: pad.zone,
      centre: rp(scale(add(pad.min, pad.max), 0.5)),
      spots: n,
      reachable: n > 0,
    };
  });
  return { rails, pads };
};

// ------------------------------------------------------------------------------------------
// lane structure (from the waypoint graph)

export interface RegionLink {
  from: string;
  to: string;
  links: number;
  oneWay: boolean;
}

export const regionLinks = (an: Analyzer): RegionLink[] => {
  const wps = an.level.def.waypoints ?? [];
  const name = (p: Vec3) => regionName(an, regionIndexOf(an.config, p));
  const m = new Map<string, RegionLink>();
  wps.forEach((w, i) => {
    for (const j of w.links) {
      const a = name(w.pos);
      const b = name(wps[j].pos);
      if (a === b) continue;
      const back = wps[j].links.includes(i);
      const [x, y] = back && a > b ? [b, a] : [a, b];
      const k = `${x}|${y}|${back}`;
      const e = m.get(k);
      if (e) e.links++;
      else m.set(k, { from: x, to: y, links: 1, oneWay: !back });
    }
  });
  return [...m.values()]
    .map((e) => (e.oneWay ? e : { ...e, links: e.links / 2 }))
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
};

// ------------------------------------------------------------------------------------------
// everything

export interface MapReport {
  map: {
    id: string;
    name: string;
    boxes: number;
    colliders: number;
    /** render fog: things fade from `near` and are hidden beyond `far` (m) */
    fog: { near: number; far: number } | null;
    /** a few game numbers the report refers to */
    game: {
      sprintSpeed: number;
      quickThrowReach: number;
      windupRange: number;
      laserRange: number;
      spawnLockSec: number;
    };
  };
  options: Omit<AnalysisOptions, 'log'>;
  samples: SampleSummary;
  routes: RouteReport;
  /** measured route timings + balance checks (maps with named routes) */
  walks: TimingReport | null;
  regionLinks: RegionLink[];
  sightlines: SightReport;
  spawns: SpawnReport;
  towers: TowerExposure[];
  chokepoints: CoverageSide[];
  openGround: OpenReport;
  peeks: PeekReport;
  height: HeightReport;
  features: FeatureReport;
  seconds: Record<string, number>;
}

/** Per-sample values for the heat-map plans. */
export interface Layers {
  /** longest sightline (m), NaN when not computed */
  sight: Float32Array;
  /** nearest cover (m), NaN when not computed */
  cover: Float32Array;
  /** share (%) of viewer spots that see a player's chest here (lanes only), NaN elsewhere */
  exposure: Float32Array;
  /** number of spawns (outside their base) this spot can see */
  spawnView: Uint16Array;
  /** most chokepoints of one side this spot can see, NaN when not computed */
  chokeView: Float32Array;
}

export interface Analysis {
  report: MapReport;
  analyzer: Analyzer;
  layers: Layers;
}

export const analyzeMap = (
  level: Level,
  config: MapAnalysisConfig,
  opts: AnalysisOptions = defaultOptions(),
): Analysis => {
  const an = createAnalyzer(level, config, opts);
  const seconds: Record<string, number> = {};
  const time = <T>(name: string, fn: () => T): T => {
    const t0 = performance.now();
    const r = fn();
    seconds[name] = r2((performance.now() - t0) / 1000);
    opts.log(`  ${name.padEnd(12)} ${seconds[name].toFixed(2)} s`);
    return r;
  };
  const samples = time('samples', () => findSamples(an));
  const n = an.samples.length;
  const layers: Layers = {
    sight: new Float32Array(n),
    cover: new Float32Array(n),
    exposure: new Float32Array(n),
    spawnView: new Uint16Array(n),
    chokeView: new Float32Array(n),
  };
  const routes = time('routes', () => routeTimings(an));
  const walks = config.routes?.length
    ? time('walks', () => measureRoutes(level, config.routes!, an.game))
    : null;
  const links = regionLinks(an);
  const sight = time('sightlines', () => sightlines(an, layers.sight));
  const spawns = time('spawns', () => spawnSafety(an, layers.spawnView));
  const towers = time('towers', () => towerExposure(an));
  const chokes = time('chokepoints', () => chokepointCoverage(an, layers.chokeView));
  const open = time('openGround', () => openGround(an, layers.cover, layers.exposure));
  const peeks = time('peeks', () => peekBalance(an));
  const height = time('height', () => heightAdvantage(an));
  const features = time('features', () => featureReach(an));
  const { log: _log, ...optsOut } = opts;
  return {
    analyzer: an,
    layers,
    report: {
      map: {
        id: config.id,
        name: level.def.name,
        boxes: level.def.boxes.length,
        colliders: level.colliders,
        fog: level.def.fog ? { near: level.def.fog.near, far: level.def.fog.far } : null,
        game: {
          sprintSpeed: an.game.movement.sprintSpeed,
          quickThrowReach: r1(an.game.combat.quickSpeed * an.game.combat.quickOutSec),
          windupRange: an.game.combat.windupRange,
          laserRange: an.game.combat.laserRange,
          spawnLockSec: an.game.rules.spawnLockSec,
        },
      },
      options: optsOut,
      samples,
      routes,
      walks,
      regionLinks: links,
      sightlines: sight,
      spawns,
      towers,
      chokepoints: chokes,
      openGround: open,
      peeks,
      height,
      features,
      seconds,
    },
  };
};
