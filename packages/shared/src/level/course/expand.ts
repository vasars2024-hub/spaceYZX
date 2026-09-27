// Expand a course (./types.ts: plain JSON data) into a LevelDef: route geometry, the racing
// line, gates, devices, kill floors and scenery. Deterministic (the server and every client
// build the same map from the same data); no randomness beyond the seeded hash.
import type { Vec3 } from '../../math/vec3';
import { v3, add, sub, scale, len, normalize, cross, madd, dot, UP } from '../../math/vec3';
import type { Quat } from '../../math/quat';
import { qFromBasis, qRotate } from '../../math/quat';
import type {
  BoxDef,
  LaunchPadDef,
  LevelDef,
  Material,
  PortalDef,
  RaceGateDef,
  RaceLineNode,
  SlowZoneDef,
  SpawnDef,
} from '../types';
import type {
  CourseData,
  CoursePalette,
  FloorData,
  Go,
  IslandStyle,
  P3,
  RouteElement,
  SceneryElement,
  SurfEl,
} from './types';

const DEG = Math.PI / 180;
/** gravity the launch pads are aimed with (MOVEMENT_DEFAULTS.gravity) */
const G = 20;

export const p3 = (p: P3): Vec3 => v3(p[0], p[1], p[2]);
/** Compass heading (deg) → horizontal unit direction. */
export const headingDir = (deg: number): Vec3 => v3(Math.sin(deg * DEG), 0, -Math.cos(deg * DEG));
/** Compass heading → the game's yawDeg (0 = facing -z, 90 = facing -x). */
export const headingYaw = (deg: number): number => -deg;
/** Heading of a horizontal direction. */
export const headingOf = (d: Vec3): number => (((Math.atan2(d.x, -d.z) / DEG) % 360) + 360) % 360;

/** Deterministic 0..1 from an integer. */
export const hash01 = (n: number): number => {
  let x = Math.imul((n | 0) ^ 0x2545f491, 0x9e3779b1);
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967295;
};

/** A heading's rotation (local -z along it, local +x to its right); none when cardinal. */
const yawOf = (heading: number): { q?: Quat; swap: boolean } => {
  const h = ((heading % 360) + 360) % 360;
  if (Math.abs(h % 90) < 1e-9) return { swap: h === 90 || h === 270 };
  return { q: qFromBasis(headingDir(h), UP), swap: false };
};

interface Style {
  mat?: Material;
  color: number;
  noCollide?: boolean;
  trim?: number;
  lowDetail?: boolean;
}

/** Collects boxes (with the heading helpers every element uses). */
class Geo {
  readonly boxes: BoxDef[] = [];
  /** A box: `c` centre, `size` [across, height, along] in the heading's frame. */
  box(c: Vec3, size: Vec3, heading: number, s: Style): void {
    const y = yawOf(heading);
    const h = y.swap
      ? v3(size.z / 2, size.y / 2, size.x / 2)
      : v3(size.x / 2, size.y / 2, size.z / 2);
    const b: BoxDef = { c: round3(c), h: round3(h), mat: s.mat ?? 'rock', color: s.color };
    if (y.q) b.q = y.q;
    if (s.noCollide) b.noCollide = true;
    if (s.trim !== undefined) b.trim = s.trim;
    if (s.lowDetail) b.lowDetail = true;
    this.boxes.push(b);
  }
  /** A box whose top is at `top` (the middle of its top face). */
  slab(top: Vec3, w: number, d: number, thick: number, heading: number, s: Style): void {
    this.box(v3(top.x, top.y - thick / 2, top.z), v3(w, thick, d), heading, s);
  }
}

/** Snap to 1 mm (clean data; the same numbers everywhere). */
const r3 = (x: number): number => Math.round(x * 1000) / 1000;
const round3 = (v: Vec3): Vec3 => v3(r3(v.x), r3(v.y), r3(v.z));

/** Local → world for a heading frame: x right, z back (so -z = forward). */
const frame = (at: Vec3, heading: number) => {
  const f = headingDir(heading);
  const r = cross(f, UP);
  return (x: number, y: number, z: number): Vec3 =>
    add(add(madd(at, r, x), scale(f, -z)), v3(0, y, 0));
};

// ------------------------------------------------------------------------------------------
// Shared pieces

/**
 * A floating platform: a walkable top slab with painted edge lines, a rock body in stepped
 * tiers under it and a few stalactites (every piece stacked face to face: nothing cuts through
 * anything). `at` = middle of the top.
 */
const platform = (
  g: Geo,
  pal: CoursePalette,
  at: Vec3,
  w: number,
  d: number,
  heading: number,
  opts: { top?: number; depth?: number; edges?: boolean; seed?: number; plain?: boolean } = {},
): void => {
  const top = opts.top ?? pal.ground;
  const L = frame(at, heading);
  const thick = 0.6;
  g.slab(at, w, d, thick, heading, { mat: 'sand', color: top });
  if (opts.edges !== false && w >= 2.5 && d >= 2.5) {
    // painted edge lines on the top, just inside both long sides and the ends
    const e = 0.22;
    for (const s of [-1, 1]) {
      g.slab(L(s * (w / 2 - 0.2 - e / 2), 0.03, 0), e, d - 0.4, 0.03, heading, {
        mat: 'sand',
        color: pal.edge,
        noCollide: true,
      });
      g.slab(L(0, 0.03, s * (d / 2 - 0.2 - e / 2)), w - 0.4 - 2 * e, e, 0.03, heading, {
        mat: 'sand',
        color: pal.edge,
        noCollide: true,
      });
    }
  }
  if (opts.plain) return;
  const depth = opts.depth ?? Math.min(8, 1.5 + Math.max(w, d) * 0.35);
  const seed = opts.seed ?? Math.round(at.x * 7 + at.z * 13 + at.y);
  let y = at.y - thick;
  let k = 1;
  const tiers = depth > 4 ? 3 : 2;
  for (let i = 0; i < tiers; i++) {
    const hh = (depth * (tiers - i)) / ((tiers * (tiers + 1)) / 2);
    k *= i === 0 ? 0.92 : 0.72;
    const turn = heading + (hash01(seed + i * 5) - 0.5) * 16;
    g.box(v3(at.x, y - hh / 2, at.z), v3(w * k, hh, d * k), turn, {
      mat: 'rock',
      color: i % 2 ? pal.rockDark : pal.rock,
      lowDetail: true,
    });
    y -= hh;
  }
  // stalactites under the last tier
  const n = Math.min(5, 1 + Math.floor((w * d) / 40));
  for (let i = 0; i < n; i++) {
    const sx = (hash01(seed * 3 + i) - 0.5) * w * k * 0.6;
    const sz = (hash01(seed * 5 + i) - 0.5) * d * k * 0.6;
    const hh = 1 + hash01(seed * 7 + i) * depth * 0.5;
    const sw = 0.5 + hash01(seed * 11 + i) * Math.min(w, d) * k * 0.15;
    g.box(add(L(sx, 0, sz), v3(0, y - at.y - hh / 2, 0)), v3(sw, hh, sw), heading + 45 * i, {
      mat: 'rock',
      color: pal.rockDark,
      noCollide: true,
      lowDetail: true,
    });
  }
};

/** Painted floor chevrons at `at` pointing along `heading` (on a top at at.y). */
const chevron = (g: Geo, at: Vec3, heading: number, color: number, size = 1): void => {
  for (const s of [-1, 1]) {
    const d = headingDir(heading + s * 40);
    const c = madd(madd(at, cross(headingDir(heading), UP), s * 0.45 * size), d, -0.3 * size);
    g.box(v3(c.x, at.y + 0.02, c.z), v3(0.26 * size, 0.04, 1.5 * size), heading + s * 40, {
      mat: 'sand',
      color,
      noCollide: true,
    });
  }
};

/** A 7-segment digit board face (painted) centred at `at` on a plane facing `heading`. */
const SEG: Record<string, number[]> = {
  0: [0, 1, 2, 4, 5, 6],
  1: [2, 5],
  2: [0, 2, 3, 4, 6],
  3: [0, 2, 3, 5, 6],
  4: [1, 2, 3, 5],
  5: [0, 1, 3, 5, 6],
  6: [0, 1, 3, 4, 5, 6],
  7: [0, 2, 5],
  8: [0, 1, 2, 3, 4, 5, 6],
  9: [0, 1, 2, 3, 5, 6],
};
const digits = (g: Geo, at: Vec3, heading: number, text: string, color: number, h = 1.6): void => {
  const L = frame(at, heading);
  const w = h * 0.55;
  const t = h * 0.14;
  const gap = w * 0.45;
  const total = text.length * w + (text.length - 1) * gap;
  [...text].forEach((ch, i) => {
    const x0 = -total / 2 + i * (w + gap) + w / 2;
    const segs = SEG[ch] ?? [];
    // 0 top, 1 upper-left, 2 upper-right, 3 middle, 4 lower-left, 5 lower-right, 6 bottom
    const spots: [number, number, boolean][] = [
      [0, h / 2 - t / 2, true],
      [-w / 2 + t / 2, h / 4, false],
      [w / 2 - t / 2, h / 4, false],
      [0, 0, true],
      [-w / 2 + t / 2, -h / 4, false],
      [w / 2 - t / 2, -h / 4, false],
      [0, -h / 2 + t / 2, true],
    ];
    for (const s of segs) {
      const [sx, sy, horiz] = spots[s];
      g.box(L(x0 + sx, sy, -0.06), v3(horiz ? w : t, horiz ? t : h / 2, 0.12), heading, {
        mat: 'sand',
        color,
        noCollide: true,
      });
    }
  });
};

// ------------------------------------------------------------------------------------------
// The route

interface Built {
  /** racing line points of this element, in order */
  nodes: RaceLineNode[];
  /** where the next element's line starts from (the element's exit) */
  exit: Vec3;
}

export interface ExpandedCourse {
  def: LevelDef;
  /** per route element: its racing line nodes (tests and tools) */
  elementNodes: RaceLineNode[][];
}

/** A surf ramp's frame: ridge from → to, local x along it, y the prism's up, z to its right. */
export const surfFrame = (e: Pick<SurfEl, 'from' | 'to' | 'height' | 'angle' | 'side'>) => {
  const a = p3(e.from);
  const b = p3(e.to);
  const L = normalize(sub(b, a));
  const yl = normalize(sub(UP, scale(L, dot(UP, L))));
  const zl = cross(L, yl);
  const run = e.height / Math.tan(e.angle * DEG);
  const hz = e.side === 'both' ? run : run / 2;
  const prism = e.side === 'both' ? 0 : e.side === 'right' ? -1 : 1;
  return { a, b, L, yl, zl, run, hz, prism, length: len(sub(b, a)) };
};

const expandRoute = (
  data: CourseData,
  g: Geo,
): {
  line: RaceLineNode[];
  elementNodes: RaceLineNode[][];
  checkpoints: RaceGateDef[];
  finish: RaceGateDef | null;
  start: { respawn: Vec3; yawDeg: number } | null;
  grid: SpawnDef[];
  launchPads: LaunchPadDef[];
  portals: PortalDef[];
  fuelCells: Vec3[];
  slowZones: SlowZoneDef[];
} => {
  const pal = data.palette;
  const checkpoints: RaceGateDef[] = [];
  let finish: RaceGateDef | null = null;
  let start: { respawn: Vec3; yawDeg: number } | null = null;
  let grid: SpawnDef[] = [];
  const launchPads: LaunchPadDef[] = [];
  const portals: PortalDef[] = [];
  const fuelCells: Vec3[] = [];
  const slowZones: SlowZoneDef[] = [];
  const elementNodes: RaceLineNode[][] = [];
  let cp = 0;
  let pos = v3();
  const route = data.route;

  /** The first line point of the element after `i` (where you head when leaving `i`). */
  const nextAnchor = (i: number): Vec3 | null => {
    for (let j = i + 1; j < route.length; j++) {
      const e = route[j];
      switch (e.t) {
        case 'wall':
        case 'fuel':
          continue;
        case 'path':
          return null;
        case 'jumps':
          return p3(e.pads[0].at);
        case 'surf': {
          const f = surfFrame(e);
          return rideAt(f, e, 0.04);
        }
        case 'pillars':
          return p3(e.from);
        default:
          return p3(e.at);
      }
    }
    return null;
  };

  /** The point on a platform's top edge (w × d at `at`, heading) toward `to`, `inset` inside. */
  const edgeToward = (at: Vec3, w: number, d: number, heading: number, to: Vec3, inset = 0.4) => {
    const f = headingDir(heading);
    const r = cross(f, UP);
    const dir = sub(v3(to.x, at.y, to.z), at);
    const dl = len(dir);
    if (dl < 1e-6) return at;
    const u = scale(dir, 1 / dl);
    const along = dot(u, f);
    const side = dot(u, r);
    const tx = Math.abs(side) > 1e-6 ? (w / 2 - inset) / Math.abs(side) : Infinity;
    const tz = Math.abs(along) > 1e-6 ? (d / 2 - inset) / Math.abs(along) : Infinity;
    return madd(at, u, Math.min(tx, tz, dl));
  };

  const node = (p: Vec3, flags: Partial<RaceLineNode> = {}): RaceLineNode => ({
    pos: round3(p),
    cp,
    ...flags,
  });

  route.forEach((e, i) => {
    const out = buildElement(e, i);
    const go: Go = e.go ?? 'run';
    const nodes = out.nodes;
    if (nodes.length) {
      const last = nodes[nodes.length - 1];
      if (go === 'jump') last.jump = true;
      if (e.jet) {
        last.jump = true;
        last.jet = e.jet;
      }
      if (go === 'strafe') last.strafe = true;
      // (a hop chain hops on every pad; anything else only off its last point)
      if (go === 'hop')
        for (const n of e.t === 'jumps' ? nodes : [last]) if (!n.portal) n.hop = true;
    }
    elementNodes.push(nodes);
    pos = out.exit;
  });

  function rideAt(f: ReturnType<typeof surfFrame>, e: SurfEl, t: number): Vec3 {
    const face = e.side === 'both' ? (e.ride ?? 'right') : e.side;
    const depth = e.depth ?? 0.3;
    const s = face === 'right' ? 1 : -1;
    // ridge point, then down the face `depth` of its height, lifted a little off it
    const ridge = madd(f.a, sub(f.b, f.a), t);
    const ridgeZ = f.prism * f.hz;
    const edgeZ = s * f.hz;
    const zl = ridgeZ + (edgeZ - ridgeZ) * depth;
    const yLocal = -e.height * depth;
    const pt = add(add(ridge, scale(f.yl, yLocal)), scale(f.zl, zl - ridgeZ));
    const nrm = normalize(add(scale(f.yl, f.run), scale(f.zl, s * e.height)));
    return madd(pt, nrm, 0.05);
  }

  function buildElement(e: RouteElement, i: number): Built {
    switch (e.t) {
      case 'start': {
        const at = p3(e.at);
        const [w, d] = e.size ?? [14, 16];
        const L = frame(at, e.heading);
        platform(g, pal, at, w, d, e.heading, { seed: i });
        g.slab(L(0, 0.03, d / 2 - 3.2), w - 1.2, 5, 0.03, e.heading, {
          mat: 'sand',
          color: pal.start,
          noCollide: true,
        });
        archFrame(g, pal, L(0, 0, -d / 2 + 2), e.heading, w - 4.4, 6, pal.start);
        const f = headingDir(e.heading);
        const r = cross(f, UP);
        grid = [];
        for (let k = 0; k < 8; k++) {
          const row = Math.floor(k / 4);
          const col = (k % 4) - 1.5;
          grid.push({
            pos: round3(madd(madd(at, f, 2 - row * 2.5), r, col * 2.2)),
            yawDeg: headingYaw(e.heading),
          });
        }
        start = { respawn: round3(madd(at, f, 3.5)), yawDeg: headingYaw(e.heading) };
        chevron(g, L(0, 0, -d / 2 + 4.5), e.heading, pal.arrow, 1.4);
        const exit = L(0, 0, -d / 2 + 0.4);
        return { nodes: [node(at), node(exit)], exit };
      }
      case 'stage':
      case 'finish': {
        const at = p3(e.at);
        const [w, d] = e.size ?? [12, 14];
        const L = frame(at, e.heading);
        const isFinish = e.t === 'finish';
        const glow = isFinish ? pal.finish : pal.stageGlow;
        platform(g, pal, at, w, d, e.heading, { seed: i, edges: false });
        stageRoom(
          g,
          pal,
          at,
          w,
          d,
          e.heading,
          glow,
          isFinish ? 'F' : String(checkpoints.length + 1),
        );
        g.slab(L(0, 0.03, 0), w - 3.2, d - 2, 0.03, e.heading, {
          mat: 'sand',
          color: isFinish ? pal.finish : pal.start,
          noCollide: true,
        });
        if (!isFinish) chevron(g, L(0, 0.03, -d / 2 + 2.5), e.heading, pal.arrow, 1.2);
        // the gate: the room's inside (the AABB of it when turned)
        const corners = [
          L(-w / 2, -1.5, -d / 2),
          L(w / 2, -1.5, -d / 2),
          L(-w / 2, -1.5, d / 2),
          L(w / 2, -1.5, d / 2),
        ];
        const min = v3(
          Math.min(...corners.map((c) => c.x)),
          at.y - 1.5,
          Math.min(...corners.map((c) => c.z)),
        );
        const max = v3(
          Math.max(...corners.map((c) => c.x)),
          at.y + STAGE_H,
          Math.max(...corners.map((c) => c.z)),
        );
        const gate: RaceGateDef = {
          min: round3(min),
          max: round3(max),
          respawn: round3(L(0, 0, 1)),
          yawDeg: headingYaw(e.heading),
        };
        if (e.t === 'stage' && e.cap) {
          slowZones.push({ min: gate.min, max: gate.max, speedMul: e.cap / 9 });
        }
        const back = node(L(0, 0, d / 2 - 0.6));
        const mid = node(at);
        if (isFinish) finish = gate;
        else checkpoints.push(gate);
        cp++;
        const exit = L(0, 0, -d / 2 + 0.4);
        const nodes = isFinish ? [back, mid] : [back, mid, node(exit)];
        return { nodes, exit };
      }
      case 'platform': {
        const at = p3(e.at);
        const [w, d] = e.size;
        const h = e.heading ?? 0;
        const style = e.style ?? 'island';
        if (style === 'slab') g.slab(at, w, d, 1.2, h, { mat: 'rock', color: pal.ground2 });
        else platform(g, pal, at, w, d, h, { seed: i, plain: style === 'plain' });
        const nodes = [node(at)];
        const nx = nextAnchor(i);
        const go = e.go ?? 'run';
        // (a walkway going on from here starts at its far edge)
        let exit = frame(at, h)(0, 0, -d / 2);
        if (nx && go !== 'run') {
          exit = edgeToward(at, w, d, h, nx, go === 'jump' ? 0.3 : 0.6);
          nodes.push(node(exit));
          if (go !== 'hop')
            chevron(
              g,
              madd(exit, normalize(sub(exit, at)), -1.8),
              headingOf(sub(nx, at)),
              pal.arrow,
            );
        }
        return { nodes, exit };
      }
      case 'path': {
        const b = p3(e.to);
        // (starting a hand's breadth past the edge you step off: no corner cutting into it)
        const a = madd(pos, normalize(v3(b.x - pos.x, 0, b.z - pos.z)), 0.35);
        const w = e.width ?? (e.style === 'beam' ? 1 : 4);
        walkway(g, pal, a, b, w, e.style === 'beam');
        return { nodes: [node(a), node(b)], exit: b };
      }
      case 'jumps': {
        const nodes: RaceLineNode[] = [];
        const nx = nextAnchor(i);
        const hop = e.go === 'hop';
        e.pads.forEach((pd, k) => {
          const at = p3(pd.at);
          const [w, d] = pd.size ?? [4, 4];
          const h = pd.heading ?? 0;
          platform(g, pal, at, w, d, h, {
            seed: i * 31 + k,
            top: k % 2 ? pal.ground2 : pal.ground,
            depth: 1.5 + Math.min(w, d) * 0.3,
          });
          nodes.push(node(at));
          const next = k + 1 < e.pads.length ? p3(e.pads[k + 1].at) : nx;
          if (!hop && next && k + 1 < e.pads.length)
            nodes.push(node(edgeToward(at, w, d, h, next, 0.3), { jump: true }));
        });
        const last = p3(e.pads[e.pads.length - 1].at);
        let exit = last;
        if (!hop && nx && e.go === 'jump') {
          const pd = e.pads[e.pads.length - 1];
          const [w, d] = pd.size ?? [4, 4];
          exit = edgeToward(last, w, d, pd.heading ?? 0, nx, 0.3);
          nodes.push(node(exit));
        }
        return { nodes, exit };
      }
      case 'surf': {
        const f = surfFrame(e);
        // local x = the ridge, local y = up, local z = right of the way
        const ridgeMid = scale(add(f.a, f.b), 0.5);
        const c = sub(ridgeMid, scale(f.yl, e.height / 2));
        const cz = f.prism === 0 ? 0 : -f.prism * f.hz;
        const center = add(c, scale(f.zl, cz));
        g.boxes.push({
          c: round3(center),
          h: round3(v3(f.length / 2, e.height / 2, f.hz)),
          q: qFromBasis(scale(f.zl, -1), f.yl),
          prism: f.prism,
          surf: true,
          mat: 'rock',
          color: pal.surf,
          trim: pal.surfEdge,
        });
        const n = Math.max(2, Math.ceil(f.length / 10));
        const nodes: RaceLineNode[] = [];
        for (let k = 0; k <= n; k++) {
          const t = 0.04 + (0.92 * k) / n;
          nodes.push(node(rideAt(f, e, t), { strafe: true, surf: true }));
        }
        return { nodes, exit: nodes[nodes.length - 1].pos };
      }
      case 'launch': {
        const at = p3(e.at);
        const to = p3(e.to);
        const T = e.flightSec;
        const from = add(at, v3(0, 0.9, 0));
        const aim = add(to, v3(0, 0.9, 0));
        const vel = v3(
          (aim.x - from.x) / T,
          (aim.y - from.y + 0.5 * G * T * T) / T,
          (aim.z - from.z) / T,
        );
        launchPads.push({
          min: round3(v3(at.x - 1.3, at.y - 0.2, at.z - 1.3)),
          max: round3(v3(at.x + 1.3, at.y + 1.6, at.z + 1.3)),
          vel: round3(vel),
        });
        const h = headingOf(sub(to, at));
        if (e.base !== false) platform(g, pal, at, 5, 5, h, { seed: i });
        g.slab(add(at, v3(0, 0.06, 0)), 2.8, 2.8, 0.06, h, {
          mat: 'sand',
          color: pal.pad,
          noCollide: true,
        });
        g.slab(add(at, v3(0, 0.12, 0)), 1.4, 1.4, 0.06, h + 45, {
          mat: 'trim',
          color: pal.pad,
          noCollide: true,
        });
        return { nodes: [node(at, { strafe: true }), node(to)], exit: to };
      }
      case 'booster': {
        const at = p3(e.at);
        const f = headingDir(e.heading);
        const [w, d] = e.size ?? [4, 5];
        const vel = add(scale(f, e.speed), v3(0, e.up ?? 3, 0));
        const L = frame(at, e.heading);
        const corners = [
          L(-w / 2, 0, -d / 2),
          L(w / 2, 0, -d / 2),
          L(-w / 2, 0, d / 2),
          L(w / 2, 0, d / 2),
        ];
        const air = !!e.air;
        const lo = air ? at.y - 0.5 : at.y - 0.2;
        const hi = air ? at.y + (e.size?.[1] ?? 4) : at.y + 1.6;
        launchPads.push({
          min: round3(
            v3(Math.min(...corners.map((c) => c.x)), lo, Math.min(...corners.map((c) => c.z))),
          ),
          max: round3(
            v3(Math.max(...corners.map((c) => c.x)), hi, Math.max(...corners.map((c) => c.z))),
          ),
          vel: round3(vel),
        });
        if (air) ringFrame(g, L(0, 0, 0), e.heading, w, e.size?.[1] ?? 4, pal.pad);
        else {
          platform(g, pal, at, w + 2, d + 2, e.heading, { seed: i });
          for (let k = 0; k < 3; k++)
            chevron(g, L(0, 0.03, d / 2 - 1 - k * 1.6), e.heading, pal.pad, 1.1);
        }
        return { nodes: [node(at, air ? { strafe: true, air: true } : {})], exit: at };
      }
      case 'portal': {
        const at = p3(e.at);
        const [w, h] = e.size ?? [7, 8];
        const f = headingDir(e.heading);
        const L = frame(at, e.heading);
        platform(g, pal, L(0, 0, 1.5), w + 5, 7, e.heading, { seed: i });
        archFrame(g, pal, at, e.heading, w, h, pal.portal, true);
        const thinX = Math.abs(f.x) > 0.5;
        const exit = p3(e.exit);
        portals.push({
          name: `portal-${portals.length + 1}`,
          min: round3(v3(at.x - (thinX ? 0.6 : w / 2), at.y, at.z - (thinX ? w / 2 : 0.6))),
          max: round3(v3(at.x + (thinX ? 0.6 : w / 2), at.y + h, at.z + (thinX ? w / 2 : 0.6))),
          exit: round3(add(exit, v3(0, 0.95, 0))),
          color: pal.portal,
        });
        chevron(g, L(0, 0, 2.6), e.heading, pal.portal, 1.2);
        const before = node(L(0, 0, 4));
        const through = node(at, { portal: true });
        return { nodes: [before, through, node(exit)], exit };
      }
      case 'window': {
        const at = p3(e.at);
        const [hw, hh] = e.hole;
        const [ww, wh] = e.wall ?? [hw + 8, hh + 10];
        const L = frame(at, e.heading);
        const below = (wh - hh) / 2;
        const side = (ww - hw) / 2;
        const t = 1;
        const s = { mat: 'rock' as Material, color: pal.stage };
        g.box(L(0, -below / 2, 0), v3(ww, below, t), e.heading, s);
        g.box(L(0, hh + below / 2, 0), v3(ww, below, t), e.heading, s);
        for (const k of [-1, 1])
          g.box(L(k * (hw / 2 + side / 2), hh / 2, 0), v3(side, hh, t), e.heading, s);
        // glowing rim round the hole (on the wall's faces)
        for (const z of [-1, 1]) {
          const zz = z * (t / 2 + 0.06);
          const glow = { mat: 'sand' as Material, color: pal.stageGlow, noCollide: true };
          g.box(L(0, hh + 0.2, zz), v3(hw + 0.8, 0.4, 0.12), e.heading, glow);
          g.box(L(0, -0.2, zz), v3(hw + 0.8, 0.4, 0.12), e.heading, glow);
          for (const k of [-1, 1])
            g.box(L(k * (hw / 2 + 0.2), hh / 2, zz), v3(0.4, hh, 0.12), e.heading, glow);
        }
        const c = L(0, Math.min(1, hh / 3), 0);
        return { nodes: [node(c, { air: true })], exit: c };
      }
      case 'pillars': {
        const a = p3(e.from);
        const b = p3(e.to);
        const d = sub(b, a);
        const r = normalize(cross(normalize(v3(d.x, 0, d.z)), UP));
        const rad = e.radius ?? 1.2;
        const ph = e.height ?? 14;
        const h = headingOf(d);
        const nodes: RaceLineNode[] = [];
        for (let k = 0; k < e.count; k++) {
          const t = (k + 0.5) / e.count;
          const s = k % 2 ? 1 : -1;
          const c = madd(madd(a, d, t), r, s * e.offset);
          g.box(c, v3(rad * 2, ph, rad * 2), h + 45, { mat: 'rock', color: pal.accent });
          for (const y of [-1, 1])
            g.box(add(c, v3(0, y * (ph / 2 + 0.4), 0)), v3(rad * 2.6, 0.8, rad * 2.6), h + 45, {
              mat: 'rock',
              color: pal.rockDark,
            });
          nodes.push(node(madd(madd(a, d, t), r, -s * e.offset * 0.6)));
        }
        nodes.push(node(b));
        return { nodes, exit: b };
      }
      case 'wall': {
        const at = p3(e.at);
        const [w, h, d] = e.size;
        const hd = e.heading ?? 0;
        g.box(add(at, v3(0, h / 2, 0)), v3(w, h, d), hd, { mat: 'rock', color: pal.stage });
        g.box(add(at, v3(0, h + 0.3, 0)), v3(w + 0.8, 0.6, d + 0.8), hd, {
          mat: 'rock',
          color: pal.rockDark,
        });
        return { nodes: [], exit: pos };
      }
      case 'fuel': {
        fuelCells.push(round3(add(p3(e.at), v3(0, 1.1, 0))));
        return { nodes: [], exit: pos };
      }
    }
  }

  // stitch the line; every element's nodes in order
  const line: RaceLineNode[] = [];
  for (const ns of elementNodes)
    for (const n of ns) {
      const prev = line[line.length - 1];
      if (prev && prev.pos.x === n.pos.x && prev.pos.y === n.pos.y && prev.pos.z === n.pos.z) {
        Object.assign(prev, { ...n, cp: prev.cp });
        continue;
      }
      line.push(n);
    }
  return {
    line,
    elementNodes,
    checkpoints,
    finish,
    start,
    grid,
    launchPads,
    portals,
    fuelCells,
    slowZones,
  };
};

/** Room height of checkpoint stages (floor to roof). */
const STAGE_H = 6;

/** A checkpoint room on a platform: side walls, a roof, glowing door frames, its number. */
const stageRoom = (
  g: Geo,
  pal: CoursePalette,
  at: Vec3,
  w: number,
  d: number,
  heading: number,
  glow: number,
  label: string,
): void => {
  const L = frame(at, heading);
  const t = 0.8;
  const wall = { mat: 'rock' as Material, color: pal.stage };
  for (const s of [-1, 1])
    g.box(L(s * (w / 2 - t / 2), STAGE_H / 2, 0), v3(t, STAGE_H, d), heading, wall);
  g.box(L(0, STAGE_H + 0.35, 0), v3(w, 0.7, d), heading, wall);
  // glowing frames round both doorways (on the wall ends and the roof's edges)
  for (const z of [-1, 1]) {
    const zz = z * (d / 2 + 0.1);
    for (const s of [-1, 1])
      g.box(L(s * (w / 2 - t / 2), STAGE_H / 2, zz), v3(t, STAGE_H, 0.2), heading, {
        mat: 'sand',
        color: glow,
        noCollide: true,
      });
    g.box(L(0, STAGE_H + 0.35, zz), v3(w - 2 * t, 0.7, 0.2), heading, {
      mat: 'trim',
      color: glow,
      noCollide: true,
    });
  }
  // the stage number on a board over the exit
  const board = L(0, STAGE_H + 0.7 + 1.3, -d / 2 + 0.3);
  g.box(board, v3(4.2, 2.6, 0.6), heading, { mat: 'rock', color: pal.rockDark, noCollide: true });
  digits(g, L(0, STAGE_H + 0.7 + 1.3, -d / 2), heading, label === 'F' ? '' : label, glow, 1.7);
  if (label === 'F') {
    // a chequered strip instead of a number
    for (let k = 0; k < 6; k++)
      g.box(
        L(-1.75 + k * 0.7, STAGE_H + 0.7 + 1.3 + (k % 2 ? 0.35 : -0.35), -d / 2 - 0.06),
        v3(0.7, 0.7, 0.12),
        heading,
        {
          mat: 'sand',
          color: k % 2 ? 0xffffff : 0x202020,
          noCollide: true,
        },
      );
  }
};

/** A free-standing arch (start line, portal frame): two posts and a lintel standing on `at`. */
const archFrame = (
  g: Geo,
  pal: CoursePalette,
  at: Vec3,
  heading: number,
  w: number,
  h: number,
  glow: number,
  big = false,
): void => {
  const L = frame(at, heading);
  const t = big ? 1.4 : 0.8;
  const s = { mat: 'rock' as Material, color: pal.stage };
  for (const k of [-1, 1]) {
    g.box(L(k * (w / 2 + t / 2), h / 2, 0), v3(t, h, t), heading, s);
    // glow strips on the posts' inner faces
    g.box(L(k * (w / 2 - 0.06), h / 2, 0), v3(0.12, h - 0.4, t * 0.5), heading, {
      mat: big ? 'trim' : 'sand',
      color: glow,
      noCollide: true,
    });
  }
  g.box(L(0, h + t / 2, 0), v3(w + 2 * t, t, t), heading, s);
  g.box(L(0, h - 0.06, 0), v3(w - 0.4, 0.12, t * 0.5), heading, {
    mat: 'trim',
    color: glow,
    noCollide: true,
  });
  if (big) {
    // a crown on the lintel
    g.box(L(0, h + t + 0.5, 0), v3(w * 0.5, 1, t * 0.8), heading, s);
  }
};

/** A square ring (an air booster) standing across the way; `at` = bottom middle. */
const ringFrame = (
  g: Geo,
  at: Vec3,
  heading: number,
  w: number,
  h: number,
  color: number,
): void => {
  const L = frame(at, heading);
  const t = 0.35;
  const s = { mat: 'trim' as Material, color, noCollide: true };
  g.box(L(0, -t / 2, 0), v3(w + 2 * t, t, t), heading, s);
  g.box(L(0, h + t / 2, 0), v3(w + 2 * t, t, t), heading, s);
  for (const k of [-1, 1]) g.box(L(k * (w / 2 + t / 2), h / 2, 0), v3(t, h, t), heading, s);
};

/** A walkway (or a bare beam) from a to b: a top slab and a body under it, face to face. */
const walkway = (g: Geo, pal: CoursePalette, a: Vec3, b: Vec3, w: number, beam: boolean): void => {
  const d = sub(b, a);
  const L = len(d);
  if (L < 1e-6) return;
  const fwd = scale(d, 1 / L);
  const right = normalize(cross(fwd, UP), v3(1, 0, 0));
  const n = cross(right, fwd);
  const flat = Math.abs(fwd.y) < 1e-6;
  const thick = beam ? 0.5 : 0.6;
  const top = { mat: 'sand' as Material, color: beam ? pal.accent2 : pal.ground };
  const mid = scale(add(a, b), 0.5);
  if (flat) {
    const h = headingOf(fwd);
    g.slab(mid, w, L, thick, h, top);
    if (!beam)
      g.slab(add(mid, v3(0, -thick, 0)), w * 0.8, L, 1.2, h, { mat: 'rock', color: pal.rock });
    return;
  }
  const q = qFromBasis(fwd, n);
  g.boxes.push({
    c: round3(madd(mid, n, -thick / 2)),
    h: round3(v3(w / 2, thick / 2, L / 2)),
    q,
    ...top,
  });
  if (!beam)
    g.boxes.push({
      c: round3(madd(mid, n, -thick - 0.6)),
      h: round3(v3((w * 0.8) / 2, 0.6, L / 2)),
      q,
      mat: 'rock',
      color: pal.rock,
    });
};

// ------------------------------------------------------------------------------------------
// Scenery

const ISLAND_TOPS = (pal: CoursePalette): Record<IslandStyle, number> => ({
  grass: pal.leaf,
  snow: 0xeef3f7,
  stone: pal.ground,
  basalt: pal.rockDark,
  neon: pal.rockDark,
});

/** Is (x, z) at least `r` metres (horizontally) from every point of the line? */
export const clearOfLine = (line: readonly Vec3[], x: number, z: number, r: number): boolean => {
  for (let i = 0; i < line.length; i++) {
    const a = line[i];
    const b = line[i + 1] ?? a;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const l2 = abx * abx + abz * abz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / l2)) : 0;
    const dx = a.x + abx * t - x;
    const dz = a.z + abz * t - z;
    if (dx * dx + dz * dz < r * r) return false;
  }
  return true;
};

const island = (
  g: Geo,
  pal: CoursePalette,
  at: Vec3,
  w: number,
  d: number,
  depth: number,
  style: IslandStyle,
  heading: number,
  seed: number,
): void => {
  const topC = ISLAND_TOPS(pal)[style];
  const thick = Math.min(1.6, 0.4 + depth * 0.08);
  // a lip: the top overhangs its body a little
  g.slab(at, w, d, thick, heading, {
    mat: style === 'grass' ? 'leaf' : 'sand',
    color: topC,
    noCollide: true,
    lowDetail: true,
  });
  let y = at.y - thick;
  let k = 0.9;
  const tiers = depth > 12 ? 4 : 3;
  for (let i = 0; i < tiers; i++) {
    const hh = (depth * (tiers - i)) / ((tiers * (tiers + 1)) / 2);
    const turn = heading + (hash01(seed * 13 + i) - 0.5) * 30;
    const color =
      style === 'neon' ? (i % 2 ? pal.rockDark : pal.rock) : i % 2 ? pal.rockDark : pal.rock;
    g.box(v3(at.x, y - hh / 2, at.z), v3(w * k, hh, d * k), turn, {
      mat: 'rock',
      color,
      noCollide: true,
      lowDetail: true,
    });
    y -= hh;
    k *= 0.66;
  }
  // roots / stalactites / glowing drips under it
  const n = Math.min(6, 2 + Math.floor((w * d) / 150));
  const L = frame(v3(at.x, y, at.z), heading);
  for (let i = 0; i < n; i++) {
    const hh = 1.5 + hash01(seed * 7 + i) * depth * 0.4;
    const sw = 0.4 + hash01(seed * 11 + i) * 1.2;
    const c = L(
      (hash01(seed * 3 + i) - 0.5) * w * k * 0.9,
      -hh / 2,
      (hash01(seed * 5 + i) - 0.5) * d * k * 0.9,
    );
    g.box(c, v3(sw, hh, sw), heading + i * 37, {
      mat: style === 'grass' ? 'wood' : 'rock',
      color:
        style === 'grass'
          ? pal.trunk
          : style === 'basalt'
            ? pal.danger
            : style === 'neon'
              ? pal.accent
              : pal.rockDark,
      noCollide: true,
      lowDetail: true,
    });
  }
};

const tree = (
  g: Geo,
  pal: CoursePalette,
  at: Vec3,
  h: number,
  kind: string,
  seed: number,
): void => {
  const turn = hash01(seed) * 90;
  const leaf = { mat: 'leaf' as Material, noCollide: true };
  if (kind === 'pine') {
    g.box(add(at, v3(0, h * 0.125, 0)), v3(h * 0.08, h * 0.25, h * 0.08), turn, {
      mat: 'wood',
      color: pal.trunk,
      noCollide: true,
    });
    for (let i = 0; i < 3; i++) {
      const w = h * (0.5 - i * 0.13);
      g.box(add(at, v3(0, h * (0.25 + i * 0.25 + 0.125), 0)), v3(w, h * 0.25, w), turn + i * 45, {
        ...leaf,
        color: i === 1 ? pal.leaf : pal.leafDark,
      });
    }
    return;
  }
  if (kind === 'dead') {
    g.box(add(at, v3(0, h * 0.4, 0)), v3(h * 0.07, h * 0.8, h * 0.07), turn, {
      mat: 'wood',
      color: pal.trunk,
      noCollide: true,
    });
    g.box(add(at, v3(h * 0.12, h * 0.6, 0)), v3(h * 0.17, h * 0.05, h * 0.05), turn, {
      mat: 'wood',
      color: pal.trunk,
      noCollide: true,
    });
    return;
  }
  const trunkH = kind === 'palm' ? 0.8 : 0.55;
  const t = Math.max(0.3, h * 0.06);
  g.box(add(at, v3(0, (h * trunkH) / 2, 0)), v3(t * 2, h * trunkH, t * 2), turn, {
    mat: 'wood',
    color: pal.trunk,
    noCollide: true,
  });
  const crown = kind === 'palm' ? h * 0.3 : h * 0.34;
  const ch = h * (1 - trunkH) * 0.55;
  g.box(add(at, v3(0, h * trunkH + ch / 2, 0)), v3(crown * 2, ch, crown * 2), turn + 20, {
    ...leaf,
    color: pal.leafDark,
  });
  const ch2 = h * (1 - trunkH) * 0.45;
  g.box(
    add(at, v3(0, h * trunkH + ch + ch2 / 2, 0)),
    v3(crown * 1.4, ch2, crown * 1.4),
    turn + 55,
    { ...leaf, color: pal.leaf },
  );
};

const expandScenery = (
  data: CourseData,
  g: Geo,
  line: Vec3[],
  lights: { pos: Vec3; color: number; radius: number; intensity: number }[],
): void => {
  const pal = data.palette;
  const placed: { x: number; z: number; y0: number; y1: number; r: number }[] = [];
  const free = (x: number, z: number, y0: number, y1: number, r: number) =>
    placed.every((q) => Math.hypot(q.x - x, q.z - z) > q.r + r || y1 < q.y0 || y0 > q.y1);
  const one = (e: SceneryElement, seed: number): void => {
    switch (e.t) {
      case 'island': {
        const [w, d] = e.size;
        island(g, pal, p3(e.at), w, d, e.depth, e.style ?? 'grass', e.heading ?? 0, seed);
        placed.push({
          x: e.at[0],
          z: e.at[2],
          y0: e.at[1] - e.depth * 1.5,
          y1: e.at[1] + 2,
          r: Math.hypot(w, d) / 2,
        });
        return;
      }
      case 'tree':
        tree(g, pal, p3(e.at), e.height, e.kind ?? 'broad', seed);
        return;
      case 'rock': {
        const at = p3(e.at);
        const s = e.size;
        const h = e.heading ?? hash01(seed) * 90;
        g.box(add(at, v3(0, s * 0.35, 0)), v3(s * 2, s * 0.7, s * 1.7), h, {
          mat: 'rock',
          color: pal.rock,
          noCollide: true,
        });
        g.box(add(at, v3(0, s * 0.7 + s * 0.25, 0)), v3(s * 1.3, s * 0.5, s * 1.2), h + 35, {
          mat: 'rock',
          color: pal.rockDark,
          noCollide: true,
        });
        return;
      }
      case 'crystal': {
        const at = p3(e.at);
        const h = e.height;
        const c = e.color ?? pal.crystal;
        const turn = hash01(seed) * 90;
        g.box(add(at, v3(0, h * 0.4, 0)), v3(h * 0.22, h * 0.8, h * 0.22), turn, {
          mat: 'sand',
          color: c,
          noCollide: true,
        });
        g.box(add(at, v3(0, h * 0.9, 0)), v3(h * 0.12, h * 0.2, h * 0.12), turn + 45, {
          mat: 'sand',
          color: c,
          noCollide: true,
        });
        return;
      }
      case 'lantern': {
        const at = p3(e.at);
        g.box(add(at, v3(0, 1.2, 0)), v3(0.2, 2.4, 0.2), 0, {
          mat: 'wood',
          color: pal.trunk,
          noCollide: true,
        });
        g.box(add(at, v3(0, 2.7, 0)), v3(0.6, 0.6, 0.6), 45, {
          mat: 'trim',
          color: pal.accent2,
          noCollide: true,
        });
        g.box(add(at, v3(0, 3.1, 0)), v3(0.9, 0.2, 0.9), 45, {
          mat: 'wood',
          color: pal.trunk,
          noCollide: true,
        });
        lights.push({ pos: add(at, v3(0, 2.7, 0)), color: pal.accent2, radius: 7, intensity: 0.8 });
        return;
      }
      case 'banner': {
        const at = p3(e.at);
        const h = e.height;
        const L = frame(at, e.heading);
        g.box(add(at, v3(0, h / 2, 0)), v3(0.25, h, 0.25), e.heading, {
          mat: 'wood',
          color: pal.trunk,
          noCollide: true,
        });
        g.box(L(0.125 + 0.9, h - 1.8, 0), v3(1.8, 3, 0.1), e.heading, {
          mat: 'sand',
          color: e.color ?? pal.accent,
          noCollide: true,
        });
        return;
      }
      case 'waterfall': {
        // a stream over the lip (lying on the top), then the fall a little out from the edge
        const at = p3(e.at);
        const L = frame(at, e.heading);
        const water = { mat: 'sand' as Material, noCollide: true, lowDetail: true };
        g.box(L(0, 0.05, 0), v3(e.width, 0.1, 3), e.heading, { ...water, color: 0xe6f6fb });
        const top = Math.min(3, e.drop * 0.2);
        g.box(L(0, 0.1 - top / 2, -1.85), v3(e.width, top, 0.7), e.heading, {
          ...water,
          color: 0xd2eef8,
        });
        g.box(
          L(0, 0.1 - top - (e.drop - top) / 2, -1.85),
          v3(e.width * 0.92, e.drop - top, 0.7),
          e.heading,
          {
            ...water,
            color: pal.water,
          },
        );
        return;
      }
      case 'ruin': {
        const at = p3(e.at);
        const [w, d] = e.size;
        const L = frame(at, e.heading);
        const h = e.height;
        const cols: [number, number, number][] = [
          [-w / 2, -d / 2, h],
          [w / 2, -d / 2, h],
          [-w / 2, d / 2, h * 0.55],
          [w / 2, d / 2, h],
        ];
        for (const [x, z, hh] of cols) {
          g.box(L(x, hh / 2, z), v3(1, hh, 1), e.heading, {
            mat: 'rock',
            color: pal.ground2,
            noCollide: true,
          });
          g.box(L(x, hh + 0.2, z), v3(1.4, 0.4, 1.4), e.heading, {
            mat: 'rock',
            color: pal.ground,
            noCollide: true,
          });
        }
        g.box(L(0, h + 0.4 + 0.35, -d / 2), v3(w + 1.4, 0.7, 1.4), e.heading, {
          mat: 'rock',
          color: pal.ground2,
          noCollide: true,
        });
        return;
      }
      case 'spire': {
        const at = p3(e.at);
        let y = at.y;
        let w = e.width;
        const parts = 5;
        for (let i = 0; i < parts; i++) {
          const hh = e.height / parts;
          g.box(v3(at.x, y + hh / 2, at.z), v3(w, hh, w), hash01(seed + i) * 20 + i * 11, {
            mat: 'rock',
            color: i % 2 ? pal.rockDark : (e.color ?? pal.rock),
            noCollide: true,
            lowDetail: true,
          });
          y += hh;
          w *= 0.78;
        }
        g.box(v3(at.x, y + w * 0.6, at.z), v3(w * 0.6, w * 1.2, w * 0.6), 45, {
          mat: 'trim',
          color: pal.accent2,
          noCollide: true,
        });
        lights.push({
          pos: v3(at.x, y + w * 0.6, at.z),
          color: pal.accent2,
          radius: 10,
          intensity: 0.9,
        });
        return;
      }
      case 'cloud': {
        const at = p3(e.at);
        const [w, d] = e.size;
        const t = Math.max(1.5, Math.min(w, d) * 0.08);
        const cl = { mat: 'sand' as Material, color: pal.cloud, noCollide: true, lowDetail: true };
        g.box(add(at, v3(0, -t / 2, 0)), v3(w, t, d), hash01(seed) * 40, cl);
        g.box(
          add(at, v3(0, t * 0.4, 0)),
          v3(w * 0.6, t * 0.8, d * 0.55),
          hash01(seed) * 40 + 20,
          cl,
        );
        return;
      }
      case 'arrow': {
        const at = p3(e.at);
        const c = e.color ?? pal.arrow;
        for (const s of [-1, 1]) {
          const d = headingDir(e.heading + s * 40);
          const p = madd(madd(at, cross(headingDir(e.heading), UP), s * 0.9), d, -0.6);
          g.box(p, v3(0.5, 0.5, 3), e.heading + s * 40, { mat: 'sand', color: c, noCollide: true });
        }
        return;
      }
      case 'scatter': {
        let made = 0;
        for (let k = 0; made < e.count && k < e.count * 30; k++) {
          const s = e.seed * 1000 + k;
          const x = e.min[0] + hash01(s * 3 + 1) * (e.max[0] - e.min[0]);
          const y = e.min[1] + hash01(s * 3 + 2) * (e.max[1] - e.min[1]);
          const z = e.min[2] + hash01(s * 3 + 3) * (e.max[2] - e.min[2]);
          const size = e.size[0] + hash01(s * 7 + 5) * (e.size[1] - e.size[0]);
          const r = e.kind === 'crystal' || e.kind === 'spire' ? size * 0.3 : size * 0.75;
          if (e.clear && !clearOfLine(line, x, z, e.clear + r)) continue;
          const y0 = e.kind === 'island' ? y - size * 1.2 : y - 2;
          const y1 = e.kind === 'spire' || e.kind === 'crystal' ? y + size * 1.3 : y + 3;
          if (!free(x, z, y0, y1, r)) continue;
          placed.push({ x, z, y0, y1, r });
          if (e.kind === 'island')
            one(
              {
                t: 'island',
                at: [x, y, z],
                size: [size, size * (0.6 + hash01(s) * 0.5)],
                depth: size * 0.55,
                style: e.style,
                heading: hash01(s * 11) * 90,
              },
              s,
            );
          else if (e.kind === 'cloud')
            one({ t: 'cloud', at: [x, y, z], size: [size, size * 0.6] }, s);
          else if (e.kind === 'crystal') one({ t: 'crystal', at: [x, y, z], height: size }, s);
          else one({ t: 'spire', at: [x, y, z], height: size, width: size * 0.18 }, s);
          made++;
        }
        return;
      }
    }
  };
  (data.scenery ?? []).forEach((e, i) => one(e, i + 1));
};

/** A box's world bounds (min x, y, z, max x, y, z). */
const aabbOf = (b: BoxDef): number[] => {
  const q = b.q;
  const ax = q ? qRotate(q, v3(1, 0, 0)) : v3(1, 0, 0);
  const ay = q ? qRotate(q, v3(0, 1, 0)) : v3(0, 1, 0);
  const az = q ? qRotate(q, v3(0, 0, 1)) : v3(0, 0, 1);
  const ex = Math.abs(ax.x) * b.h.x + Math.abs(ay.x) * b.h.y + Math.abs(az.x) * b.h.z;
  const ey = Math.abs(ax.y) * b.h.x + Math.abs(ay.y) * b.h.y + Math.abs(az.y) * b.h.z;
  const ez = Math.abs(ax.z) * b.h.x + Math.abs(ay.z) * b.h.y + Math.abs(az.z) * b.h.z;
  return [b.c.x - ex, b.c.y - ey, b.c.z - ez, b.c.x + ex, b.c.y + ey, b.c.z + ez];
};
/** Does min..max stay clear of every bounds in the list? */
const clearBox = (
  list: number[][],
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
) => list.every((a) => a[3] < x0 || a[0] > x1 || a[4] < y0 || a[1] > y1 || a[5] < z0 || a[2] > z1);

/** The deadly cloud seas: kill volumes, a cloud layer on top and a dark floor under it. */
const expandFloors = (data: CourseData, g: Geo, line: RaceLineNode[]) => {
  const pal = data.palette;
  const killVolumes: { min: Vec3; max: Vec3 }[] = [];
  const floors = [...data.floors];
  if (data.autoFloors) {
    // a floor under every stretch of the line: a new stretch at every checkpoint, past every
    // portal, and wherever the way has climbed or dropped too far for one floor to be close
    const { below, pad } = data.autoFloors;
    const chunks: RaceLineNode[][] = [[]];
    let lo = Infinity;
    let hi = -Infinity;
    line.forEach((n, i) => {
      const prev = line[i - 1];
      const y = n.pos.y;
      if (prev && (prev.cp !== n.cp || prev.portal || Math.max(hi, y) - Math.min(lo, y) > 16)) {
        chunks.push([]);
        lo = Infinity;
        hi = -Infinity;
      }
      chunks[chunks.length - 1].push(n);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    });
    for (const ns of chunks) {
      if (!ns.length) continue;
      const y = Math.round(Math.min(...ns.map((n) => n.pos.y)) - below);
      const xs = ns.map((n) => n.pos.x);
      const zs = ns.map((n) => n.pos.z);
      // as wide as it can be without reaching under another stretch of the way
      for (const r of [pad, pad / 2, 6]) {
        const f: FloorData = {
          y,
          min: [Math.round(Math.min(...xs) - r), Math.round(Math.min(...zs) - r)],
          max: [Math.round(Math.max(...xs) + r), Math.round(Math.max(...zs) + r)],
        };
        const hits = line.some(
          (n) =>
            n.pos.x > f.min[0] &&
            n.pos.x < f.max[0] &&
            n.pos.z > f.min[1] &&
            n.pos.z < f.max[1] &&
            n.pos.y + 0.9 > y - 25 - 3 &&
            n.pos.y < y + 3,
        );
        if (!hits) {
          floors.push(f);
          break;
        }
      }
    }
  }
  const cloud = { mat: 'sand' as Material, color: pal.cloud, noCollide: true, lowDetail: true };
  const built = g.boxes.map(aabbOf);
  floors.forEach((f, fi) => {
    killVolumes.push({ min: v3(f.min[0], f.y - 25, f.min[1]), max: v3(f.max[0], f.y, f.max[1]) });
    // cloud puffs on a grid (never touching each other), their tops at the floor's height
    const cell = 55;
    const nx = Math.max(1, Math.round((f.max[0] - f.min[0]) / cell));
    const nz = Math.max(1, Math.round((f.max[1] - f.min[1]) / cell));
    const cx = (f.max[0] - f.min[0]) / nx;
    const cz = (f.max[1] - f.min[1]) / nz;
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const s = fi * 10007 + i * 131 + j;
        const w = cx * (0.62 + hash01(s) * 0.3);
        const d = cz * (0.62 + hash01(s + 1) * 0.3);
        const x = f.min[0] + (i + 0.5) * cx + (hash01(s + 2) - 0.5) * (cx - w) * 0.9;
        const z = f.min[1] + (j + 0.5) * cz + (hash01(s + 3) - 0.5) * (cz - d) * 0.9;
        const y = f.y - 1 - hash01(s + 4) * 3;
        // (never through anything already built: an island, a pillar's foot)
        if (!clearBox(built, x - w / 2, y - 3, z - d / 2, x + w / 2, y + 2.4, z + d / 2)) continue;
        g.box(v3(x, y - 1.5, z), v3(w, 3, d), 0, cloud);
        if (hash01(s + 5) < 0.6) g.box(v3(x, y + 1.2, z), v3(w * 0.5, 2.4, d * 0.45), 0, cloud);
      }
  });
  // the danger glow far under every cloud sea (seen through the gaps): the global floor
  g.box(v3(0, data.killY, 0), v3(1000, 1, 1000), 0, {
    mat: 'sand',
    color: pal.danger,
    noCollide: true,
    lowDetail: true,
  });
  return killVolumes;
};

/** Expand a course into a level (the racing line, gates, devices, scenery). */
export const expandCourse = (data: CourseData): ExpandedCourse => {
  const g = new Geo();
  const r = expandRoute(data, g);
  if (!r.start || !r.finish) throw new Error(`${data.name}: a course needs a start and a finish`);
  const lights: { pos: Vec3; color: number; radius: number; intensity: number }[] = [];
  expandScenery(
    data,
    g,
    r.line.map((n) => n.pos),
    lights,
  );
  const killVolumes = expandFloors(data, g, r.line);
  const surf = data.kind === 'surf';
  const sky = data.sky;
  const def: LevelDef = {
    name: data.name,
    boundsMin: v3(-500, -10, -500),
    boundsMax: v3(500, 480, 500),
    defaultGravity: v3(0, -1, 0),
    boxes: g.boxes,
    zones: [],
    rails: [],
    pads: [],
    spawns: r.grid,
    towers: [],
    launchPads: r.launchPads,
    portals: r.portals,
    lights,
    slowZones: r.slowZones.length ? r.slowZones : undefined,
    fog: { color: sky.horizon, near: sky.fog.near, far: sky.fog.far },
    ambient: sky.ambient ?? 1,
    outdoor: {
      top: sky.top,
      horizon: sky.horizon,
      ground: sky.ground,
      sun: sky.sun
        ? { dir: normalize(p3(sky.sun.dir)), color: sky.sun.color, sizeDeg: sky.sun.sizeDeg }
        : undefined,
      sunLight: sky.sunLight,
      stars: sky.stars,
    },
    race: {
      parSec: data.parSec,
      start: r.start,
      grid: r.grid,
      checkpoints: r.checkpoints,
      finish: r.finish,
      killY: data.killY,
      killVolumes,
      fuelCells: r.fuelCells,
      line: r.line,
      forks: [],
      surf: surf || undefined,
      noJetpack: surf || data.jetpack === false || undefined,
      noSurge: surf || data.surge === false || undefined,
    },
  };
  return { def, elementNodes: r.elementNodes };
};

/** Problems with a course's data (empty = fine). */
export const validateCourse = (data: CourseData): string[] => {
  const out: string[] = [];
  const route = data.route;
  if (route[0]?.t !== 'start') out.push('the route must begin with a start');
  if (route[route.length - 1]?.t !== 'finish') out.push('the route must end with a finish');
  route.forEach((e, i) => {
    const at = `route[${i}] (${e.t})`;
    if (e.t === 'surf') {
      if (e.angle < 50) out.push(`${at}: surf faces must be at least 50° (${e.angle}°)`);
      if (e.angle > 85) out.push(`${at}: surf faces must be at most 85° (${e.angle}°)`);
      const f = surfFrame(e);
      if (Math.abs(f.L.y) > 0.5) out.push(`${at}: the ridge is too steep`);
    }
    if (e.t === 'portal' && Math.abs(e.heading % 90) > 1e-9)
      out.push(`${at}: portals face a cardinal heading`);
    if (
      (e.t === 'stage' || e.t === 'start' || e.t === 'finish') &&
      route.slice(0, i).some((x) => x.t === 'finish')
    )
      out.push(`${at}: after the finish`);
  });
  // the route stays above every floor it crosses
  const { def } = expandCourse(data);
  for (const n of def.race!.line)
    for (const f of data.floors)
      if (
        n.pos.x > f.min[0] &&
        n.pos.x < f.max[0] &&
        n.pos.z > f.min[1] &&
        n.pos.z < f.max[1] &&
        n.pos.y < f.y + 4
      )
        out.push(
          `the line at ${n.pos.x.toFixed(1)}, ${n.pos.y.toFixed(1)}, ${n.pos.z.toFixed(1)} is in a floor`,
        );
  return out;
};
