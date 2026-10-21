// Moving blocks (LevelDef.movers): where a mover is at a given world tick. A pure function of
// the tick (no state in the world), so the server, every client's prediction and the renderer
// agree without sending anything. Only + - * / and sqrt (exactly rounded in every JS engine),
// so the answer is bit-identical on every machine.
//
// The timeline, in whole ticks: wait `delay` at point 1, travel to point 2 at `speed`, wait,
// ..., travel from the last point back to point 1, and loop (1 → 2 → 3 → 4 → 1, never back and
// forth). Fractional ticks (the renderer's interpolated time) land between whole ticks.
import type { Vec3 } from '../math/vec3';
import { v3 } from '../math/vec3';
import { TICK_RATE } from '../sim/constants';
import type { MoverDef } from './types';

/** A mover's timeline in ticks (precomputed once per level). */
export interface MoverTimeline {
  path: Vec3[];
  /** ticks spent waiting at each point */
  wait: number;
  /** ticks travelling from point i to point i + 1 (the last: back to point 0) */
  travel: number[];
  /** one full loop */
  period: number;
}

const dist = (a: Vec3, b: Vec3): number => {
  const x = b.x - a.x;
  const y = b.y - a.y;
  const z = b.z - a.z;
  return Math.sqrt(x * x + y * y + z * z);
};

export const moverTimeline = (
  path: readonly Vec3[],
  speed: number,
  delay: number,
): MoverTimeline => {
  const wait = Math.max(0, Math.round(delay * TICK_RATE));
  const sp = speed > 0 ? speed : 1;
  const travel = path.map((p, i) =>
    Math.max(1, Math.round((dist(p, path[(i + 1) % path.length]) / sp) * TICK_RATE)),
  );
  let period = 0;
  for (const t of travel) period += wait + t;
  return { path: path.map((p) => v3(p.x, p.y, p.z)), wait, travel, period };
};

/** Where the timeline is at `tick` (fractional ticks allowed), written into `out`. */
export const timelineAt = (tl: MoverTimeline, tick: number, out: Vec3 = v3()): Vec3 => {
  const n = tl.path.length;
  if (n === 0 || !(tl.period > 0)) {
    out.x = out.y = out.z = 0;
    return out;
  }
  let t = tick % tl.period;
  if (t < 0) t += tl.period;
  for (let i = 0; i < n; i++) {
    const a = tl.path[i];
    if (t < tl.wait) {
      out.x = a.x;
      out.y = a.y;
      out.z = a.z;
      return out;
    }
    t -= tl.wait;
    const tr = tl.travel[i];
    if (t < tr) {
      const b = tl.path[(i + 1) % n];
      const f = t / tr;
      out.x = a.x + (b.x - a.x) * f;
      out.y = a.y + (b.y - a.y) * f;
      out.z = a.z + (b.z - a.z) * f;
      return out;
    }
    t -= tr;
  }
  // (rounding at the very end of the loop): back at the start
  out.x = tl.path[0].x;
  out.y = tl.path[0].y;
  out.z = tl.path[0].z;
  return out;
};

/** A mover's offset from its boxes' authored place at `tick` (fractional ticks allowed). */
export const moverOffset = (m: MoverDef, tick: number): Vec3 =>
  timelineAt(moverTimeline(m.path, m.speed, m.delay), tick);
