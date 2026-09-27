import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  buildLevel,
  closestPointOnBox,
  compileCustomMap,
  countPieces,
  createPlayer,
  createWorld,
  defaultConfig,
  expandCustomBlock,
  maxWaveAmplitude,
  qRotate,
  step,
  v3,
  validateCustomMap,
  Move,
  TICK_DT,
  type BoxDef,
  type CustomBlock,
  type CustomMapDoc,
  type SimContext,
  type Vec3,
} from '../src/index';

// The Map Maker's curve kinds (arc, S-curve, spiral, wave) on curved surf ramps, ramps and
// walkways: joined without gaps, deterministic, and surf ramps that really surf.

type Curve = NonNullable<CustomBlock['curve']>;
type CurveShape = 'curveSurf' | 'curveRamp' | 'curvePlatform';

const curveBlock = (
  shape: CurveShape,
  curve: Curve,
  rot?: [number, number, number],
): CustomBlock => ({
  id: 1,
  shape,
  pos: [3, 20, -4],
  size: [4, shape === 'curveSurf' ? 5 : 0.5, 1],
  mat: 'concrete',
  curve,
  ...(rot ? { rot } : {}),
});

const doc = (blocks: CustomBlock[], race = false): CustomMapDoc => ({
  v: 1,
  name: 'Curves',
  base: '',
  sky: 'day',
  blocks,
  movers: [],
  spawns: [],
  portals: [],
  launchPads: [],
  ...(race
    ? {
        race: {
          start: { pos: [0, 1.5, 80], size: [6, 3, 6], yaw: 0 },
          checkpoints: [],
          finish: { pos: [0, 1.5, 120], size: [6, 3, 6], yaw: 0 },
        },
      }
    : {}),
});

const SHAPES: CurveShape[] = ['curveSurf', 'curveRamp', 'curvePlatform'];
const VARIANTS: Curve[] = [
  { radius: 12, angle: 120 },
  { radius: 12, angle: -200, rise: -8 },
  { radius: 10, angle: 160, kind: 'sCurve', rise: 4 },
  { radius: 8, angle: -300, kind: 'spiral', endRadius: 25, rise: 10 },
  { radius: 15, angle: 140, kind: 'wave', amplitude: 1.5, waves: 1 },
  { radius: 20, angle: -90, kind: 'wave', amplitude: -2, waves: 0.5, rise: 3 },
];
const banked = (c: Curve, s: CurveShape): Curve =>
  s === 'curveSurf' ? { ...c, steepness: 70 } : { ...c, bank: c.angle < 0 ? -30 : 25 };

/**
 * Points just past a piece's end, a little under its riding surface (its top, or a surf
 * prism's faces from near the base to near the ridge). Where the pieces join without a hole,
 * the next piece is there: the two surfaces may differ by a small step (less than the depth
 * we look under), never by a gap.
 */
/** (steep, turning and climbing surf faces can keep a sliver of a step near their ridge) */
const SLACK = 0.06;
const pastEnd = (b: BoxDef, front: boolean): Vec3[] => {
  const local: Vec3[] = [];
  const PAST = 0.015;
  if (b.surf) {
    // prism: local x runs along the ridge (forward)
    const IN = 0.2;
    const x = (front ? 1 : -1) * (b.h.x + PAST);
    for (const t of [0.1, 0.25, 0.5, 0.75])
      for (const side of [1, -1]) {
        const y = -b.h.y + 2 * b.h.y * t;
        const z = side * b.h.z * (1 - t);
        // toward the middle of the cross-section
        const l = Math.hypot(y, z);
        local.push(v3(x, y - (y / l) * IN, z - (z / l) * IN));
      }
  } else {
    const IN = Math.min(0.2, b.h.y);
    const z = (front ? -1 : 1) * (b.h.z + PAST);
    for (const t of [-0.98, -0.5, 0, 0.5, 0.98]) local.push(v3(t * b.h.x, b.h.y - IN, z));
  }
  return local.map((l) => {
    const w = qRotate(b.q!, l);
    return v3(b.c.x + w.x, b.c.y + w.y, b.c.z + w.z);
  });
};

describe('curve kinds', () => {
  it('every kind compiles the same way twice and its pieces join without gaps', () => {
    const worsts: string[] = [];
    const failed: string[] = [];
    for (const shape of SHAPES)
      for (const v of VARIANTS)
        for (const c of [v, banked(v, shape)]) {
          const b = curveBlock(shape, c, [25, 0, 0]);
          const r = validateCustomMap(doc([b]));
          if (!r.ok) throw new Error(r.errors.join('; '));
          // (a wave may be clamped to what stays smooth)
          const cap = maxWaveAmplitude(b);
          const amp =
            c.amplitude === undefined
              ? {}
              : { amplitude: Math.sign(c.amplitude) * Math.min(Math.abs(c.amplitude), cap) };
          expect(r.doc.blocks[0].curve).toEqual({ ...c, ...amp });
          const a = compileCustomMap(r.doc);
          const again = compileCustomMap(JSON.parse(JSON.stringify(r.doc)) as CustomMapDoc);
          expect(JSON.stringify(again)).toBe(JSON.stringify(a));
          const boxes = expandCustomBlock(r.doc.blocks[0]);
          expect(boxes).toHaveLength(countPieces({ blocks: [b] }));
          const level = buildLevel(a);
          const gap = (p: Vec3, i: number): number => {
            const q = closestPointOnBox(level.boxes[i], p);
            return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
          };
          // just past each piece's end the next piece takes over (and the other way round);
          // where the two surfaces differ a little, at most a small step (not a hole)
          let worst = 0;
          for (let k = 1; k < boxes.length; k++) {
            for (const p of pastEnd(boxes[k - 1], true)) worst = Math.max(worst, gap(p, k));
            for (const p of pastEnd(boxes[k], false)) worst = Math.max(worst, gap(p, k - 1));
          }
          worsts.push(`${shape} ${JSON.stringify(c)}: ${worst.toFixed(3)}`);
          if (worst > SLACK) failed.push(worsts[worsts.length - 1]);
        }
    expect(failed, worsts.join(' / ')).toEqual([]);
  });

  it('a spiral changes its radius; an S-curve ends heading the way it started', () => {
    const spiral = expandCustomBlock(
      curveBlock('curvePlatform', { radius: 10, angle: 360, kind: 'spiral', endRadius: 30 }),
    );
    const r = (b: BoxDef) => Math.hypot(b.c.x - 3, b.c.z + 4);
    expect(Math.abs(r(spiral[0]) - 10)).toBeLessThan(1);
    expect(Math.abs(r(spiral[spiral.length - 1]) - 30)).toBeLessThan(1);
    const s = expandCustomBlock(
      curveBlock('curveRamp', { radius: 10, angle: 120, kind: 'sCurve' }),
    );
    const fwd = (b: BoxDef) => qRotate(b.q!, v3(0, 0, -1));
    const f0 = fwd(s[0]);
    const f1 = fwd(s[s.length - 1]);
    expect(f1.x).toBeCloseTo(f0.x, 9);
    expect(f1.z).toBeCloseTo(f0.z, 9);
    // ...having turned away in between
    const mid = fwd(s[Math.floor(s.length / 2)]);
    expect(mid.x * f0.x + mid.z * f0.z).toBeLessThan(0.9);
  });

  it('a wave goes up and down; rise applies to every kind', () => {
    const wave = expandCustomBlock(
      curveBlock('curvePlatform', { radius: 15, angle: 180, kind: 'wave', amplitude: 4, waves: 1 }),
    );
    const ys = wave.map((b) => b.c.y);
    expect(Math.max(...ys) - 20).toBeGreaterThan(3);
    expect(20 - Math.min(...ys)).toBeGreaterThan(3);
    const drop = expandCustomBlock(curveBlock('curveSurf', { radius: 15, angle: 90, rise: -10 }));
    expect(drop[drop.length - 1].c.y).toBeLessThan(drop[0].c.y - 8);
  });

  it('checks the new fields', () => {
    const ok = (c: Record<string, unknown>, shape: CurveShape = 'curveSurf') =>
      validateCustomMap(doc([curveBlock(shape, { radius: 10, angle: 90, ...c } as Curve)])).ok;
    expect(ok({ kind: 'zigzag' })).toBe(false);
    expect(ok({ steepness: 30 })).toBe(false);
    expect(ok({ steepness: 85 })).toBe(false);
    expect(ok({ kind: 'spiral', endRadius: 1 })).toBe(false);
    expect(ok({ kind: 'wave', waves: 10 })).toBe(false);
    expect(ok({ kind: 'wave', amplitude: 20 })).toBe(false);
    expect(ok({ bank: 60 }, 'curveRamp')).toBe(false);
    // fields a shape doesn't use are dropped
    const r = validateCustomMap(
      doc([curveBlock('curveSurf', { radius: 10, angle: 90, bank: 10, endRadius: 5 } as Curve)]),
    );
    expect(r.ok && r.doc.blocks[0].curve).toEqual({ radius: 10, angle: 90 });
  });
});

describe('wave caps', () => {
  /** The biggest step (m) at any join of a curve's riding surface. */
  const worstStep = (blk: CustomBlock): number => {
    const def = compileCustomMap(doc([blk]));
    const level = buildLevel(def);
    const IN = 0.01;
    const past = (b: BoxDef, front: boolean): Vec3[] => {
      const local: Vec3[] = [];
      if (b.surf) {
        const x = (front ? 1 : -1) * (b.h.x + 0.015);
        for (const t of [0.1, 0.25, 0.5, 0.75])
          for (const side of [1, -1]) {
            const y = -b.h.y + 2 * b.h.y * t;
            const z = side * b.h.z * (1 - t);
            const l = Math.hypot(y, z);
            local.push(v3(x, y - (y / l) * IN, z - (z / l) * IN));
          }
      } else {
        const z = (front ? -1 : 1) * (b.h.z + 0.015);
        for (const t of [-0.98, -0.5, 0, 0.5, 0.98]) local.push(v3(t * b.h.x, b.h.y - IN, z));
      }
      return local.map((l) => {
        const w = qRotate(b.q!, l);
        return v3(b.c.x + w.x, b.c.y + w.y, b.c.z + w.z);
      });
    };
    let worst = 0;
    const gap = (p: Vec3, i: number) => {
      const q = closestPointOnBox(level.boxes[i], p);
      return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    };
    for (let k = 1; k < def.boxes.length; k++) {
      for (const p of past(def.boxes[k - 1], true)) worst = Math.max(worst, gap(p, k));
      for (const p of past(def.boxes[k], false)) worst = Math.max(worst, gap(p, k - 1));
    }
    return worst + IN;
  };

  const CASES: [number, number, number, number, number, number | undefined, number][] = [
    // radius, angle, waves, steepness, height, segments, rise
    [15, 140, 1, 55, 5, undefined, 0],
    [15, -140, 2, 70, 5, undefined, 2],
    [30, 90, 1, 80, 8, undefined, 0],
    [10, 300, 3, 46, 3, undefined, -4],
    [40, 60, 0.5, 55, 4, undefined, 0],
    [20, 180, 1, 60, 6, 12, 0], // few pieces: a smaller wave
    [25, 360, 6, 55, 5, undefined, 0],
  ];

  it('a curved surf ramp at its capped wave keeps every join under ~6 cm', () => {
    for (const [radius, angle, waves, steepness, height, segments, rise] of CASES) {
      const b: CustomBlock = {
        ...curveBlock('curveSurf', {
          radius,
          angle,
          kind: 'wave',
          amplitude: 12,
          waves,
          steepness,
          rise,
          ...(segments ? { segments } : {}),
        }),
        size: [4, height, 1],
      };
      const cap = maxWaveAmplitude(b);
      const r = validateCustomMap(doc([b]));
      if (!r.ok) throw new Error(r.errors.join('; '));
      // clamped, not rejected
      expect(r.doc.blocks[0].curve!.amplitude).toBe(cap);
      // (a curve with few pieces may step a little on its own, flat: the wave adds nothing)
      const flat = worstStep({ ...b, curve: { ...b.curve!, amplitude: 0 } });
      expect(worstStep(r.doc.blocks[0]), JSON.stringify(b.curve)).toBeLessThan(
        Math.max(0.065, flat + 0.005),
      );
    }
  });

  it('caps are real waves on sensible ramps; walkways keep their steps under the step-up', () => {
    const surf = {
      ...curveBlock('curveSurf', { radius: 20, angle: 180, kind: 'wave', waves: 1 }),
      size: [4, 5, 1] as [number, number, number],
    };
    expect(maxWaveAmplitude(surf)).toBeGreaterThan(1.5);
    // a steep rise leaves no room for a wave
    expect(maxWaveAmplitude({ ...surf, curve: { ...surf.curve!, rise: 60 } })).toBe(0);
    for (const shape of ['curveRamp', 'curvePlatform'] as const)
      for (const [radius, angle, waves] of [
        [15, 140, 1],
        [10, 300, 6],
        [40, 90, 0.5],
      ] as const) {
        const b = curveBlock(shape, { radius, angle, kind: 'wave', amplitude: 12, waves });
        const r = validateCustomMap(doc([b]));
        if (!r.ok) throw new Error(r.errors.join('; '));
        expect(Math.abs(r.doc.blocks[0].curve!.amplitude!)).toBeLessThanOrEqual(12);
        expect(worstStep(r.doc.blocks[0]), JSON.stringify(b.curve)).toBeLessThan(0.4);
      }
  });
});

describe('curved surf ramps surf', () => {
  /** Put a racer on the middle piece (a surf ramp's right face, or a walkway's top). */
  const ride = (shape: CurveShape, c: Curve): { grounded: boolean; slid: boolean } => {
    const def = compileCustomMap(doc([curveBlock(shape, c)], true));
    const config = defaultConfig();
    const ctx: SimContext = { level: buildLevel(def), config, dt: TICK_DT };
    const world = createWorld(ctx.level, 1);
    const box = def.boxes[Math.floor(def.boxes.length / 2)];
    const m = config.movement;
    let feet: Vec3;
    if (box.surf) {
      // the middle of its +z face, pushed out along the face's normal
      const pt = qRotate(box.q!, v3(0, 0, box.h.z / 2));
      const n0 = qRotate(box.q!, v3(0, box.h.z, 2 * box.h.y));
      const nl = Math.hypot(n0.x, n0.y, n0.z);
      const s = m.radius + 0.05;
      feet = v3(
        box.c.x + pt.x + (n0.x / nl) * s,
        box.c.y + pt.y + (n0.y / nl) * s - m.radius,
        box.c.z + pt.z + (n0.z / nl) * s,
      );
    } else {
      const top = qRotate(box.q!, v3(0, box.h.y, 0));
      feet = v3(box.c.x + top.x, box.c.y + top.y + 0.02, box.c.z + top.z);
    }
    const p = addPlayer(world, createPlayer(1, 0, feet, 0, config));
    let grounded = false;
    let slid = false;
    for (let t = 0; t < 20; t++) {
      step(world, { 1: { tick: world.tick + 1, buttons: 0, view: p.view } }, ctx);
      if (p.grounded || p.move === Move.Ground) grounded = true;
      if (Math.hypot(p.vel.x, p.vel.y, p.vel.z) > 1) slid = true;
    }
    return { grounded, slid };
  };

  it('every kind of curved surf ramp is never ground (you slide down its face)', () => {
    for (const v of VARIANTS)
      for (const c of [v, { ...v, steepness: 46 }, { ...v, steepness: 80 }]) {
        const r = ride('curveSurf', c);
        expect(r.grounded, JSON.stringify(c)).toBe(false);
        expect(r.slid, JSON.stringify(c)).toBe(true);
      }
    // (a curved walkway is ground)
    expect(ride('curvePlatform', { radius: 12, angle: 120 }).grounded).toBe(true);
  });
});
