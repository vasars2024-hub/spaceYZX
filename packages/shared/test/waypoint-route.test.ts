// bots/brain.ts waypointRoute: the binary-heap Dijkstra (fast on the big royale maps) finds
// exactly the routes the old scan-for-the-smallest version found, on every map.
import { describe, expect, it } from 'vitest';
import { MAPS, mapDef, len, sub, v3, waypointRoute, rngFromSeed, rngInt } from '../src/index';
import type { WaypointDef } from '../src/index';

/** A clock for the speed check (the shared package has no DOM / Node types). */
const now = (): number =>
  (globalThis as unknown as { performance: { now(): number } }).performance.now();

/** The old version (before the heap), kept here as the reference. */
const oldRoute = (wps: WaypointDef[], from: number, to: number): number[] => {
  const n = wps.length;
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  dist[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++)
      if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === to) break;
    done[u] = true;
    for (const v of wps[u].links) {
      const d = dist[u] + len(sub(wps[u].pos, wps[v].pos));
      if (d < dist[v]) {
        dist[v] = d;
        prev[v] = u;
      }
    }
  }
  if (dist[to] === Infinity) return [];
  const out: number[] = [];
  for (let v = to; v >= 0; v = prev[v]) out.unshift(v);
  return out;
};

describe('waypointRoute', () => {
  it('finds the very same routes as before on every map', () => {
    const rng = rngFromSeed(42);
    let checked = 0;
    for (const m of MAPS) {
      if (m.race) continue;
      const wps = mapDef(m.id).waypoints;
      if (!wps || wps.length < 2) continue;
      for (let k = 0; k < 25; k++) {
        const a = rngInt(rng, wps.length);
        const b = rngInt(rng, wps.length);
        expect(waypointRoute(wps, a, b), `${m.id} ${a}→${b}`).toEqual(oldRoute(wps, a, b));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('equal-length detours tie the same way (lower index first)', () => {
    // a square: 0 → 3 by 1 or by 2 is the same length
    const sq: WaypointDef[] = [
      { pos: v3(0, 0, 0), links: [1, 2] },
      { pos: v3(10, 0, 0), links: [0, 3] },
      { pos: v3(0, 0, 10), links: [0, 3] },
      { pos: v3(10, 0, 10), links: [1, 2] },
    ];
    expect(waypointRoute(sq, 0, 3)).toEqual(oldRoute(sq, 0, 3));
    expect(waypointRoute(sq, 3, 0)).toEqual(oldRoute(sq, 3, 0));
    expect(waypointRoute(sq, 2, 2)).toEqual([2]);
  });

  it('is quick on a 15 000-waypoint grid (a 1 km royale map)', () => {
    const N = 122; // 122 × 122 ≈ 15k waypoints, 8 m apart
    const wps: WaypointDef[] = [];
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        const links: number[] = [];
        const i = z * N + x;
        if (x > 0) links.push(i - 1);
        if (x < N - 1) links.push(i + 1);
        if (z > 0) links.push(i - N);
        if (z < N - 1) links.push(i + N);
        wps.push({ pos: v3(x * 8, 0, z * 8), links });
      }
    const t0 = now();
    for (let k = 0; k < 5; k++)
      expect(waypointRoute(wps, 0, wps.length - 1 - k).length).toBeGreaterThan(200);
    // (the old scan took seconds per route here; generous for slow CI machines)
    expect((now() - t0) / 5).toBeLessThan(250);
  });
});
