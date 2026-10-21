// Openness: can a player take one duel at a time, or are they shot at from everywhere at once?
//
// Owner's rule for the competitive pool: maps play like CS maps — rooms, corridors, floors and
// partitions that split the map into separate fights — not a flat hall with crates on it.
// Two numbers measure it, on every spot a player can reach (floor and wall/ceiling gravity):
//
//  - watched area: how many square metres of standing floor (any level) within duel range
//    have a clear line from an eye to your chest. A corridor spot is watched by the corridor's
//    two ends; a spot in the middle of a big open hall by the whole hall.
//  - angles: from how many of the 8 compass directions (45° each) at least two such spots see
//    you. In a corridor that is 2; on a CS site 3–5; on open ground with cover dotted about, 7–8.
//
// OPENNESS_TARGET holds the limits the competitive maps must meet (tools/map/test).
import type { Analyzer, Sample } from './metrics';

export interface OpennessOptions {
  /** viewers: every n-th reachable standing spot in both grid directions */
  viewerStride: number;
  /** targets: every n-th spot (offset from the viewers so a spot never watches itself) */
  targetStride: number;
  /** only viewers this close count (m): duel range; farther ones are fog and luck */
  range: number;
  /** viewers closer than this (m) are ignored: someone standing next to you is not an angle */
  minDist: number;
  /** a direction counts as an angle once this many viewer spots in it see you */
  perAngle: number;
}

export const defaultOpennessOptions = (): OpennessOptions => ({
  viewerStride: 2,
  targetStride: 2,
  range: 60,
  minDist: 3,
  perAngle: 2,
});

export interface OpennessRegion {
  region: string;
  spots: number;
  watchedMean: number;
  anglesMean: number;
}

export interface OpennessReport {
  spots: number;
  /** m² of floor per viewer spot */
  viewerArea: number;
  watchedMean: number;
  watchedMedian: number;
  watchedP90: number;
  anglesMean: number;
  anglesMedian: number;
  /** share (%) of spots seen from 6 or more of the 8 directions: "shot from everywhere" */
  wideShare: number;
  /** the most open regions first */
  regions: OpennessRegion[];
}

/** The limits a competitive map must meet (Split Deck, the reference layout, is well inside). */
export const OPENNESS_TARGET = {
  /** mean watched area (m²) */
  watchedMean: 800,
  /** 90th percentile watched area (m²): no huge killing field either */
  watchedP90: 1500,
  /** share (%) of spots seen from 6+ directions */
  wideShare: 30,
};

const standing = (s: Sample): boolean =>
  s.reachable && (s.kind === 'floor' || s.kind === 'gravity');
const fromCentre = (g: number): number => (g >= 0 ? g : -1 - g);
const onGrid = (s: Sample, stride: number, offset: number): boolean =>
  fromCentre(s.gi) % stride === offset && fromCentre(s.gj) % stride === offset;

const quantile = (sorted: number[], p: number): number =>
  sorted.length ? sorted[Math.floor(p * (sorted.length - 1))] : 0;
const r0 = (x: number): number => Math.round(x);
const r1 = (x: number): number => Math.round(x * 10) / 10;

/** Openness of an analysed map (samples already found: findSamples). Pure. */
export const measureOpenness = (
  an: Analyzer,
  o: OpennessOptions = defaultOpennessOptions(),
): OpennessReport => {
  const pool = an.samples.filter(standing);
  const viewers = pool.filter((s) => onGrid(s, o.viewerStride, 0));
  const targets = pool.filter((s) => onGrid(s, o.targetStride, o.targetStride > 1 ? 1 : 0));
  const cell = an.opts.spacing * o.viewerStride;
  const viewerArea = cell * cell;
  const watched: number[] = [];
  const angles: number[] = [];
  const per = new Map<string, { n: number; w: number; a: number }>();
  const range2 = o.range * o.range;
  const min2 = o.minDist * o.minDist;
  for (const t of targets) {
    let n = 0;
    const dirs = new Uint16Array(8);
    for (const v of viewers) {
      const dx = v.feet.x - t.feet.x;
      const dy = v.feet.y - t.feet.y;
      const dz = v.feet.z - t.feet.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > range2 || d2 < min2) continue;
      if (!an.rays.los(v.eye, t.chest)) continue;
      n++;
      // straight above or below: counts toward the area, but in no compass direction
      if (dx * dx + dz * dz < 1) continue;
      dirs[Math.floor(((Math.atan2(dz, dx) + Math.PI) / (2 * Math.PI)) * 8) % 8]++;
    }
    const a = dirs.filter((c) => c >= o.perAngle).length;
    watched.push(n * viewerArea);
    angles.push(a);
    const name = t.region >= 0 ? an.config.regions[t.region].name : 'other';
    const e = per.get(name) ?? { n: 0, w: 0, a: 0 };
    e.n++;
    e.w += n * viewerArea;
    e.a += a;
    per.set(name, e);
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : 0);
  const ws = [...watched].sort((p, q) => p - q);
  const as = [...angles].sort((p, q) => p - q);
  return {
    spots: targets.length,
    viewerArea,
    watchedMean: r0(mean(watched)),
    watchedMedian: r0(quantile(ws, 0.5)),
    watchedP90: r0(quantile(ws, 0.9)),
    anglesMean: r1(mean(angles)),
    anglesMedian: quantile(as, 0.5),
    wideShare: r1((100 * angles.filter((a) => a >= 6).length) / Math.max(1, angles.length)),
    regions: [...per.entries()]
      .map(([region, e]) => ({
        region,
        spots: e.n,
        watchedMean: r0(e.w / e.n),
        anglesMean: r1(e.a / e.n),
      }))
      .sort((p, q) => q.watchedMean - p.watchedMean || p.region.localeCompare(q.region)),
  };
};

/** Which targets a report misses (empty = it meets OPENNESS_TARGET). */
export const opennessProblems = (r: OpennessReport): string[] => {
  const out: string[] = [];
  const T = OPENNESS_TARGET;
  if (r.watchedMean > T.watchedMean)
    out.push(`mean watched area ${r.watchedMean} m² > ${T.watchedMean} m²`);
  if (r.watchedP90 > T.watchedP90)
    out.push(`90th percentile watched area ${r.watchedP90} m² > ${T.watchedP90} m²`);
  if (r.wideShare > T.wideShare)
    out.push(`${r.wideShare}% of spots seen from 6+ directions > ${T.wideShare}%`);
  return out;
};
