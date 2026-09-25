import { describe, expect, it } from 'vitest';
import {
  buildLevel,
  mapDef,
  raycast,
  rayBox,
  lineOfSight,
  rngFromSeed,
  rngFloat,
  normalize,
  sub,
  len,
  v3,
  type Level,
  type Vec3,
} from '../src/index';

/** The reference answer: every colliding box, nearest hit, lowest index on a tie. */
const bruteRay = (level: Level, o: Vec3, dir: Vec3, maxDist: number) => {
  let best: { t: number; box: number } | null = null;
  for (const b of level.boxes) {
    if (!b.collide) continue;
    const h = rayBox(b, o, dir, best ? best.t : maxDist);
    if (h && (!best || h.t < best.t)) best = { t: h.t, box: b.index };
  }
  return best;
};

const LEVELS = ['kestrel', 'test-ship'];

describe('raycasts walk the grid (fast) and agree with testing every box', () => {
  for (const id of LEVELS) {
    it(`random rays and sight lines on ${id}`, () => {
      const level = buildLevel(mapDef(id));
      const { boundsMin: lo, boundsMax: hi } = level.def;
      const rng = rngFromSeed(7);
      const rand = (a: number, b: number, snap: boolean) => {
        const x = a + rngFloat(rng) * (b - a);
        // half the points on the 0.5 m lattice the maps are built on (edges, faces, corners)
        return snap ? Math.round(x * 2) / 2 : x;
      };
      const point = (snap: boolean) =>
        v3(rand(lo.x, hi.x, snap), rand(lo.y, hi.y, snap), rand(lo.z, hi.z, snap));
      let hits = 0;
      for (let n = 0; n < 4000; n++) {
        const snap = n % 2 === 0;
        const a = point(snap);
        // long sight lines, short hops, and rays along the axes (on cell borders when snapped)
        const b =
          n % 5 === 0
            ? v3(
                a.x + (n % 3 === 0 ? 37 : 0),
                a.y + (n % 3 === 1 ? 9 : 0),
                a.z + (n % 3 === 2 ? -23 : 0),
              )
            : n % 5 === 1
              ? v3(a.x + rand(-3, 3, snap), a.y + rand(-3, 3, snap), a.z + rand(-3, 3, snap))
              : point(snap);
        const l = len(sub(b, a));
        if (l < 1e-3) continue;
        const dir = normalize(sub(b, a));
        const want = bruteRay(level, a, dir, l);
        const got = raycast(level, a, dir, l);
        const where = `ray ${JSON.stringify(a)} -> ${JSON.stringify(b)}`;
        expect(got?.box ?? null, where).toBe(want?.box ?? null);
        if (want) expect(got!.t, where).toBe(want.t);
        expect(lineOfSight(level, a, b), where).toBe(want === null);
        if (want) hits++;
      }
      expect(hits).toBeGreaterThan(1000);
    });
  }

  it('rays that start or end outside the grid still hit (bounding-box fallback)', () => {
    const level = buildLevel(mapDef('kestrel'));
    const o = v3(0, 3, 0);
    for (const dir of [v3(1, 0, 0), v3(-1, 0, 0), v3(0, 0, 1), normalize(v3(1, 0.1, 0.5))]) {
      const want = bruteRay(level, o, dir, 1000);
      expect(want).not.toBeNull();
      expect(raycast(level, o, dir, 1000)?.box).toBe(want!.box);
    }
    const outside = v3(0, 3, 500);
    const want = bruteRay(level, outside, v3(0, 0, -1), 1000);
    expect(raycast(level, outside, v3(0, 0, -1), 1000)?.box).toBe(want!.box);
  });
});
