// Top-down floor plans (SVG) of a level, with the analysis overlays. View from above:
// x → right, z ↓ down (the true top-down view, so left/right match what players see in game).
// One plan per height band; optional heat-map layers colour each walkable spot by a metric.
import { isZeroG, v3, type Level, type Vec3 } from '@space-yz/shared';
import type { Analyzer, Sample } from './metrics';

export interface Band {
  name: 'ground' | 'upper';
  label: string;
  /** boxes intersecting this height range are drawn */
  lo: number;
  hi: number;
  /** floor samples with feet in this range are drawn as walkable tiles */
  feetLo: number;
  feetHi: number;
  /** walkable tops at or above this height but below the band are outlined as raised */
  raisedFrom: number;
}

export const BANDS: Record<Band['name'], Band> = {
  ground: {
    name: 'ground',
    label: 'ground level — walls and cover at 0.1–2 m',
    lo: 0.1,
    hi: 2.0,
    feetLo: -2,
    feetHi: 2.05,
    raisedFrom: Infinity,
  },
  upper: {
    name: 'upper',
    label: 'upper level — geometry at 4–9 m (balconies, ramps, crate tops)',
    lo: 4,
    hi: 9,
    feetLo: 2.05,
    feetHi: 9.5,
    raisedFrom: 2.05,
  },
};

export interface HeatLayer {
  title: string;
  /** value per sample id (NaN = not measured, not drawn) */
  values: ArrayLike<number>;
  /** ascending bin edges; bin i = [edges[i-1], edges[i]) */
  edges: number[];
  labels: string[];
  note?: string;
  /** draw only samples with value > 0 (others as plain floor) */
  skipZero?: boolean;
}

export interface PlanOptions {
  band: Band;
  title: string;
  heat?: HeatLayer;
  /** width of the whole image in px (the map is scaled to fit) */
  width?: number;
  /** draw the analysis chokepoints (default: plain plans only) */
  chokepoints?: boolean;
  /** numbered lines to draw on top (e.g. the longest sightlines) */
  lines?: { from: Vec3; to: Vec3; label: string }[];
}

// ---------------------------------------------------------------- palette (see dataviz skill)
const C = {
  surface: '#fcfcfb',
  ink: '#0b0b0b',
  ink2: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  floor: '#ecebe6',
  wall: '#3d3c3a',
  block: '#6b6a66',
  cover: '#c9c8c0',
  teamA: '#2a78d6',
  teamB: '#eb6834',
  zone: '#1baf7a',
};
/** sequential blue ramp (steps 150 → 650) for heat maps */
export const RAMP = ['#b7d3f6', '#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'];

const f1 = (n: number): string => (Math.round(n * 10) / 10).toString();
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtH = (h: number): string => (Math.round(h * 10) / 10).toFixed(1);

interface View {
  x0: number;
  z0: number;
  s: number; // px per metre
  left: number;
  top: number;
  mapW: number;
  mapH: number;
}

const sx = (v: View, x: number) => v.left + (x - v.x0) * v.s;
const sy = (v: View, z: number) => v.top + (z - v.z0) * v.s;

const rect = (
  v: View,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  attrs: string,
  title?: string,
): string => {
  const a = sx(v, Math.min(x0, x1));
  const b = sy(v, Math.min(z0, z1));
  const w = Math.abs(x1 - x0) * v.s;
  const h = Math.abs(z1 - z0) * v.s;
  const t = title ? `<title>${esc(title)}</title>` : '';
  return t
    ? `<rect x="${f1(a)}" y="${f1(b)}" width="${f1(w)}" height="${f1(h)}" ${attrs}>${t}</rect>`
    : `<rect x="${f1(a)}" y="${f1(b)}" width="${f1(w)}" height="${f1(h)}" ${attrs}/>`;
};

const text = (x: number, y: number, s: string, attrs = ''): string =>
  `<text x="${f1(x)}" y="${f1(y)}" ${attrs}>${esc(s)}</text>`;

/** text with a surface-coloured halo so it stays readable over any fill */
const label = (x: number, y: number, s: string, size = 10, attrs = ''): string =>
  `<text x="${f1(x)}" y="${f1(y)}" font-size="${size}" class="halo" ${attrs}>${esc(s)}</text>` +
  `<text x="${f1(x)}" y="${f1(y)}" font-size="${size}" ${attrs}>${esc(s)}</text>`;

// ---------------------------------------------------------------- geometry helpers

type Box = Level['boxes'][number];

const inZone = (p: Vec3, min: Vec3, max: Vec3): boolean =>
  p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y && p.z >= min.z && p.z <= max.z;

const zeroGZoneOf = (level: Level, p: Vec3): boolean =>
  level.zones.some((z) => isZeroG(z.gravity) && inZone(p, z.min, z.max));

/** Top of the geometry directly below the box (or -Infinity). */
const supportBelow = (an: Analyzer, b: Box): number => {
  const o = v3(b.c.x, b.min.y - 0.01, b.c.z);
  const h = an.rays.raycast(o, v3(0, -1, 0), 60);
  return h ? o.y - h.t : -Infinity;
};

const corners = (b: Box): Vec3[] => {
  const out: Vec3[] = [];
  for (const i of [-1, 1])
    for (const j of [-1, 1])
      for (const k of [-1, 1])
        out.push(
          v3(
            b.c.x + b.ax.x * b.h.x * i + b.ay.x * b.h.y * j + b.az.x * b.h.z * k,
            b.c.y + b.ax.y * b.h.x * i + b.ay.y * b.h.y * j + b.az.y * b.h.z * k,
            b.c.z + b.ax.z * b.h.x * i + b.ay.z * b.h.y * j + b.az.z * b.h.z * k,
          ),
        );
  return out;
};

/** Convex hull of points in the x/z plane (monotone chain). */
const hull = (pts: { x: number; z: number }[]): { x: number; z: number }[] => {
  const p = [...pts].sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (o: { x: number; z: number }, a: { x: number; z: number }, b: typeof o) =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower: typeof p = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0)
      lower.pop();
    lower.push(q);
  }
  const upper: typeof p = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0)
      upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
};

/** Ramp: walking-surface heights at its two ends and the uphill direction (x/z). */
const rampInfo = (b: Box): { low: Vec3; high: Vec3 } => {
  // the thin axis is the one pointing most upward; the slope runs along the steeper other one
  const axes = [
    { a: b.ax, h: b.h.x },
    { a: b.ay, h: b.h.y },
    { a: b.az, h: b.h.z },
  ];
  const thin = axes.reduce((m, x) => (Math.abs(x.a.y) > Math.abs(m.a.y) ? x : m));
  const rest = axes.filter((x) => x !== thin);
  const slope = rest.reduce((m, x) => (Math.abs(x.a.y) > Math.abs(m.a.y) ? x : m));
  const top = (s: number) =>
    v3(
      b.c.x + slope.a.x * slope.h * s + thin.a.x * thin.h * Math.sign(thin.a.y),
      b.c.y + slope.a.y * slope.h * s + thin.a.y * thin.h * Math.sign(thin.a.y),
      b.c.z + slope.a.z * slope.h * s + thin.a.z * thin.h * Math.sign(thin.a.y),
    );
  const e1 = top(1);
  const e2 = top(-1);
  return e1.y < e2.y ? { low: e1, high: e2 } : { low: e2, high: e1 };
};

/**
 * Where a sample/point is drawn: floors and ceilings straight from above; the surface of a
 * wall-gravity zone is "unfolded" (laid flat into the zone's footprint, hinged at its floor).
 */
const planPoint = (
  an: Analyzer,
  s: Sample | null,
  p: Vec3,
  zone: number,
): { x: number; z: number } => {
  if (zone < 0) return { x: p.x, z: p.z };
  const z = an.level.zones[zone];
  const g = z.gravity;
  const ay = Math.abs(g.y);
  if (s && s.kind !== 'gravity') return { x: p.x, z: p.z };
  if (ay >= Math.abs(g.x) && ay >= Math.abs(g.z)) return { x: p.x, z: p.z };
  const fy = (p.y - z.min.y) / Math.max(1e-6, z.max.y - z.min.y); // 0 at the zone floor
  if (Math.abs(g.z) >= Math.abs(g.x)) {
    const zz = g.z < 0 ? z.min.z + fy * (z.max.z - z.min.z) : z.max.z - fy * (z.max.z - z.min.z);
    return { x: p.x, z: zz };
  }
  const xx = g.x < 0 ? z.min.x + fy * (z.max.x - z.min.x) : z.max.x - fy * (z.max.x - z.min.x);
  return { x: xx, z: p.z };
};

/** Zones whose surface is drawn unfolded (gravity mostly sideways). */
const sidewaysZones = (level: Level): number[] =>
  level.zones
    .map((z, i) => ({ z, i }))
    .filter(
      ({ z }) =>
        !isZeroG(z.gravity) &&
        Math.abs(z.gravity.y) < Math.max(Math.abs(z.gravity.x), Math.abs(z.gravity.z)),
    )
    .map(({ i }) => i);

/** Short label for a gravity zone: [what gravity does, extra note]. */
const gravityWords = (g: Vec3, unfolded: boolean): [string, string] => {
  if (isZeroG(g)) return ['ZERO-G', 'mag boots on any surface'];
  const ax = Math.abs(g.x),
    ay = Math.abs(g.y),
    az = Math.abs(g.z);
  if (ay >= ax && ay >= az)
    return g.y > 0 ? ['CEILING GRAVITY ↑', 'walk on the ceiling'] : ['GRAVITY ↓', ''];
  const dir = ax >= az ? (g.x > 0 ? '+x' : '−x') : g.z > 0 ? '+z' : '−z';
  return [`WALL GRAVITY → ${dir}`, unfolded ? 'wall shown unfolded' : 'walk on the wall'];
};

// ---------------------------------------------------------------- the plan

export const renderPlan = (an: Analyzer, opts: PlanOptions): string => {
  const { level } = an;
  const def = level.def;
  const band = opts.band;
  const W = opts.width ?? 1600;
  const margin = { l: 64, r: 36, t: opts.heat?.note ? 104 : 84 };
  const x0 = def.boundsMin.x;
  const x1 = def.boundsMax.x;
  const z0 = def.boundsMin.z;
  const z1 = def.boundsMax.z;
  const s = (W - margin.l - margin.r) / (x1 - x0);
  const v: View = {
    x0,
    z0,
    s,
    left: margin.l,
    top: margin.t,
    mapW: (x1 - x0) * s,
    mapH: (z1 - z0) * s,
  };
  const legendTop = v.top + v.mapH + 44;
  const H = Math.round(legendTop + (opts.heat ? 150 : 170));
  const out: string[] = [];
  const defs: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">`,
  );
  defs.push(
    `<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${C.zone}" stroke-width="1.4" stroke-opacity="0.45"/></pattern>`,
    `<pattern id="over" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(135)"><line x1="0" y1="0" x2="0" y2="5" stroke="${C.muted}" stroke-width="0.9"/></pattern>`,
    `<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" fill="${C.ink2}"/></marker>`,
    `<marker id="arrowW" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" fill="${C.muted}"/></marker>`,
  );
  out.push(`<defs>${defs.join('')}</defs>`);
  out.push(
    `<style>text{fill:${C.ink}} .halo{stroke:${C.surface};stroke-width:3px;stroke-linejoin:round;fill:${C.surface}} .m{fill:${C.ink2}} .w{fill:#ffffff}</style>`,
  );
  out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${C.surface}"/>`);
  // title
  out.push(text(margin.l, 30, opts.title, `font-size="20" font-weight="600"`));
  out.push(
    text(
      margin.l,
      52,
      `${def.name} · ${band.label} · top-down view, x → right, z ↓ down · 1 grid square = 10 m`,
      `font-size="13" class="m"`,
    ),
  );
  if (opts.heat?.note) out.push(text(margin.l, 70, opts.heat.note, `font-size="12" class="m"`));

  // map frame + clip
  out.push(
    `<clipPath id="mapclip"><rect x="${f1(v.left)}" y="${f1(v.top)}" width="${f1(v.mapW)}" height="${f1(v.mapH)}"/></clipPath>`,
  );
  const map: string[] = [];

  // 10 m grid
  for (let x = Math.ceil(x0 / 10) * 10; x <= x1; x += 10)
    map.push(
      `<line x1="${f1(sx(v, x))}" y1="${f1(v.top)}" x2="${f1(sx(v, x))}" y2="${f1(v.top + v.mapH)}" stroke="${C.grid}" stroke-width="${x === 0 ? 1.4 : 0.8}"/>`,
    );
  for (let z = Math.ceil(z0 / 10) * 10; z <= z1; z += 10)
    map.push(
      `<line x1="${f1(v.left)}" y1="${f1(sy(v, z))}" x2="${f1(v.left + v.mapW)}" y2="${f1(sy(v, z))}" stroke="${C.grid}" stroke-width="${z === 0 ? 1.4 : 0.8}"/>`,
    );

  // walkable tops (boxes that carry reachable floor spots)
  const walkTops = new Set<number>();
  for (const smp of an.samples)
    if (smp.reachable && smp.kind === 'floor' && smp.box >= 0) walkTops.add(smp.box);
  const inFeet = (y: number) => y >= band.feetLo && y <= band.feetHi;

  // floors: every walkable slab whose top is in this band's floor range
  const floors: string[] = [];
  for (const b of level.boxes)
    if (b.collide && !b.rotated && walkTops.has(b.index) && inFeet(b.max.y))
      floors.push(rect(v, b.min.x, b.min.z, b.max.x, b.max.z, `fill="${C.floor}"`));
  map.push(`<g>${floors.join('')}</g>`);

  // heat cells (heat maps) — walkable spots coloured by the metric
  const sideways = new Set(sidewaysZones(level));
  const heat = opts.heat;
  const tiles: { box: number; svg: string }[] = [];
  let tileSlot = -1;
  if (heat) {
    const inBand = (smp: Sample): boolean => {
      if (!smp.reachable) return false;
      if (smp.kind === 'floor') return inFeet(smp.feet.y);
      if (smp.kind === 'gravity') return band.name === 'ground';
      if (smp.kind === 'float') return smp.eye.y >= band.feetLo && smp.eye.y <= band.feetHi + 1.6;
      return false;
    };
    const binOf = (val: number): number => {
      let i = 0;
      while (i < heat.edges.length && val >= heat.edges[i]) i++;
      return Math.min(i, RAMP.length - 1);
    };
    const dots: string[] = [];
    for (const smp of an.samples.filter(inBand).sort((a, b) => a.feet.y - b.feet.y)) {
      const val = heat.values[smp.id];
      if (!Number.isFinite(val) || (heat.skipZero && val <= 0)) continue;
      const sp = an.passes[smp.pass].spacing;
      const zone = smp.kind === 'gravity' && sideways.has(smp.zone) ? smp.zone : -1;
      const p = planPoint(an, smp, smp.feet, zone);
      const fill = RAMP[binOf(val)];
      if (smp.kind === 'float') {
        dots.push(
          `<circle cx="${f1(sx(v, p.x))}" cy="${f1(sy(v, p.z))}" r="${f1(Math.max(2.5, sp * v.s * 0.2))}" fill="${fill}" stroke="${C.surface}" stroke-width="1"/>`,
        );
        continue;
      }
      // a spot is clipped to the top of the box it stands on (crate tops, balcony edges)
      let [ax, az, bx, bz] = [p.x - sp / 2, p.z - sp / 2, p.x + sp / 2, p.z + sp / 2];
      const sb = smp.box >= 0 && zone < 0 && smp.kind === 'floor' ? level.boxes[smp.box] : null;
      if (sb && !sb.rotated) {
        ax = Math.max(ax, sb.min.x);
        az = Math.max(az, sb.min.z);
        bx = Math.min(bx, sb.max.x);
        bz = Math.min(bz, sb.max.z);
        if (bx <= ax || bz <= az) continue;
      }
      tiles.push({
        box: zone < 0 ? smp.box : -1,
        svg: `<rect x="${f1(sx(v, ax))}" y="${f1(sy(v, az))}" width="${f1((bx - ax) * v.s + 0.3)}" height="${f1((bz - az) * v.s + 0.3)}" fill="${fill}"/>`,
      });
    }
    // tiles are placed after the boxes are drawn (see below), so spots on top of a box that the
    // plan fills (crate tops, balconies, ramps) are not hidden under it
    tileSlot = map.length;
    map.push('');
    map.push(`<g>${dots.join('')}</g>`);
  }

  // gravity zones: tint over the floor
  level.zones.forEach((z) => {
    const fill = isZeroG(z.gravity)
      ? `fill="${C.zone}" fill-opacity="${heat ? 0.06 : 0.1}"`
      : `fill="url(#hatch)"`;
    map.push(
      rect(v, z.min.x, z.min.z, z.max.x, z.max.z, `${fill} stroke="${C.zone}" stroke-width="1.2"`),
    );
  });

  // boxes
  const labels: string[] = [];
  const boxes: string[] = [];
  const gravityCover: Box[] = [];
  /** outline of every box drawn with an opaque fill (redrawn over heat tiles on its top) */
  const outlines = new Map<number, string>();
  const filled = (b: Box, svg: string, outline?: string): string => {
    outlines.set(
      b.index,
      outline ??
        rect(
          v,
          b.min.x,
          b.min.z,
          b.max.x,
          b.max.z,
          `fill="none" stroke="${C.ink2}" stroke-width="1"`,
        ),
    );
    return svg;
  };
  const nearTower = (b: Box) =>
    def.towers.some((t) => Math.hypot(b.c.x - t.pos.x, b.c.z - t.pos.z) < t.radius + 0.5);
  for (const b of level.boxes) {
    if (!b.collide) continue;
    // cover attached to a sideways/ceiling gravity surface: drawn in the ground plan's zone view
    const zi = level.zones.findIndex(
      (z) => !isZeroG(z.gravity) && z.gravity.y >= 0 && inZone(b.c, z.min, z.max),
    );
    if (zi >= 0 && Math.max(b.h.x, b.h.y, b.h.z) < 5) {
      if (band.name === 'ground') gravityCover.push(b);
      continue;
    }
    const title = `box #${b.index}: x ${f1(b.min.x)}…${f1(b.max.x)}, y ${f1(b.min.y)}…${f1(b.max.y)}, z ${f1(b.min.z)}…${f1(b.max.z)}`;
    const wpx = 2 * b.h.x * v.s;
    const hpx = 2 * b.h.z * v.s;
    const putLabel = (txt: string, dark: boolean) => {
      if (nearTower(b)) return;
      if (heat)
        labels.push(label(sx(v, b.c.x), sy(v, b.c.z) + 3.5, txt, 9.5, `text-anchor="middle"`));
      else if (wpx >= txt.length * 5.6 + 4 && hpx >= 11)
        labels.push(
          text(
            sx(v, b.c.x),
            sy(v, b.c.z) + 3.5,
            txt,
            `font-size="9.5" text-anchor="middle" ${dark ? 'class="w"' : ''}`,
          ),
        );
      else labels.push(label(sx(v, b.max.x) + 2, sy(v, b.c.z) + 3.5, txt, 9.5));
    };
    // floating boxes in zero-G: players meet them at any height, so both plans show them
    if (!b.rotated && zeroGZoneOf(level, b.c)) {
      boxes.push(
        filled(
          b,
          rect(
            v,
            b.min.x,
            b.min.z,
            b.max.x,
            b.max.z,
            `fill="${C.surface}" fill-opacity="0.6" stroke="${C.ink2}" stroke-width="1.2" stroke-dasharray="4 3"`,
            `${title} (floating in zero-G)`,
          ),
        ),
      );
      labels.push(
        label(
          sx(v, b.max.x) + 3,
          sy(v, b.c.z) + 3,
          `y ${fmtH(b.min.y)} to ${fmtH(b.max.y)}`,
          9,
          `class="m"`,
        ),
      );
      continue;
    }
    const inBandY = b.max.y > band.lo && b.min.y < band.hi;
    if (!inBandY) {
      if (b.rotated) continue;
      // raised walkable tops just below the band (crate tops in the upper plan)
      if (walkTops.has(b.index) && inFeet(b.max.y) && b.max.y >= band.raisedFrom) {
        boxes.push(
          filled(
            b,
            rect(
              v,
              b.min.x,
              b.min.z,
              b.max.x,
              b.max.z,
              `fill="#f7f6f2" stroke="${C.ink}" stroke-width="1.4"`,
              `${title} — walkable top at ${fmtH(b.max.y)} m`,
            ),
            rect(
              v,
              b.min.x,
              b.min.z,
              b.max.x,
              b.max.z,
              `fill="none" stroke="${C.ink}" stroke-width="1.4"`,
            ),
          ),
        );
        putLabel(`${fmtH(b.max.y)} m`, false);
      }
      // walkways above the band (balconies seen from the ground plan)
      else if (walkTops.has(b.index) && b.min.y >= band.hi && b.max.y <= band.hi + 8)
        boxes.push(
          rect(
            v,
            b.min.x,
            b.min.z,
            b.max.x,
            b.max.z,
            `fill="none" stroke="${C.ink2}" stroke-width="1.2" stroke-dasharray="2 3"`,
            `${title} — walkway above (top ${fmtH(b.max.y)} m)`,
          ),
        );
      continue;
    }
    if (b.rotated) {
      const pts = hull(corners(b).map((p) => ({ x: p.x, z: p.z })));
      const d =
        pts.map((p, i) => `${i ? 'L' : 'M'}${f1(sx(v, p.x))},${f1(sy(v, p.z))}`).join('') + 'Z';
      // turned about the vertical only (an angled wall or crate): not a ramp
      if (Math.max(Math.abs(b.ax.y), Math.abs(b.ay.y), Math.abs(b.az.y)) > 0.999) {
        const path = `<path d="${d}" fill="${C.wall}"><title>${esc(`${title} — angled, top at ${fmtH(b.max.y)} m`)}</title></path>`;
        boxes.push(
          filled(b, path, `<path d="${d}" fill="none" stroke="${C.ink2}" stroke-width="1"/>`),
        );
        continue;
      }
      const r = rampInfo(b);
      boxes.push(
        filled(
          b,
          `<path d="${d}" fill="#e3e2dc" stroke="${C.ink2}" stroke-width="1"><title>${esc(`${title} (ramp ${fmtH(r.low.y)} → ${fmtH(r.high.y)} m)`)}</title></path>`,
          `<path d="${d}" fill="none" stroke="${C.ink2}" stroke-width="1"/>`,
        ),
      );
      const a = {
        x: r.low.x + (r.high.x - r.low.x) * 0.2,
        z: r.low.z + (r.high.z - r.low.z) * 0.2,
      };
      const e = {
        x: r.low.x + (r.high.x - r.low.x) * 0.8,
        z: r.low.z + (r.high.z - r.low.z) * 0.8,
      };
      boxes.push(
        `<line x1="${f1(sx(v, a.x))}" y1="${f1(sy(v, a.z))}" x2="${f1(sx(v, e.x))}" y2="${f1(sy(v, e.z))}" stroke="${C.ink2}" stroke-width="1.3" marker-end="url(#arrow)"/>`,
      );
      labels.push(
        label(
          sx(v, (r.low.x + r.high.x) / 2),
          sy(v, (r.low.z + r.high.z) / 2) - 5,
          `ramp ${fmtH(r.low.y)}→${fmtH(r.high.y)}`,
          9,
          `text-anchor="middle"`,
        ),
      );
      continue;
    }
    const support = supportBelow(an, b);
    const rests = b.min.y - support <= 0.25;
    const height = b.max.y - (rests ? support : b.min.y);
    const spans = b.min.y <= band.lo + 0.01 && b.max.y >= band.hi - 0.01;
    const footprint = Math.max(2 * b.h.x, 2 * b.h.z);
    // long slabs and anything 5 m or taller act as walls (no one climbs or shoots over them)
    const wallLike = footprint >= 12 || height >= 5;
    if (spans && (wallLike || !rests)) {
      boxes.push(filled(b, rect(v, b.min.x, b.min.z, b.max.x, b.max.z, `fill="${C.wall}"`, title)));
    } else if (b.min.y <= band.lo + 0.01) {
      // stands on the floor and ends inside (or spans) the band
      if (!rests || wallLike) {
        boxes.push(
          filled(
            b,
            rect(
              v,
              b.min.x,
              b.min.z,
              b.max.x,
              b.max.z,
              `fill="${C.wall}"`,
              `${title} — top at ${fmtH(b.max.y)} m`,
            ),
          ),
        );
        if (b.max.y < band.hi && footprint >= 4)
          labels.push(
            label(
              sx(v, b.c.x),
              sy(v, b.c.z) + 3.5,
              `top ${fmtH(b.max.y)}`,
              9,
              `text-anchor="middle" class="m"`,
            ),
          );
      } else {
        const low = height <= 1.7;
        boxes.push(
          filled(
            b,
            rect(
              v,
              b.min.x,
              b.min.z,
              b.max.x,
              b.max.z,
              low
                ? `fill="${C.cover}" stroke="${C.muted}" stroke-width="0.8"`
                : `fill="${C.block}"`,
              `${title} — ${fmtH(height)} m tall`,
            ),
          ),
        );
        putLabel(fmtH(height), !low);
      }
    } else if (walkTops.has(b.index) && inFeet(b.max.y)) {
      boxes.push(
        filled(
          b,
          rect(
            v,
            b.min.x,
            b.min.z,
            b.max.x,
            b.max.z,
            `fill="#f7f6f2" stroke="${C.ink}" stroke-width="1.6"`,
            `${title} — walkable top at ${fmtH(b.max.y)} m`,
          ),
          rect(
            v,
            b.min.x,
            b.min.z,
            b.max.x,
            b.max.z,
            `fill="none" stroke="${C.ink}" stroke-width="1.6"`,
          ),
        ),
      );
      putLabel(`${fmtH(b.max.y)} m`, false);
    } else {
      boxes.push(
        rect(
          v,
          b.min.x,
          b.min.z,
          b.max.x,
          b.max.z,
          `fill="url(#over)" stroke="${C.muted}" stroke-width="0.6"`,
          `${title} — overhead (y ${fmtH(b.min.y)}–${fmtH(b.max.y)})`,
        ),
      );
    }
  }
  map.push(`<g>${boxes.join('')}</g>`);
  if (tileSlot >= 0) {
    // floor tiles go under the boxes; tiles on top of a filled box go over it, re-outlined
    const onTop = new Set<number>();
    const under: string[] = [];
    const over: string[] = [];
    for (const t of tiles) {
      if (t.box >= 0 && outlines.has(t.box)) {
        over.push(t.svg);
        onTop.add(t.box);
      } else under.push(t.svg);
    }
    map[tileSlot] = `<g>${under.join('')}</g>`;
    map.push(`<g>${over.join('')}</g>`);
    map.push(`<g>${[...onTop].map((i) => outlines.get(i)).join('')}</g>`);
  }

  // cover on wall/ceiling gravity surfaces (ground plan only; unfolded like the surface)
  for (const b of gravityCover) {
    const zi = level.zones.findIndex((z) => inZone(b.c, z.min, z.max) && !isZeroG(z.gravity));
    const z = level.zones[zi];
    const up = v3(-Math.sign(z.gravity.x), -Math.sign(z.gravity.y), -Math.sign(z.gravity.z));
    const surf = (p: Vec3) => (sideways.has(zi) ? planPoint(an, null, p, zi) : { x: p.x, z: p.z });
    const a = surf(b.min);
    const c = surf(b.max);
    const prot = up.y !== 0 ? 2 * b.h.y : up.z !== 0 ? 2 * b.h.z : 2 * b.h.x;
    map.push(
      rect(
        v,
        a.x,
        a.z,
        c.x,
        c.z,
        `fill="${C.cover}" stroke="${C.zone}" stroke-width="1.4"`,
        `box #${b.index}: cover on the gravity surface, sticks out ${fmtH(prot)} m`,
      ),
    );
    labels.push(
      label(sx(v, Math.max(a.x, c.x)) + 2, sy(v, (a.z + c.z) / 2) + 3.5, fmtH(prot), 9.5),
    );
  }

  // zone labels (two lines: what the gravity does, then the zone name)
  level.zones.forEach((z, i) => {
    const cx = sx(v, (z.min.x + z.max.x) / 2);
    const top = sy(v, Math.min(z.min.z, z.max.z));
    const [head, sub] = gravityWords(z.gravity, sideways.has(i) && band.name === 'ground');
    labels.push(label(cx, top + 13, head, 10, `text-anchor="middle" font-weight="700"`));
    labels.push(
      label(
        cx,
        top + 25,
        `${z.name}${sub ? ` · ${sub}` : ''}`,
        9,
        `text-anchor="middle" class="m"`,
      ),
    );
  });

  // pads
  for (const p of def.pads) {
    map.push(
      rect(
        v,
        p.min.x,
        p.min.z,
        p.max.x,
        p.max.z,
        `fill="none" stroke="${C.ink}" stroke-width="1.3"`,
        `gravity pad: flips ${p.zone} for ${p.durationSec} s (cooldown ${p.cooldownSec} s)`,
      ),
    );
    labels.push(
      label(
        sx(v, (p.min.x + p.max.x) / 2),
        sy(v, p.max.z) + 11,
        `pad (${p.durationSec}s flip)`,
        9,
        `text-anchor="middle"`,
      ),
    );
  }

  // rails
  for (const r of def.rails) {
    const d = r.points
      .map((p, i) => `${i ? 'L' : 'M'}${f1(sx(v, p.x))},${f1(sy(v, p.z))}`)
      .join('');
    map.push(
      `<path d="${d}" fill="none" stroke="${C.ink2}" stroke-width="2.2" stroke-opacity="0.8"/>`,
    );
    map.push(
      `<path d="${d}" fill="none" stroke="${C.surface}" stroke-width="1" stroke-dasharray="1 5"/>`,
    );
    const p = r.points[0];
    labels.push(
      label(sx(v, p.x) + 4, sy(v, p.z) - 4, `zip-rail (y ${fmtH(p.y)})`, 9.5, `class="m"`),
    );
  }

  // waypoints (ground plan)
  const wps = def.waypoints ?? [];
  if (band.name === 'ground' && wps.length) {
    const ws: string[] = [];
    wps.forEach((w, i) => {
      for (const j of w.links) {
        const back = wps[j].links.includes(i);
        if (back && j < i) continue;
        const a = { x: sx(v, w.pos.x), y: sy(v, w.pos.z) };
        const b = { x: sx(v, wps[j].pos.x), y: sy(v, wps[j].pos.z) };
        ws.push(
          `<line x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}" stroke="${C.muted}" stroke-width="${back ? 0.9 : 1.2}" ${back ? '' : 'marker-end="url(#arrowW)"'}/>`,
        );
      }
    });
    for (const w of wps)
      ws.push(
        `<circle cx="${f1(sx(v, w.pos.x))}" cy="${f1(sy(v, w.pos.z))}" r="2.2" fill="${C.muted}"><title>waypoint (${f1(w.pos.x)}, ${f1(w.pos.y)}, ${f1(w.pos.z)})</title></circle>`,
      );
    map.push(`<g opacity="${opts.heat ? 0.55 : 0.9}">${ws.join('')}</g>`);
  }

  // chokepoints (ground plan; on heat maps only when asked, drawn in ink)
  if (band.name === 'ground' && (opts.chokepoints ?? !heat))
    for (const c of an.config.chokepoints) {
      const col = heat ? C.ink : c.side === 0 ? C.teamA : C.teamB;
      const a =
        c.across === 'x'
          ? v3(c.pos.x - c.halfWidth, 0, c.pos.z)
          : v3(c.pos.x, 0, c.pos.z - c.halfWidth);
      const b =
        c.across === 'x'
          ? v3(c.pos.x + c.halfWidth, 0, c.pos.z)
          : v3(c.pos.x, 0, c.pos.z + c.halfWidth);
      const seg = `x1="${f1(sx(v, a.x))}" y1="${f1(sy(v, a.z))}" x2="${f1(sx(v, b.x))}" y2="${f1(sy(v, b.z))}"`;
      if (heat)
        map.push(`<line ${seg} stroke="${C.surface}" stroke-width="6" stroke-linecap="round"/>`);
      map.push(
        `<line ${seg} stroke="${col}" stroke-width="${heat ? 3 : 4}" stroke-opacity="${heat ? 1 : 0.75}" stroke-linecap="round"><title>${esc(`chokepoint: ${c.name}`)}</title></line>`,
      );
      const name = c.short ?? c.name;
      if (c.across === 'z') {
        // label beyond the end nearer the map's centre line
        const end = Math.abs(a.z) < Math.abs(b.z) ? a : b;
        const dz = end === a ? -1 : 1;
        labels.push(
          label(
            sx(v, end.x),
            sy(v, end.z + dz * 1.2) + (dz > 0 ? 8 : 0),
            name,
            9.5,
            `text-anchor="middle" font-weight="600"`,
          ),
        );
      } else {
        const outer = Math.abs(a.x) > Math.abs(b.x) ? a : b;
        const right = outer.x > c.pos.x;
        labels.push(
          label(
            sx(v, outer.x + (right ? 0.8 : -0.8)),
            sy(v, outer.z) + 3.5,
            name,
            9.5,
            `text-anchor="${right ? 'start' : 'end'}" font-weight="600"`,
          ),
        );
      }
    }

  // spawns, homes, towers
  const markers: string[] = [];
  const teamFill = (t: number | undefined) => (heat ? C.surface : t === 1 ? C.teamB : C.teamA);
  for (const sp of def.spawns) {
    const x = sx(v, sp.pos.x);
    const y = sy(v, sp.pos.z);
    const yaw = (sp.yawDeg * Math.PI) / 180;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const col = sp.team === 1 ? C.teamB : C.teamA;
    markers.push(
      `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x + fx * 11)}" y2="${f1(y + fz * 11)}" stroke="${heat ? C.ink : col}" stroke-width="2"/>`,
      `<circle cx="${f1(x)}" cy="${f1(y)}" r="4.6" fill="${teamFill(sp.team)}" stroke="${heat ? C.ink : C.surface}" stroke-width="${heat ? 1.2 : 2}"><title>${esc(`spawn team ${sp.team === 1 ? 'B' : 'A'} at (${f1(sp.pos.x)}, ${f1(sp.pos.z)}), facing yaw ${sp.yawDeg}°`)}</title></circle>`,
    );
  }
  (def.controllerHomes ?? []).forEach((h, i) => {
    const x = sx(v, h.x);
    const y = sy(v, h.z);
    markers.push(
      `<path d="M${f1(x)},${f1(y - 6)} L${f1(x + 6)},${f1(y)} L${f1(x)},${f1(y + 6)} L${f1(x - 6)},${f1(y)} Z" fill="${C.surface}" stroke="${C.ink}" stroke-width="1.5"><title>Controller home ${i === 1 ? 'B' : 'A'}</title></path>`,
    );
  });
  for (const t of def.towers) {
    const col = t.team === 1 ? C.teamB : C.teamA;
    markers.push(
      `<circle cx="${f1(sx(v, t.pos.x))}" cy="${f1(sy(v, t.pos.z))}" r="${f1(t.radius * v.s)}" fill="none" stroke="${heat ? C.ink : col}" stroke-width="3"><title>Tower ${t.team === 1 ? 'B' : 'A'} (r ${t.radius} m, ${t.height} m tall)</title></circle>`,
    );
    labels.push(
      label(
        sx(v, t.pos.x),
        sy(v, t.pos.z) - t.radius * v.s - 5,
        `TOWER ${t.team === 1 ? 'B' : 'A'}`,
        10,
        `text-anchor="middle" font-weight="700"`,
      ),
    );
  }
  map.push(`<g>${markers.join('')}</g>`);

  // numbered lines (longest sightlines)
  for (const l of opts.lines ?? []) {
    const seg = `x1="${f1(sx(v, l.from.x))}" y1="${f1(sy(v, l.from.z))}" x2="${f1(sx(v, l.to.x))}" y2="${f1(sy(v, l.to.z))}"`;
    map.push(
      `<line ${seg} stroke="${C.surface}" stroke-width="4" stroke-opacity="0.8"/>`,
      `<line ${seg} stroke="${C.teamB}" stroke-width="1.8" stroke-dasharray="7 3"/>`,
      `<circle cx="${f1(sx(v, l.from.x))}" cy="${f1(sy(v, l.from.z))}" r="3.2" fill="${C.teamB}" stroke="${C.surface}" stroke-width="1.2"/>`,
    );
    labels.push(
      label(
        sx(v, l.from.x) + 5,
        sy(v, l.from.z) - 5,
        l.label,
        11,
        `font-weight="700" fill="${C.teamB}"`,
      ),
    );
  }

  // area labels
  for (const a of def.areas ?? [])
    labels.push(
      label(
        sx(v, a.pos.x),
        sy(v, a.pos.z) + 18,
        a.name,
        11,
        `text-anchor="middle" font-style="italic" class="m"`,
      ),
    );

  out.push(`<g clip-path="url(#mapclip)">${map.join('')}${labels.join('')}</g>`);
  out.push(
    `<rect x="${f1(v.left)}" y="${f1(v.top)}" width="${f1(v.mapW)}" height="${f1(v.mapH)}" fill="none" stroke="${C.axis}" stroke-width="1"/>`,
  );

  // axes: coordinates every 10 m
  for (let x = Math.ceil(x0 / 10) * 10; x <= x1; x += 10)
    out.push(text(sx(v, x), v.top - 6, `${x}`, `font-size="10" text-anchor="middle" class="m"`));
  for (let z = Math.ceil(z0 / 10) * 10; z <= z1; z += 10)
    out.push(
      text(v.left - 6, sy(v, z) + 3.5, `${z}`, `font-size="10" text-anchor="end" class="m"`),
    );
  out.push(
    text(v.left + v.mapW, v.top - 20, 'x (m) →', `font-size="11" text-anchor="end" class="m"`),
  );
  out.push(text(v.left - 6, v.top - 20, 'z (m) ↓', `font-size="11" text-anchor="end" class="m"`));

  // scale bar
  const sbY = v.top + v.mapH + 22;
  const sb = 20 * v.s;
  out.push(
    `<line x1="${f1(v.left)}" y1="${f1(sbY)}" x2="${f1(v.left + sb)}" y2="${f1(sbY)}" stroke="${C.ink}" stroke-width="2"/>`,
    `<line x1="${f1(v.left)}" y1="${f1(sbY - 4)}" x2="${f1(v.left)}" y2="${f1(sbY + 4)}" stroke="${C.ink}" stroke-width="1.5"/>`,
    `<line x1="${f1(v.left + sb / 2)}" y1="${f1(sbY - 3)}" x2="${f1(v.left + sb / 2)}" y2="${f1(sbY + 3)}" stroke="${C.ink}" stroke-width="1.2"/>`,
    `<line x1="${f1(v.left + sb)}" y1="${f1(sbY - 4)}" x2="${f1(v.left + sb)}" y2="${f1(sbY + 4)}" stroke="${C.ink}" stroke-width="1.5"/>`,
    text(v.left + sb + 8, sbY + 4, '20 m', `font-size="11"`),
  );

  out.push(heat ? heatLegend(heat, v.left, legendTop) : planLegend(v.left, legendTop, W));
  out.push('</svg>');
  return out.join('\n');
};

// ---------------------------------------------------------------- legends

const swatch = (x: number, y: number, body: string, name: string): string =>
  `<g transform="translate(${f1(x)},${f1(y)})">${body}${text(30, 12, name, `font-size="12"`)}</g>`;

const planLegend = (x: number, y: number, W: number): string => {
  const items: [string, string][] = [
    [
      `<rect x="0" y="2" width="22" height="12" fill="${C.floor}" stroke="${C.axis}" stroke-width="0.6"/>`,
      'Floor you can reach',
    ],
    [
      `<rect x="0" y="2" width="22" height="12" fill="${C.wall}"/>`,
      'Wall ("top 6.0" = ends at 6 m)',
    ],
    [
      `<rect x="0" y="2" width="22" height="12" fill="${C.block}"/><text x="11" y="11.5" font-size="8" text-anchor="middle" class="w">3.0</text>`,
      'Block / crate (height in m)',
    ],
    [
      `<rect x="0" y="2" width="22" height="12" fill="${C.cover}" stroke="${C.muted}" stroke-width="0.8"/><text x="11" y="11.5" font-size="8" text-anchor="middle">1.2</text>`,
      'Low cover 0.3–1.7 m (height)',
    ],
    [
      `<rect x="0" y="2" width="22" height="12" fill="#f7f6f2" stroke="${C.ink}" stroke-width="1.6"/>`,
      'Raised walkable top (height)',
    ],
    [
      `<rect x="0" y="2" width="22" height="12" fill="#e3e2dc" stroke="${C.ink2}"/><line x1="4" y1="8" x2="18" y2="8" stroke="${C.ink2}" stroke-width="1.3" marker-end="url(#arrow)"/>`,
      'Ramp (arrow = uphill)',
    ],
    [
      `<rect x="0" y="2" width="22" height="12" fill="url(#over)" stroke="${C.muted}" stroke-width="0.6"/>`,
      'Overhead / unreachable top',
    ],
    [
      `<rect x="1" y="2" width="20" height="12" fill="none" stroke="${C.ink2}" stroke-width="1.2" stroke-dasharray="2 3"/>`,
      'Walkway above (see upper plan)',
    ],
    [
      `<rect x="0" y="2" width="22" height="12" fill="${C.surface}" stroke="${C.ink2}" stroke-width="1.2" stroke-dasharray="4 3"/>`,
      'Floating box in zero-G',
    ],
    [
      `<rect x="0" y="2" width="22" height="12" fill="${C.zone}" fill-opacity="0.12" stroke="${C.zone}"/>`,
      'Zero-G zone',
    ],
    [
      `<rect x="0" y="2" width="22" height="12" fill="url(#hatch)" stroke="${C.zone}"/>`,
      'Wall/ceiling gravity zone',
    ],
    [
      `<rect x="0" y="2" width="22" height="12" fill="${C.cover}" stroke="${C.zone}" stroke-width="1.4"/>`,
      'Cover on a gravity wall/ceiling',
    ],
    [
      `<rect x="3" y="3" width="16" height="10" fill="none" stroke="${C.ink}" stroke-width="1.3"/>`,
      'Gravity pad (trigger)',
    ],
    [
      `<line x1="0" y1="8" x2="22" y2="8" stroke="${C.ink2}" stroke-width="2.2"/><line x1="0" y1="8" x2="22" y2="8" stroke="${C.surface}" stroke-width="1" stroke-dasharray="1 5"/>`,
      'Zip-rail',
    ],
    [
      `<line x1="0" y1="8" x2="20" y2="8" stroke="${C.muted}" stroke-width="1.2" marker-end="url(#arrowW)"/><circle cx="0" cy="8" r="2.2" fill="${C.muted}"/>`,
      'Bot waypoint link (arrow = one-way)',
    ],
    [
      `<circle cx="7" cy="8" r="4.6" fill="${C.teamA}" stroke="${C.surface}" stroke-width="2"/><line x1="7" y1="8" x2="18" y2="8" stroke="${C.teamA}" stroke-width="2"/>`,
      'Spawn team A (tick = facing)',
    ],
    [
      `<circle cx="7" cy="8" r="4.6" fill="${C.teamB}" stroke="${C.surface}" stroke-width="2"/><line x1="7" y1="8" x2="-4" y2="8" stroke="${C.teamB}" stroke-width="2"/>`,
      'Spawn team B',
    ],
    [
      `<circle cx="11" cy="8" r="7" fill="none" stroke="${C.teamA}" stroke-width="3"/>`,
      'Tower (objective)',
    ],
    [
      `<path d="M11,2 L17,8 L11,14 L5,8 Z" fill="${C.surface}" stroke="${C.ink}" stroke-width="1.5"/>`,
      'Controller home',
    ],
    [
      `<line x1="2" y1="8" x2="20" y2="8" stroke="${C.teamB}" stroke-width="4" stroke-opacity="0.75" stroke-linecap="round"/>`,
      'Chokepoint (analysis)',
    ],
  ];
  const cols = 4;
  const colW = (W - x - 40) / cols;
  return items
    .map(([body, name], i) =>
      swatch(x + (i % cols) * colW, y + Math.floor(i / cols) * 24, body, name),
    )
    .join('');
};

/** rough text width for legend layout (system sans at `size` px) */
const textW = (s: string, size = 12): number => s.length * size * 0.56;

const heatLegend = (heat: HeatLayer, x: number, y: number): string => {
  const out: string[] = [text(x, y + 10, heat.title, `font-size="13" font-weight="600"`)];
  let bx = x;
  heat.labels.forEach((l, i) => {
    out.push(
      `<rect x="${f1(bx)}" y="${f1(y + 22)}" width="36" height="16" fill="${RAMP[Math.min(i, RAMP.length - 1)]}"/>`,
      text(bx + 42, y + 34, l, `font-size="12"`),
    );
    bx += 42 + textW(l) + 28;
  });
  const ny = y + 64;
  const extra: [string, string][] = [
    [
      `<rect x="0" y="0" width="36" height="16" fill="${C.floor}" stroke="${C.axis}" stroke-width="0.6"/>`,
      heat.skipZero ? 'walkable, value 0 / not measured' : 'walkable, not measured',
    ],
    [
      `<circle cx="18" cy="8" r="4" fill="${RAMP[2]}" stroke="${C.surface}"/>`,
      'floating point in zero-G',
    ],
    [
      `<circle cx="18" cy="8" r="4.6" fill="${C.surface}" stroke="${C.ink}" stroke-width="1.2"/><line x1="18" y1="8" x2="29" y2="8" stroke="${C.ink}" stroke-width="2"/>`,
      'spawn (tick = facing)',
    ],
    [`<circle cx="18" cy="8" r="7" fill="none" stroke="${C.ink}" stroke-width="3"/>`, 'Tower'],
  ];
  let ex = x;
  for (const [body, name] of extra) {
    out.push(
      `<g transform="translate(${f1(ex)},${f1(ny)})">${body}</g>`,
      text(ex + 42, ny + 12, name, `font-size="12"`),
    );
    ex += 42 + textW(name) + 32;
  }
  out.push(
    text(
      x,
      ny + 40,
      'Walls and cover as in the plain plan. Open the SVG in a browser and hover a box for its exact size.',
      `font-size="11" class="m"`,
    ),
  );
  return out.join('');
};

/** A few standard heat layers built from the analysis. */
export const sightlineHeat = (
  values: ArrayLike<number>,
  rays: number,
  pitchDeg: number[],
  lines = false,
): HeatLayer => ({
  title: 'Longest sightline from each spot (standing eye height)',
  values,
  edges: [15, 35, 60, 100, 150],
  labels: ['< 15 m (short)', '15–35 m (medium)', '35–60 m', '60–100 m', '100–150 m', '≥ 150 m'],
  note: `Colour = the longest clear line of sight from that spot (${rays} horizontal rays${pitchDeg.length ? ` + rays at ${pitchDeg.map((p) => `${p > 0 ? '+' : ''}${p}°`).join('/')}` : ''}).${lines ? ' Orange dashed lines = the longest distinct sightlines, numbered as in the report.' : ''}`,
});

export const coverHeat = (values: ArrayLike<number>, threshold: number): HeatLayer => ({
  title: `Distance to the nearest cover ≥ 1 m tall (lanes only; bases not measured) — open ground = > ${threshold} m`,
  values,
  edges: [2, 4, 6, 8, 12],
  labels: ['< 2 m', '2–4 m', '4–6 m', '6–8 m', '8–12 m (open)', '≥ 12 m (open)'],
  note: 'Darker = farther from anything that blocks knee-to-chest height (walls count).',
});

export const exposureHeat = (values: ArrayLike<number>, viewers: number): HeatLayer => ({
  title: `Exposure: share of ${viewers} standing spots (4 m grid) whose eye sees a player's chest here (lanes only)`,
  values,
  edges: [5, 10, 15, 20, 30],
  labels: ['< 5%', '5–10%', '10–15%', '15–20%', '20–30%', '≥ 30%'],
  note: 'Darker = watched from more places. Dark areas far from cover are killing fields.',
});

export const spawnHeat = (values: ArrayLike<number>): HeatLayer => ({
  title:
    "Spawn exposure: number of spawn points each spot can see (spots inside that team's base not counted)",
  values,
  edges: [2, 4, 7, 11],
  labels: ['1 spawn', '2–3', '4–6', '7–10', '≥ 11'],
  note: 'Eye-to-eye line of sight to spawn points. Plain floor = sees no spawn. Ideal: no colour outside the bases.',
  skipZero: true,
});

export const chokeHeat = (values: ArrayLike<number>): HeatLayer => ({
  title: 'Chokepoint coverage: most chokepoints of one side visible from each spot',
  values,
  edges: [2, 3, 4, 5],
  labels: ['1 chokepoint', '2', '3', '4', '≥ 5'],
  note: 'A spot that sees every entrance of one side lets a single player hold them all. Plain floor = sees none.',
  skipZero: true,
});

/** Hint for tools that want the rotated footprint of a box (exported for tests). */
export const boxFootprint = (b: Box): { x: number; z: number }[] =>
  hull(corners(b).map((p) => ({ x: p.x, z: p.z })));
