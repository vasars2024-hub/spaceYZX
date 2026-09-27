// Reusable route sections for authoring courses with the pen (./pen.ts): a bunny-hop chain, a
// run of surf ramps with transfers, a window jump, a pillar weave... Each writes ordinary
// course elements (plain data); tracks mix them with their own numbers.
import type { P2 } from './types';
import type { Pen } from './pen';

export interface HopChainOpts {
  /** pads in the chain */
  n: number;
  /** centre-to-centre distance to the first pad (from the pen), then growing by `grow` */
  first: number;
  grow?: number;
  /** the largest step */
  max?: number;
  /** turn per hop (degrees, + = right), or a list per hop */
  turn?: number | number[];
  /** rise per hop (metres, negative = down), or a list per hop */
  rise?: number | number[];
  size?: P2;
}

/** A bunny-hop chain (the pen ends on the last pad; leave it with `go`). */
export const hopChain = (p: Pen, o: HopChainOpts): Pen => {
  const steps = [];
  for (let i = 0; i < o.n; i++) {
    const d = Math.min(o.max ?? Infinity, o.first + (o.grow ?? 0) * i);
    const turn = Array.isArray(o.turn) ? (o.turn[i] ?? 0) : (o.turn ?? 0);
    const rise = Array.isArray(o.rise) ? (o.rise[i] ?? 0) : (o.rise ?? 0);
    steps.push({ d, turn: i === 0 ? 0 : turn, rise, size: o.size });
  }
  return p.pads(steps, 'hop', o.size ?? [5, 5]);
};

export interface RampOpts {
  length: number;
  drop: number;
  height: number;
  angle: number;
  side: 'left' | 'right' | 'both';
  ride?: 'left' | 'right';
  /** the flight onto this ramp: forward, down, sideways (+ = right), and a turn first */
  gap?: number;
  fall?: number;
  shift?: number;
  turn?: number;
  /**
   * dropping in from a platform: the ramp sits so you come down on its face 2 m out from the
   * ridge (never onto the ridge or the far face); `shift` is then worked out
   */
  entry?: boolean;
}

/** A run of surf ramps, each reached by a flight from the last (the first from the pen). */
export const surfRun = (p: Pen, ramps: RampOpts[]): Pen => {
  for (const r of ramps) {
    if (r.turn) p.turn(r.turn);
    let shift = r.shift ?? 0;
    if (r.entry) {
      const face = r.side === 'both' ? (r.ride ?? 'right') : r.side;
      const run = r.height / Math.tan((r.angle * Math.PI) / 180);
      shift = (face === 'right' ? 1 : -1) * (run * 0.3 - 2);
    }
    if (r.gap || r.fall || shift) p.move(r.gap ?? 0, -(r.fall ?? 0), shift);
    p.surf(r);
  }
  return p;
};

/**
 * A tall block beside the chain the pen just built (the last `jumps`): between pads `a` and `b`,
 * `offset` metres to the right of the line between them (negative = left): hop round it.
 */
export const wallBeside = (
  p: Pen,
  a: number,
  b: number,
  offset: number,
  size: [number, number, number],
  below = 12,
): Pen => {
  const chain = [...p.route].reverse().find((e) => e.t === 'jumps');
  if (!chain || chain.t !== 'jumps') throw new Error('wallBeside: no hop chain');
  const A = chain.pads[a].at;
  const B = chain.pads[b].at;
  const dx = B[0] - A[0];
  const dz = B[2] - A[2];
  const l = Math.hypot(dx, dz) || 1;
  // right of the way (heading along A → B): (-dz, dx) / l
  const rx = -dz / l;
  const rz = dx / l;
  const heading = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  const r = (x: number) => Math.round(x * 1000) / 1000;
  p.route.push({
    t: 'wall',
    at: [
      r((A[0] + B[0]) / 2 + rx * offset),
      r(Math.min(A[1], B[1]) - below),
      r((A[2] + B[2]) / 2 + rz * offset),
    ],
    size,
    heading: r(heading),
  });
  return p;
};
