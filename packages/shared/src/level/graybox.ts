// Graybox maps: turns a checked tile-grid layout (the map-design format the redesigned maps are
// planned in) into a playable LevelDef, so a layout can be walked, botted and playtested before
// anyone builds real geometry and lighting for it.
//
// The layout: one or more grid layers (lowest first), one character per cell. '.' is solid wall,
// '~' is a deadly drop, every other character is a named area (a callout) with a floor height.
// Ramps and stairs span a height range; gravity areas are built as stand-in stairs between their
// neighbours for now. Rules of the build:
//   - lowest-layer cells are solid columns from the bottom up to their floor, so ledges and drops
//     between areas of different height form by themselves; wall cells are columns to the top
//   - higher layers (catwalks, gantries) are thin slabs above whatever is below them
//   - ramps become steps no higher than 0.35 m (walkable without jumping, MOVEMENT stepHeight 0.4)
//   - a ceiling collider over the whole map keeps players from flying out over the walls
//   - waypoints sit on every floor cell and link where a bot can walk, climb or drop
import type { Vec3 } from '../math/vec3';
import { v3 } from '../math/vec3';
import type {
  BoxDef,
  BombSiteDef,
  KillVolumeDef,
  LaunchPadDef,
  LevelDef,
  Material,
  SizeWallDef,
  SpawnDef,
  TowerDef,
  WaypointDef,
} from './types';

export type GrayboxKind =
  'cyan' | 'orange' | 'site' | 'room' | 'ramp' | 'gravity' | 'pocket' | 'solid' | 'void';

export interface GrayboxArea {
  /** callout name */
  n: string;
  k: GrayboxKind;
  /** floor height (m); default: the layer's height */
  h?: number;
  /** height span of a ramp / stairs [low, high] */
  r?: [number, number];
  /** ramps: the way the floor rises (n = toward row 0); absent = follow the path between neighbours */
  dir?: 'n' | 's' | 'e' | 'w';
}

export interface GrayboxLayout {
  name: string;
  /** metres per cell */
  cellM: number;
  layers: { name: string; y: number; rows: string[] }[];
  legend: Record<string, GrayboxArea>;
  /** one-way launch pads: [from area, to area] (defender drops, attacker pads) */
  pads?: [string, string][];
  /** areas closed by force fields for smaller teams: team size → closed area characters */
  sizes?: Record<number, string[]>;
}

const WALL = '.';
const VOID = '~';
const STEP = 0.35;
const WALL_ABOVE = 10; // walls rise this far above the highest floor
const G = 20; // MOVEMENT gravity (m/s²), for the launch pad arcs

interface Cell {
  x: number;
  y: number;
  l: number;
  c: string;
  /** floor height at the cell centre */
  h: number;
  /** ramps: rise across the cell along `axis` (signed), for the sub-steps */
  rise?: number;
  axis?: 'x' | 'z';
}

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Height range of an area, in its layer. */
const span = (a: GrayboxArea, layerY: number): [number, number] =>
  a.r ?? [a.h ?? layerY, a.h ?? layerY];
const sloped = (a: GrayboxArea) => a.k === 'ramp' || a.k === 'gravity' || !!a.r;

export const buildGraybox = (lay: GrayboxLayout): LevelDef => {
  const s = lay.cellM;
  const W = lay.layers[0].rows[0].length;
  const H = lay.layers[0].rows.length;
  const area = (c: string) => lay.legend[c];
  const isFloor = (c: string | undefined) =>
    !!c && c !== WALL && c !== VOID && area(c)?.k !== 'solid';

  // ---- floor cells and their heights -------------------------------------------------------
  const cells: Cell[] = [];
  const byPos = new Map<string, Cell>();
  const key = (l: number, x: number, y: number) => `${l},${x},${y}`;
  lay.layers.forEach((layer, l) =>
    layer.rows.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (!isFloor(c)) return;
        const a = area(c);
        if (!a) throw new Error(`${lay.name}: no legend entry for '${c}'`);
        const [lo] = span(a, layer.y);
        const cell: Cell = { x, y, l, c, h: lo };
        cells.push(cell);
        byPos.set(key(l, x, y), cell);
      }),
    ),
  );
  // a gravity area is built as stairs between its neighbours' heights (stand-in for its field)
  const neighbourHeights = (c: string) => {
    const hs: number[] = [];
    for (const p of cells.filter((q) => q.c === c))
      for (const [dx, dy] of DIRS)
        for (let l = 0; l < lay.layers.length; l++) {
          const q = byPos.get(key(l, p.x + dx, p.y + dy));
          if (q && q.c !== c && !sloped(area(q.c))) hs.push(area(q.c).h ?? lay.layers[l].y);
        }
    return hs;
  };
  const ranges = new Map<string, [number, number]>();
  for (const [c, a] of Object.entries(lay.legend)) {
    if (!sloped(a)) continue;
    if (a.r) ranges.set(c, a.r);
    else {
      const hs = neighbourHeights(c);
      ranges.set(c, hs.length ? [Math.min(...hs), Math.max(...hs)] : [a.h ?? 0, a.h ?? 0]);
    }
  }
  for (const [c, [lo, hi]] of ranges) {
    const a = area(c);
    const region = cells.filter((p) => p.c === c);
    if (!region.length || lo === hi) continue;
    if (a.dir) {
      // straight flight: height follows the region's extent along the rising direction
      const along = (p: Cell) =>
        a.dir === 'n' ? -p.y : a.dir === 's' ? p.y : a.dir === 'e' ? p.x : -p.x;
      const vals = region.map(along);
      const min = Math.min(...vals);
      const n = Math.max(...vals) - min + 1;
      for (const p of region) {
        const t = (along(p) - min + 0.5) / n;
        p.h = lo + (hi - lo) * t;
        p.rise = (hi - lo) / n;
        p.axis = a.dir === 'n' || a.dir === 's' ? 'z' : 'x';
        if (a.dir === 'n' || a.dir === 'w') p.rise = -p.rise; // falls toward +x / +z
      }
    } else {
      // any shape (L-shaped stairs): height follows the path from the low side to the high side
      const touches = (p: Cell, want: number) =>
        DIRS.some(([dx, dy]) =>
          lay.layers.some((_, l) => {
            const q = byPos.get(key(l, p.x + dx, p.y + dy));
            return (
              !!q &&
              q.c !== c &&
              !sloped(area(q.c)) &&
              Math.abs((area(q.c).h ?? lay.layers[l].y) - want) < 0.6
            );
          }),
        );
      const bfs = (seeds: Cell[]) => {
        const d = new Map<Cell, number>(seeds.map((p) => [p, 0]));
        const q = [...seeds];
        while (q.length) {
          const p = q.shift()!;
          for (const [dx, dy] of DIRS) {
            const n = byPos.get(key(p.l, p.x + dx, p.y + dy));
            if (n && n.c === c && !d.has(n)) {
              d.set(n, d.get(p)! + 1);
              q.push(n);
            }
          }
        }
        return d;
      };
      const dLo = bfs(region.filter((p) => touches(p, lo)));
      const dHi = bfs(region.filter((p) => touches(p, hi)));
      for (const p of region) {
        const a0 = dLo.get(p);
        const b0 = dHi.get(p);
        if (a0 === undefined || b0 === undefined) {
          p.h = (lo + hi) / 2;
          continue;
        }
        const t = (a0 + 0.5) / (a0 + b0 + 1);
        p.h = lo + (hi - lo) * t;
        // the step axis: toward the neighbour that is further along the climb
        let best: [number, number] = [1, 0];
        let gain = -Infinity;
        for (const [dx, dy] of DIRS) {
          const n = byPos.get(key(p.l, p.x + dx, p.y + dy));
          const g = n && n.c === c ? (dLo.get(n) ?? 0) - a0 : -Infinity;
          if (g > gain) {
            gain = g;
            best = [dx, dy];
          }
        }
        p.axis = best[0] !== 0 ? 'x' : 'z';
        p.rise = ((hi - lo) / (a0 + b0 + 1)) * (best[0] + best[1]);
      }
    }
  }

  const floors = cells.map((p) => p.h);
  const top = Math.max(...floors, ...lay.layers.map((l) => l.y));
  const bottom = Math.min(...floors, ...lay.layers.map((l) => l.y)) - 4;
  const wallTop = top + WALL_ABOVE;
  const cx = (x: number) => (x + 0.5) * s;
  const cz = (y: number) => (y + 0.5) * s;

  // ---- boxes -------------------------------------------------------------------------------
  const boxes: BoxDef[] = [];
  const column = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    yBot: number,
    yTop: number,
    mat: Material,
    color?: number,
  ): BoxDef => ({
    c: v3(((x0 + x1 + 1) / 2) * s, (yBot + yTop) / 2, ((y0 + y1 + 1) / 2) * s),
    h: v3(((x1 - x0 + 1) / 2) * s, (yTop - yBot) / 2, ((y1 - y0 + 1) / 2) * s),
    mat,
    ...(color !== undefined ? { color } : {}),
  });
  const colorOf = (c: string, h: number): number | undefined => {
    const k = area(c).k;
    if (k === 'cyan') return 0x2f9e98;
    if (k === 'orange') return 0xd77a45;
    if (k === 'site') return 0xb4443f;
    if (k === 'gravity') return 0x7b6bd6;
    return h <= -6 ? 0x3f5a6b : h < -1 ? 0x56717f : h <= 1 ? 0x7d796f : h < 8 ? 0xa3916a : 0xc4aa72;
  };
  // walls: merge runs of wall cells on the lowest layer into columns
  const ground = lay.layers[0].rows;
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (ground[y][x] !== WALL) {
        x++;
        continue;
      }
      let x2 = x;
      while (x2 + 1 < W && ground[y][x2 + 1] === WALL) x2++;
      boxes.push(column(x, y, x2, y, bottom, wallTop, 'hull'));
      x = x2 + 1;
    }
  }
  // floors: lowest layer = solid columns; higher layers = slabs; ramps = sub-steps
  for (const p of cells) {
    const a = area(p.c);
    const ground0 = p.l === 0;
    const mat: Material = sloped(a) ? 'grate' : 'floor';
    const color = colorOf(p.c, p.h);
    const steps = p.rise ? Math.max(1, Math.ceil(Math.abs(p.rise) / STEP)) : 1;
    const x0 = p.x * s;
    const z0 = p.y * s;
    for (let i = 0; i < steps; i++) {
      // strip i covers fraction f0..f1 of the cell along +axis; its top is the strip's high end,
      // so the last strip meets the higher neighbour flush and each step is at most STEP
      const f0 = i / steps;
      const f1 = (i + 1) / steps;
      const rise = p.rise ?? 0;
      const hTop = p.h - rise / 2 + rise * (rise > 0 ? f1 : f0);
      const yBot = ground0 ? bottom : hTop - 0.4;
      const [ax0, ax1, az0, az1] = !rise
        ? [x0, x0 + s, z0, z0 + s]
        : p.axis === 'x'
          ? [x0 + f0 * s, x0 + f1 * s, z0, z0 + s]
          : [x0, x0 + s, z0 + f0 * s, z0 + f1 * s];
      boxes.push({
        c: v3((ax0 + ax1) / 2, (yBot + hTop) / 2, (az0 + az1) / 2),
        h: v3((ax1 - ax0) / 2, Math.max(0.05, (hTop - yBot) / 2), (az1 - az0) / 2),
        mat,
        ...(color !== undefined ? { color } : {}),
      });
    }
  }
  // deadly drops: a kill volume under every void cell of the lowest layer
  const killVolumes: KillVolumeDef[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (ground[y][x] === VOID)
        killVolumes.push({
          min: v3(x * s, bottom - 20, y * s),
          max: v3((x + 1) * s, bottom + 1, (y + 1) * s),
        });
  // ceiling: invisible, keeps jetpacks inside the walls
  boxes.push({
    c: v3((W * s) / 2, wallTop + 0.5, (H * s) / 2),
    h: v3((W * s) / 2, 0.5, (H * s) / 2),
    mat: 'hull',
    noRender: true,
  });

  // ---- spawns, towers, sites, teleports ----------------------------------------------------
  const regionOf = (c: string) => cells.filter((p) => p.c === c);
  const centroid = (r: Cell[]) => [
    r.reduce((t, p) => t + p.x, 0) / r.length,
    r.reduce((t, p) => t + p.y, 0) / r.length,
  ];
  const mid = [(W - 1) / 2, (H - 1) / 2];
  const spawns: SpawnDef[] = [];
  const towers: TowerDef[] = [];
  const homes: Vec3[] = [];
  for (const [team, kind] of [
    [0, 'cyan'],
    [1, 'orange'],
  ] as const) {
    const c = Object.keys(lay.legend).find((k) => lay.legend[k].k === kind);
    if (!c) continue;
    const r = regionOf(c);
    const [mx, my] = centroid(r);
    const near = [...r].sort(
      (a, b) => (a.x - mx) ** 2 + (a.y - my) ** 2 - ((b.x - mx) ** 2 + (b.y - my) ** 2),
    );
    const far = [...r].sort(
      (a, b) =>
        (b.x - mid[0]) ** 2 + (b.y - mid[1]) ** 2 - ((a.x - mid[0]) ** 2 + (a.y - mid[1]) ** 2),
    );
    const yaw = (x: number, z: number) =>
      (Math.atan2(cx(mid[0]) - x, -(cz(mid[1]) - z)) * 180) / Math.PI;
    const picks = near.length >= 8 ? near.slice(0, 8) : near;
    for (let i = 0; spawns.filter((sp) => sp.team === team).length < 8; i++) {
      const p = picks[i % picks.length];
      const off = Math.floor(i / picks.length) * 1.2;
      const x = cx(p.x) + off;
      const z = cz(p.y) + off;
      spawns.push({ pos: v3(x, p.h, z), yawDeg: yaw(x, z), team });
    }
    const t = far[0];
    towers.push({ team, pos: v3(cx(t.x), t.h, cz(t.y)), radius: 1.5, height: 6 });
    homes.push(v3(cx(near[0].x), near[0].h, cz(near[0].y)));
  }
  const bombSites: BombSiteDef[] = [];
  for (const [c, a] of Object.entries(lay.legend)) {
    if (a.k !== 'site') continue;
    const r = regionOf(c);
    const name = a.n.trim().startsWith('B') ? 'B' : 'A';
    const xs = r.map((p) => p.x);
    const ys = r.map((p) => p.y);
    const hs = r.map((p) => p.h);
    bombSites.push({
      name,
      min: v3(Math.min(...xs) * s, Math.min(...hs) - 0.5, Math.min(...ys) * s),
      max: v3((Math.max(...xs) + 1) * s, Math.max(...hs) + 4, (Math.max(...ys) + 1) * s),
    });
  }
  const areas = Object.entries(lay.legend)
    .filter(([, a]) => !['void', 'solid'].includes(a.k))
    .map(([c, a]) => {
      const r = regionOf(c);
      if (!r.length) return null;
      const [mx, my] = centroid(r);
      const p = [...r].sort(
        (u, v) => (u.x - mx) ** 2 + (u.y - my) ** 2 - ((v.x - mx) ** 2 + (v.y - my) ** 2),
      )[0];
      return { name: a.n, pos: v3(cx(p.x), p.h, cz(p.y)), yawDeg: 0 };
    })
    .filter((a): a is { name: string; pos: Vec3; yawDeg: number } => !!a);

  // ---- launch pads (one-way links) ---------------------------------------------------------
  const launchPads: LaunchPadDef[] = [];
  for (const [from, to] of lay.pads ?? []) {
    const src = regionOf(from);
    const dst = regionOf(to);
    if (!src.length || !dst.length)
      throw new Error(`${lay.name}: pad ${from} → ${to} names a missing area`);
    const [tx, ty] = centroid(dst);
    const a = [...src].sort(
      (u, v) => (u.x - tx) ** 2 + (u.y - ty) ** 2 - ((v.x - tx) ** 2 + (v.y - ty) ** 2),
    )[0];
    const b = [...dst].sort(
      (u, v) => (u.x - tx) ** 2 + (u.y - ty) ** 2 - ((v.x - tx) ** 2 + (v.y - ty) ** 2),
    )[0];
    const dx = cx(b.x) - cx(a.x);
    const dz = cz(b.y) - cz(a.y);
    const dh = b.h - a.h;
    const T = Math.min(1.6, Math.max(0.7, Math.hypot(dx, dz) / 14));
    launchPads.push({
      min: v3(a.x * s + 1, a.h, a.y * s + 1),
      max: v3((a.x + 1) * s - 1, a.h + 0.6, (a.y + 1) * s - 1),
      vel: v3(dx / T, (dh + 0.5 * G * T * T) / T, dz / T),
    });
  }

  // ---- waypoints: every floor cell, linked where a bot can go ------------------------------
  const index = new Map<Cell, number>(cells.map((p, i) => [p, i]));
  // 1 m over the floor like the hand-made maps' waypoints (on stairs: over the step just past
  // the cell centre, up to STEP higher than the centre)
  const standY = (p: Cell) =>
    p.rise ? p.h + Math.abs(p.rise) / Math.max(1, Math.ceil(Math.abs(p.rise) / STEP)) : p.h;
  const waypoints: WaypointDef[] = cells.map((p) => ({
    pos: v3(cx(p.x), standY(p) + 1, cz(p.y)),
    links: [],
    name: `${p.c}${p.l}:${p.x},${p.y}`,
  }));
  const canGo = (a: Cell, b: Cell) => {
    const up = b.h - a.h;
    return up <= 2.6 && up >= -14;
  };
  for (const p of cells)
    for (const [dx, dy] of DIRS)
      for (let l = 0; l < lay.layers.length; l++) {
        const q = byPos.get(key(l, p.x + dx, p.y + dy));
        if (q && canGo(p, q)) waypoints[index.get(p)!].links.push(index.get(q)!);
      }

  // ---- size walls --------------------------------------------------------------------------
  const sizeWalls: SizeWallDef[] = [];
  const sizes = Object.entries(lay.sizes ?? {})
    .map(([n, closed]) => [Number(n), closed] as const)
    .sort((a, b) => b[0] - a[0]);
  const already = new Set<string>();
  for (const [maxTeamSize, closed] of sizes) {
    const fresh = closed.filter((c) => !already.has(c));
    fresh.forEach((c) => already.add(c));
    const wallBoxes: BoxDef[] = [];
    for (const c of fresh)
      for (const p of regionOf(c))
        wallBoxes.push(
          p.l === 0
            ? column(p.x, p.y, p.x, p.y, p.h - 0.2, wallTop, 'forcefield')
            : column(p.x, p.y, p.x, p.y, p.h - 0.6, p.h + 4, 'forcefield'),
        );
    if (wallBoxes.length) sizeWalls.push({ maxTeamSize, boxes: wallBoxes });
  }

  return {
    name: lay.name,
    boundsMin: v3(0, bottom - 1, 0),
    boundsMax: v3(W * s, wallTop + 1, H * s),
    defaultGravity: v3(0, -1, 0),
    boxes,
    zones: [],
    rails: [],
    pads: [],
    spawns,
    towers,
    controllerHomes: homes,
    waypoints,
    areas,
    bombSites,
    launchPads,
    ...(killVolumes.length ? { killVolumes } : {}),
    ...(sizeWalls.length ? { sizeWalls } : {}),
    ambient: 1,
  };
};
