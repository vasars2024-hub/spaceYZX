// MAP MAKER — where a moving block is at a given time (the editor's live preview). Position is a
// pure function of time, like in the game: at t = 0 it is at point 1, waits `delay`, travels at
// `speed` to point 2, waits, ... and after the last point travels back to point 1, forever.
import type { V3 } from './model';

const dist = (a: V3, b: V3): number => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

/** Seconds one full loop takes (1 → 2 → … → last → 1, waiting at every point). */
export const moverCycle = (points: V3[], speed: number, delay: number): number => {
  if (points.length < 2 || speed <= 0) return 0;
  let t = 0;
  for (let i = 0; i < points.length; i++)
    t += delay + dist(points[i], points[(i + 1) % points.length]) / speed;
  return t;
};

/** The block's centre at time `t` seconds. */
export const moverPosAt = (points: V3[], speed: number, delay: number, t: number): V3 => {
  if (points.length < 2 || speed <= 0) return [...points[0]] as V3;
  const cycle = moverCycle(points, speed, delay);
  if (cycle <= 0) return [...points[0]] as V3;
  let tt = ((t % cycle) + cycle) % cycle;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (tt < delay) return [...a] as V3;
    tt -= delay;
    const dur = dist(a, b) / speed;
    if (tt < dur) {
      const k = dur > 0 ? tt / dur : 1;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
    tt -= dur;
  }
  return [...points[0]] as V3;
};
