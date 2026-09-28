// Basalt Cathedral (surf map I02, level/maps/surf-basalt-cathedral.ts): what the shared surf-map
// tests (surf-maps.test.ts) can't see.
//
//   stacking   the bell helix's coils and its exit straight (which passes under the first half)
//              are ≥ 12 m apart ridge to ridge wherever one lies over the other — and ≥ the
//              README rule max(h, (1 − d)·h + H + 3) for the lower one's face (findOverlaps only
//              checks that the wedges don't intersect); every racing-line point has ≥ 3 m of
//              head room under anything solid above it (red limits excepted: the helix cornice
//              is a deliberate head-height limit)
//   rose line  the faster line through the rose window saves 6–10 s (the brief's target)
import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  basaltCathedralCourse,
  buildLevel,
  createPlayer,
  createWorld,
  curvePath,
  defaultConfig,
  driveNodes,
  driveRaceLine,
  mapDef,
  raycast,
  resetRacer,
  step,
  STEADY_RACER,
  SURF_PROFILE,
  TICK_DT,
  v3,
  type CurveEl,
} from '../src/index';

const data = basaltCathedralCourse();
const def = mapDef('surf-basalt-cathedral');

/** Points across a curve's riding face (ridge to foot), every metre along it. */
const facePoints = (e: CurveEl) => {
  const path = curvePath(e);
  const run = e.height / Math.tan((e.angle * Math.PI) / 180);
  const s = e.side === 'right' ? 1 : -1;
  const out: { x: number; z: number; ridge: number; along: number }[] = [];
  for (let a = 0; a <= path.length; a += 1) {
    const r = path.at(a);
    for (let k = 0; k <= 4; k++) {
      const off = (run * k) / 4;
      out.push({
        x: r.pos.x - r.dir.z * s * off,
        z: r.pos.z + r.dir.x * s * off,
        ridge: r.pos.y,
        along: a,
      });
    }
  }
  return out;
};

describe('surf-basalt-cathedral', () => {
  it('the helix clears itself: ≥ 12 m (and the README rule) ridge to ridge where it stacks', () => {
    const helix = data.route.find(
      (e): e is CurveEl => e.t === 'curve' && e.legs.some((l) => l.toRadius !== undefined),
    );
    expect(helix).toBeTruthy();
    const h = helix!;
    const pts = facePoints(h);
    const H = SURF_PROFILE.H;
    const d = 0.4;
    const rule = Math.max(h.height, (1 - d) * h.height + H + 3);
    let min = Infinity;
    let stacked = 0;
    // (a grid of the points: pairs a coil apart that lie over each other within 1 m)
    const cell = new Map<string, typeof pts>();
    const key = (x: number, z: number) => `${Math.floor(x)},${Math.floor(z)}`;
    for (const q of pts) {
      const k = key(q.x, q.z);
      if (!cell.has(k)) cell.set(k, []);
      cell.get(k)!.push(q);
    }
    for (const a of pts)
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++)
          for (const b of cell.get(key(a.x + i, a.z + j)) ?? []) {
            if (b.along - a.along < 60 || Math.hypot(a.x - b.x, a.z - b.z) > 1) continue;
            stacked++;
            min = Math.min(min, Math.abs(a.ridge - b.ridge));
          }
    // (it does stack: the exit straight runs under the first half)
    expect(stacked).toBeGreaterThan(0);
    expect(min, `closest stacked ridges ${min.toFixed(1)} m apart`).toBeGreaterThanOrEqual(12);
    expect(min).toBeGreaterThanOrEqual(rule);
  });

  it('every racing-line point has ≥ 3 m of head room under anything solid (red limits apart)', () => {
    const level = buildLevel(def);
    const up = v3(0, 1, 0);
    let worst = Infinity;
    let where = '';
    for (const n of def.race!.line) {
      if (n.portal) continue;
      let from = v3(n.pos.x, n.pos.y + SURF_PROFILE.H, n.pos.z);
      let gone = 0;
      for (let tries = 0; tries < 8; tries++) {
        const hit = raycast(level, from, up, 30 - gone);
        if (!hit) break;
        const b = level.boxes[hit.box];
        // (a window's lintel is its own opening's top: flown through, not ridden under)
        if (b.kill || !b.collide) {
          from = v3(from.x, hit.point.y + 0.05, from.z);
          gone += hit.t + 0.05;
          continue;
        }
        if (gone + hit.t < worst) {
          worst = gone + hit.t;
          where = `${n.pos.x.toFixed(1)}, ${n.pos.y.toFixed(1)}, ${n.pos.z.toFixed(1)}`;
        }
        break;
      }
    }
    expect(worst, `tightest head room at ${where}`).toBeGreaterThanOrEqual(3);
  });

  it('the rose-window line saves 6–10 s (brief: one-contact rose-window route)', () => {
    // (as tools/race/time-tracks.ts --forks: the clean run's track, then the fork ridden from
    // its first point at the clean run's speed there, against the clean run between the same
    // two points)
    const race = def.race!;
    const config = defaultConfig();
    const sim = () => {
      const ctx = { level: buildLevel(def), config, dt: TICK_DT };
      return { ctx, world: createWorld(ctx.level, 1) };
    };
    const track: { x: number; y: number; z: number; v: number }[] = [];
    {
      const { ctx, world } = sim();
      const g = race.grid[0];
      const p = addPlayer(world, createPlayer(1, 0, g.pos, g.yawDeg, config));
      resetRacer(p, config.movement, g.pos, g.yawDeg, 0);
      driveRaceLine(
        ctx,
        world,
        p,
        (w, i, c) => {
          step(w, i, c);
          track.push({ x: p.pos.x, y: p.pos.y - 0.9, z: p.pos.z, v: Math.hypot(p.vel.x, p.vel.z) });
        },
        STEADY_RACER,
        race.parSec * 2,
      );
    }
    const nearest = (q: { x: number; y: number; z: number }) => {
      let best = 0;
      track.forEach((t, i) => {
        const b = track[best];
        if (
          Math.hypot(t.x - q.x, t.y - q.y, t.z - q.z) < Math.hypot(b.x - q.x, b.y - q.y, b.z - q.z)
        )
          best = i;
      });
      return best;
    };
    const f = race.forks!.find((q) => q.name === 'Rose chord')!;
    const { ctx, world } = sim();
    const [a, b] = [f.riskyLine[0].pos, f.riskyLine[1].pos];
    const yaw = -((Math.atan2(b.x - a.x, -(b.z - a.z)) * 180) / Math.PI);
    const p = addPlayer(world, createPlayer(1, 0, a, yaw, config));
    resetRacer(p, config.movement, a, yaw, f.cp);
    const i0 = nearest(a);
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    p.pos = v3(a.x, a.y + 0.92, a.z);
    p.vel = v3(((b.x - a.x) / l) * track[i0].v, 0, ((b.z - a.z) / l) * track[i0].v);
    const r = driveNodes(ctx, world, p, f.riskyLine, step, 60);
    expect(r.reached).toBe(true);
    const lineSec = (nearest(f.riskyLine[f.riskyLine.length - 1].pos) - i0) * TICK_DT;
    const saved = lineSec - r.timeSec;
    expect(saved).toBeGreaterThanOrEqual(6);
    expect(saved).toBeLessThanOrEqual(10);
  }, 60000);
});
