// "Stormglass" — a storm observatory with the floor ripped out: two walled fortresses hanging in
// a gas giant's upper atmosphere at violet dusk, and between them The Eye, a 72 m open-air void
// over a lightning-lit cloud sea. 150 × 110 m (world x = east, the team axis; world z = south).
// Mirror-symmetric across x = 0 (Cyan, team 0, west; Orange, team 1, east): everything is
// authored for the east half and mirrored. Three floors: the UNDERCROFT (y -4), the DECK (y 0)
// and the INSTRUMENT FLOOR (y 5); the Anemometer floats over the middle (y 6, the perch y 10).
//
//   THE BASTIONS (|x| 36..71) are buildings now, not terraces: rooms, corridors and stairs cut
//     out of solid stone (`solidify`: every open volume below gets 1 m walls, the rest of the
//     bastion is solid). The Eye is only seen from five openings in each front wall (x = ±36):
//     the bridgehead (north), the north pad bay, the gate bay, the south pad bay, the spanhead
//     (south).
//     DECK (y 0): BRIDGEHEAD (x 37..46, z -40..-26; the Glass Bridge door; a stair pit down to
//       the vault) · NORTH HALL (x 47..60, z -40..-26; the stair up to the dome gallery) ·
//       NORTH CORRIDOR (x 51..54) down to the FRONT HALL (x 46..56, z -8..8) · the PAD BAY
//       (x 37..45, z -20..-8, open to the sky: the launch tower and the lookout the hop shards
//       start from) · the GATE BAY (x 37..45, z -6..6: the catwalk and the zip-rails) · the KEEP
//       COURTYARD (x 58..70, z -9..9, open to the sky, 8 m walls: the Tower) with three doors.
//       The south half mirrors the north (spanhead, south hall...).
//     INSTRUMENT FLOOR (y 5): the DOME GALLERY (over the north hall, a glass dome over it: spawn
//       group "gallery"), a corridor over the north corridor, the INSTRUMENT DECK over the front
//       hall, and the same to the RADIO ROOM over the south hall: the upstairs rotation.
//     UNDERCROFT (y -4): the NORTH / SOUTH VAULTS under the bridgehead / spanhead (the Cable
//       Duct / Pipe Gallery leave from them), the CISTERN under the front, the KEEP CELLAR under
//       the courtyard and the HATCH (spawn group "hatch") south-east, joined by narrow
//       maintenance tunnels: the maze.
//   THE EYE (|x| < 36): no floor. Fall and you're gone (a kill volume below y -9).
//     THE GLASS BRIDGE (north, z -35..-29, y 0): straight and fast, a glass deck with handrails
//       and no cover, into THE LENS DOME (bomb site A): a shattered observatory dome on the
//       middle line (x -13..13, z -42..-22), entered by its two bridge doors and by the stair pit
//       up from the crypt below.
//     THE CABLE DUCT hangs under the Glass Bridge (y -4): a cramped brass tunnel with chicanes,
//       glass floor panels over the storm and lightning at its windows, from the north vault to
//       THE CRYPT under the dome.
//     THE BROKEN SPAN (south, z 29..35, y 0): guard walls, cabinets, a roofed stretch — covered
//       — into THE SAG (bomb site B): a tall hall on the middle line (x -12..12, z 23..44) whose
//       floor fell 4 m (y -4). The span runs on through it as a balcony and snaps in the middle:
//       a 3.6 m gap to jump, or drop to the floor. A ramp down at each end.
//     THE PIPE GALLERY hangs under the Broken Span (y -4): from the south vault into the Sag.
//     THE ANEMOMETER (centre, y 6): a floating brass ring round the mast housing, whose roof is
//       THE PERCH (y 10, the highest ground; the power-up). Reached by a caged catwalk from each
//       gate bay (bots walk it), the launch pads and the zip-rails.
//     SHARDS: floating rocks. A hop chain on each flank from the lookout's top up to the
//       Anemometer's railing, and a drop chain from the ring down to each bridge.
import type { Vec3 } from '../../math/vec3';
import { v3 } from '../../math/vec3';
import { qFromAxisAngle, qFromUnitVectors } from '../../math/quat';
import { LevelBuilder, wedgeRamp } from '../builder';
import type {
  BoxDef,
  LaunchPadDef,
  LevelDef,
  LightDef,
  Material,
  RailDef,
  SpawnDef,
  TowerDef,
  WaypointDef,
} from '../types';

const CYAN = 0x19e3ff;
const ORANGE = 0xff8a1f;
const SITE = 0xc23b3b;
const PAD = 0xffc15a;

// violet dusk palette: slate fortresses, warm brass, pale glass
const SLATE = 0x5a5372; // keep walls
const SLATE_DARK = 0x3e3852;
const SLATE_FLOOR = 0x57506a; // bastion flagstones
const STONE = 0x6c6484; // parapets, the dome and the Sag
const ROCK = 0x3f3552; // island undersides
const ROCK_DEEP = 0x2e2640;
const SHARD_TOP = 0x74688e;
const SHARD_ROCK = 0x4a3f60;
const BRASS = 0xc89b4a; // rails, frames, cups
const BRASS_DARK = 0x8a6a34; // mast, housings, the duct
const BRASS_DECK = 0x86694a; // the span
const SAG_FLOOR = 0x5a4636; // the fallen middle section: scorched
const BRASS_DISC = 0x9a7a45; // the Anemometer
const BRASS_GLOW = 0xffc46b; // lamps, inlays
const CRATE = 0x6a5238;
const GRATE = 0x7a6a50;
const UNDER_WALL = 0x4a4258; // the undercroft: sooty metal
const UNDER_CEIL = 0x39324a;
const PIPE = 0x6f5a3a;
const GLASS = 0xa9c8ee; // the glass deck, glass floor panels, windows
const GLASS_EDGE = 0xe3d2ff;
const DOME_GLASS = 0x8fb2dc;
const LENS_FLOOR = 0x625a78;
const CLOUD = 0xc9b6e6;
const CLOUD_DEEP = 0xa592cf;
const LIGHTNING = 0xeae0ff;
const STORM = 0xb48cff;
const LAMP = 0xffc98a;
const HORIZON = 0xb27fb8;

/** Key coordinates (the plan). The west half mirrors the east (x → -x). */
export const STORMGLASS = {
  /** the bastions' front wall (x = ±36..37): the Eye lies between */
  rimX: 36,
  /** the void between the bastions */
  eye: { x0: -36, x1: 36, z0: -55, z1: 55 },
  /** below this you are dead (the kill volume's top) */
  killY: -9,
  /** top of the cloud sea far below */
  cloudY: -42,
  /** floor heights: the undercroft, the deck, the instrument floor */
  floors: { under: -4, deck: 0, upper: 5 },
  /** the east bastion (the west one mirrored): solid stone with rooms cut out */
  bastion: { x0: 36, x1: 71, z0: -41, z1: 41 },
  courtyard: { x0: 58, x1: 70, z0: -9, z1: 9 },
  /** the Glass Bridge's deck (east half) and the Cable Duct under it */
  glassBridge: { x0: 14, x1: 36, z0: -35, z1: -29, y: 0 },
  duct: { x0: 8, x1: 37, z0: -34, z1: -30, y: -4 },
  /** the Lens Dome (bomb site A) and the crypt under it, the stair pit between */
  dome: { x0: -13, x1: 13, z0: -42, z1: -22, y: 0, h: 6 },
  crypt: { x0: -8, x1: 8, z0: -42, z1: -22, y: -4 },
  pit: { x0: -1.5, x1: 1.5, zLow: -22, zHigh: -30 },
  /** the Broken Span's deck (east half): its lip at x 1.8, a 3.6 m gap to the west lip */
  span: { x0: 1.8, x1: 36, z0: 29, z1: 35, y: 0 },
  /** the Pipe Gallery under the span (east half) */
  gallery: { x0: 13, x1: 37, z0: 30, z1: 34, y: -4 },
  /** the Sag (bomb site B): a tall hall, its floor 4 m below the span */
  sag: { x0: -12, x1: 12, z0: 23, z1: 44, y: -4, top: 4 },
  /** the ramps from the span down to the Sag's floor (east; along z) */
  sagRamp: { x0: 8.5, x1: 11.5, zTop: 35, zFoot: 43 },
  /** the Anemometer's octagon deck (apothem 12) and the perch (the mast housing's roof) */
  disc: { y: 6, apothem: 12 },
  perch: { y: 10, half: 3 },
  /** the catwalk rim → disc (east): along z = 0, 1.6 m wide, rising 1 in 4 */
  catwalk: { x0: 12.15, x1: 36, width: 1.6 },
  /** Towers: Cyan's (west) first */
  towers: [v3(-64, 0, 0), v3(64, 0, 0)] as [Vec3, Vec3],
  bombSites: {
    A: { min: v3(-7, 0, -39.5), max: v3(7, 3, -31) },
    B: { min: v3(-6.3, -4, 35.5), max: v3(6.3, -1, 41.8) },
  },
  /** on the perch, beside the mast */
  powerups: [v3(0, 11.2, -1.5)],
  /**
   * guard walls and handrails along every edge over the void: a thin stone wall (half cover) up
   * to `wall` and a brass bar at `h` — a jump lifts your feet 1.2 m and a capsule rides over a
   * thin edge up to 0.4 m above its feet, so nobody walks, strafes or stumbles over; thin, so
   * there is nothing to stand on (no vaulting up onto it)
   */
  guard: { h: 1.85, wall: 1.1, thick: 0.12 },
  /** the lookouts in the pad bays the hop chains start from (east, north; mirrored): 2.6 m */
  lookout: { x0: 35.5, x1: 39, z0: -12.5, z1: -9, y: 2.6 },
  /**
   * launch pads in the pad bays (east, south; mirrored): on top of a 2.6 m launch tower — climb
   * it (hold jump against it), which bots never do: they never get thrown by accident
   */
  pad: { x0: 38.5, x1: 41.5, z0: 15, z1: 18, y: 2.6 },
  /** the south-east pad's throw (west: x negated, north: z negated) — onto the Anemometer */
  padVel: v3(-17.9, 20.8, -5.5),
  /** zip-rails gate bay → Anemometer (east, z = +4; mirrored to z = -4 and west) */
  rail: [v3(37.5, 3.7, 4), v3(13, 10, 4), v3(8, 9.6, 4)] as Vec3[],
  /** the hop chain (east, north; mirrored south and west): [x0, z0, x1, z1, top] */
  shards: [
    [28, -12.5, 32, -9, 2],
    [22, -13.5, 25.5, -10, 3],
    [16.5, -12.5, 20, -9, 4],
    [12.5, -9.5, 15, -6.5, 5],
  ] as [number, number, number, number, number][],
  /** the drop chain off the Anemometer's north edge down to the Glass Bridge (east; mirrored) */
  dropShards: [
    [8, -15.5, 11.5, -12, 3.6],
    [15, -24.5, 18.5, -21, 1.6],
  ] as [number, number, number, number, number][],
  /** spawn groups (east; mirrored): the dome gallery (north, upstairs), the keep, the hatch */
  spawnGroups: {
    gallery: [v3(56.5, 5, -32), v3(58.5, 5, -29), v3(55, 5, -28.5)],
    keep: [v3(67.5, 0, -5), v3(66, 0, -7.5)],
    hatch: [v3(66, -4, 17), v3(66, -4, 21.5), v3(63, -4, 23)],
  } as Record<string, Vec3[]>,
};

type Sign = 1 | -1;
const SIGNS: Sign[] = [1, -1];
const TAN = Math.tan(Math.PI / 8); // half an octagon's side per unit of apothem
const UP = v3(0, 1, 0);
const X_AXIS = v3(1, 0, 0);
/** wall, floor and ceiling thickness of the rooms */
const T = 1;

type Extra = Omit<BoxDef, 'c' | 'h' | 'mat'>;
type BoxFn = (
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  mat: Material,
  extra?: Extra,
) => void;
type BeamFn = (p0: Vec3, p1: Vec3, w: number, t: number, mat: Material, extra?: Extra) => void;
type OctFn = (
  cx: number,
  y0: number,
  y1: number,
  cz: number,
  a: number,
  mat: Material,
  extra?: Extra,
  turn?: number,
) => void;
type LightFn = (x: number, y: number, z: number, color: number, radius: number, k: number) => void;

// ------------------------------------------------------------------------------------------------
// Rooms cut out of stone: `solidify`
// ------------------------------------------------------------------------------------------------

interface Style {
  mat: Material;
  color: number;
}
/** An open volume (a room, a corridor, a doorway...). */
interface Vol {
  min: Vec3;
  max: Vec3;
  /** false: open to the sky (no ceiling slab; the walls stop at its top) */
  lid?: boolean;
  /** false: only carves (doorways, windows, holes): it adds no walls of its own */
  walls?: boolean;
  floor?: Style;
  wall?: Style;
  ceiling?: Style;
}
/** a block that is solid wherever no volume is open (the bastions' stone) */
interface Mass {
  min: Vec3;
  max: Vec3;
  style: Style;
}

/**
 * Solid stone around a set of open volumes: `T` thick walls, floors and ceilings round each one
 * (like builder.shellAround: touching volumes open into each other, one wall between volumes
 * 1 m apart, a thin volume across a wall is a doorway), and inside a `mass` block everything that
 * is not open is solid too — no pockets, no holes to fall into between the rooms. Only the east
 * half (x ≥ 0) is kept; the caller mirrors it, so the west half is its exact mirror image.
 * One style per cell: the floor of the room above wins, then the ceiling of the room below, then
 * the wall of the first room it borders, then the mass.
 */
const solidify = (vols: Vol[], masses: Mass[], put: BoxFn): void => {
  const grown = vols.map((v) =>
    v.walls === false
      ? null
      : {
          min: v3(v.min.x - T, v.min.y - T, v.min.z - T),
          max: v3(v.max.x + T, v.lid === false ? v.max.y : v.max.y + T, v.max.z + T),
        },
  );
  const coords = (k: 'x' | 'y' | 'z'): number[] => {
    const s = new Set<number>();
    for (const v of vols) s.add(v.min[k]).add(v.max[k]);
    for (const g of grown) if (g) s.add(g.min[k]).add(g.max[k]);
    for (const m of masses) s.add(m.min[k]).add(m.max[k]);
    if (k === 'x') s.add(0);
    return [...s].sort((a, c) => a - c).filter((x) => k !== 'x' || x >= 0);
  };
  const xs = coords('x');
  const ys = coords('y');
  const zs = coords('z');
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const nz = zs.length - 1;
  const inside = (min: Vec3, max: Vec3, x: number, y: number, z: number) =>
    x > min.x && x < max.x && y > min.y && y < max.y && z > min.z && z < max.z;
  const styles: Style[] = [];
  const styleId = (st: Style): number => {
    let i = styles.findIndex((o) => o.mat === st.mat && o.color === st.color);
    if (i < 0) i = styles.push(st) - 1;
    return 1 + i;
  };
  const FLOOR: Style = { mat: 'plate', color: SLATE_FLOOR };
  const WALL: Style = { mat: 'panel', color: SLATE };
  const CEIL: Style = { mat: 'panel', color: SLATE_DARK };
  const cells = new Int16Array(nx * ny * nz);
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  for (let i = 0; i < nx; i++) {
    const x = (xs[i] + xs[i + 1]) / 2;
    const openX = vols.filter((v) => x > v.min.x && x < v.max.x);
    const nearX = vols
      .map((v, vi) => ({ v, g: grown[vi] }))
      .filter(({ g }) => g && x > g.min.x && x < g.max.x);
    const massX = masses.filter((m) => x > m.min.x && x < m.max.x);
    for (let k = 0; k < nz; k++) {
      const z = (zs[k] + zs[k + 1]) / 2;
      const openXZ = openX.filter((v) => z > v.min.z && z < v.max.z);
      const nearXZ = nearX.filter(({ g }) => z > g!.min.z && z < g!.max.z);
      const massXZ = massX.filter((m) => z > m.min.z && z < m.max.z);
      for (let j = 0; j < ny; j++) {
        const y = (ys[j] + ys[j + 1]) / 2;
        if (openXZ.some((v) => y > v.min.y && y < v.max.y)) continue;
        let wall: Vol | null = null;
        let floor: Vol | null = null;
        let ceiling: Vol | null = null;
        for (const { v, g } of nearXZ) {
          if (!inside(g!.min, g!.max, x, y, z)) continue;
          wall ??= v;
          if (x <= v.min.x || x >= v.max.x || z <= v.min.z || z >= v.max.z) continue;
          if (y < v.min.y && (!floor || v.min.y < floor.min.y)) floor = v;
          else if (y > v.max.y && (!ceiling || v.max.y > ceiling.max.y)) ceiling = v;
        }
        const f = floor as Vol | null;
        const c = ceiling as Vol | null;
        const w = wall as Vol | null;
        let st: Style | null = null;
        if (f) st = f.floor ?? FLOOR;
        else if (c) st = c.ceiling ?? CEIL;
        else if (w) st = w.wall ?? WALL;
        else {
          const m = massXZ.find((mm) => y > mm.min.y && y < mm.max.y);
          if (m) st = m.style;
        }
        if (st) cells[at(i, j, k)] = styleId(st);
      }
    }
  }
  // greedy merge: from each free cell grow a box over cells of the same style, one axis after
  // the other; of the six axis orders keep the one that covers the most cells
  const done = new Uint8Array(cells.length);
  const n3 = [nx, ny, nz];
  const ORDERS = [
    [2, 0, 1],
    [2, 1, 0],
    [0, 2, 1],
    [0, 1, 2],
    [1, 0, 2],
    [1, 2, 0],
  ];
  const free = (c: number[], m: number) => {
    const a = at(c[0], c[1], c[2]);
    return cells[a] === m && !done[a];
  };
  /** all cells of lo..hi (exclusive hi) free with style m? */
  const allFree = (lo: number[], hi: number[], m: number) => {
    for (let i = lo[0]; i < hi[0]; i++)
      for (let j = lo[1]; j < hi[1]; j++)
        for (let k = lo[2]; k < hi[2]; k++) if (!free([i, j, k], m)) return false;
    return true;
  };
  /** the biggest box (in cells) growing from cell (i, j, k), over the six axis orders */
  const grow = (i: number, j: number, k: number, m: number): [number[], number[], number] => {
    let best: [number[], number[], number] = [[i, j, k], [i + 1, j + 1, k + 1], 1];
    for (const order of ORDERS) {
      const lo = [i, j, k];
      const hi = [i + 1, j + 1, k + 1];
      for (const ax of order)
        for (;;) {
          if (hi[ax] >= n3[ax]) break;
          const lo2 = [...lo];
          const hi2 = [...hi];
          lo2[ax] = hi[ax];
          hi2[ax] = hi[ax] + 1;
          if (!allFree(lo2, hi2, m)) break;
          hi[ax]++;
        }
      const n = (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]);
      if (n > best[2]) best = [lo, hi, n];
    }
    return best;
  };
  // seeds that grow the biggest boxes go first (a stable sort: ties keep the scan order)
  const seeds: [number, number, number, number][] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++)
      for (let k = 0; k < nz; k++) {
        const m = cells[at(i, j, k)];
        if (m !== 0) seeds.push([i, j, k, grow(i, j, k, m)[2]]);
      }
  seeds.sort((a, c) => c[3] - a[3]);
  for (const [i, j, k] of seeds) {
    const m = cells[at(i, j, k)];
    if (done[at(i, j, k)]) continue;
    const [lo, hi] = grow(i, j, k, m);
    for (let ii = lo[0]; ii < hi[0]; ii++)
      for (let jj = lo[1]; jj < hi[1]; jj++)
        for (let kk = lo[2]; kk < hi[2]; kk++) done[at(ii, jj, kk)] = 1;
    const st = styles[m - 1];
    put(xs[lo[0]], ys[lo[1]], zs[lo[2]], xs[hi[0]], ys[hi[1]], zs[hi[2]], st.mat, {
      color: st.color,
    });
  }
};

// styles of the rooms
const S_DECK_FLOOR: Style = { mat: 'plate', color: SLATE_FLOOR };
const S_WALL: Style = { mat: 'panel', color: SLATE };
const S_CEIL: Style = { mat: 'panel', color: SLATE_DARK };
const S_UNDER_FLOOR: Style = { mat: 'grate', color: GRATE };
const S_UNDER_WALL: Style = { mat: 'hull', color: UNDER_WALL };
const S_UNDER_CEIL: Style = { mat: 'hull', color: UNDER_CEIL };
const S_BRASS: Style = { mat: 'plate', color: BRASS_DARK };
const S_SPAN: Style = { mat: 'plate', color: BRASS_DECK };
const S_DOME: Style = { mat: 'skyglass', color: DOME_GLASS };
const S_STONE: Style = { mat: 'rock', color: STONE };
const S_SAG: Style = { mat: 'plate', color: SAG_FLOOR };
const S_LENS: Style = { mat: 'plate', color: LENS_FLOOR };

/** the plan's open volumes (east half and the middle; the caller mirrors the result) */
const plan = (): { vols: Vol[]; carves: Vol[] } => {
  const S = STORMGLASS;
  const F = S.floors;
  const vols: Vol[] = [];
  const carves: Vol[] = [];
  const vol = (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    o: Partial<Vol> = {},
  ) => vols.push({ min: v3(x0, y0, z0), max: v3(x1, y1, z1), ...o });
  /** a doorway / window / hole: carves, adds no walls */
  const cut = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
    carves.push({ min: v3(x0, y0, z0), max: v3(x1, y1, z1), walls: false });
  /** north and south copies (authored for the north, z < 0) */
  const ns = (f: (z0: number, z1: number) => void, z0: number, z1: number) => {
    f(z0, z1);
    f(-z1, -z0);
  };
  const deck = { floor: S_DECK_FLOOR, wall: S_WALL, ceiling: S_CEIL };
  const under = { floor: S_UNDER_FLOOR, wall: S_UNDER_WALL, ceiling: S_UNDER_CEIL };
  const G0 = F.deck;
  const G1 = F.deck + 4;
  const U0 = F.under;
  const U1 = F.under + 3;
  const F0 = F.upper;
  const F1 = F.upper + 3.5;

  // ---------------- the deck (y 0): north half, mirrored south ----------------
  // bridgehead / spanhead: the bridge door in the front wall; a stair pit down to the vault
  ns((a, c) => vol(37, 46, G0, G1, a, c, deck), -40, -26);
  ns((a, c) => cut(36, 37, G0, G0 + 3.5, a, c), -35, -29);
  // north / south hall (the stair up to the gallery along its back wall)
  ns((a, c) => vol(47, 60, G0, G1, a, c, deck), -40, -26);
  ns((a, c) => cut(46, 47, G0, G0 + 3, a, c), -30, -27);
  // corridor to the front hall
  ns((a, c) => vol(51, 54, G0, G1, a, c, deck), -25, -9);
  ns((a, c) => cut(51, 54, G0, G0 + 3, a, c), -26, -25);
  ns((a, c) => cut(51, 54, G0, G0 + 3, a, c), -9, -8);
  // the pad bay: open to the sky and to the Eye; a passage to the corridor
  ns((a, c) => vol(37, 45, G0, G0 + 7, a, c, { ...deck, lid: false }), -20, -8);
  ns((a, c) => cut(36, 37, G0, G0 + 7, a, c), -20, -8);
  ns((a, c) => vol(45, 51, G0, G1, a, c, deck), -16, -12);
  // the keep's side passages: corridor → courtyard
  ns((a, c) => vol(54, 58, G0, G1, a, c, deck), -21, -18);
  ns((a, c) => vol(58, 61, G0, G1, a, c, deck), -21, -10);
  ns((a, c) => cut(58, 61, G0, G0 + 3, a, c), -10, -9);
  // the gate bay (catwalk, zip-rails) and the front hall behind it
  vol(37, 45, G0, G1, -6, 6, deck);
  cut(36, 37, G0, G1, -6, 6);
  ns((a, c) => cut(36, 37, G1, G1 + 0.6, a, c), -4.4, -3.6); // slots for the zip-rail cables
  // two doors to the front hall, in the corners: none lines up with the courtyard door
  ns((a, c) => cut(45, 46, G0, G0 + 3, a, c), -6, -3);
  vol(46, 56, G0, G1, -8, 8, deck);
  // the keep courtyard (the Tower), open to the sky
  vol(S.courtyard.x0, S.courtyard.x1, G0, G0 + 8, S.courtyard.z0, S.courtyard.z1, {
    ...deck,
    lid: false,
  });
  // the courtyard door, off to the south: nothing seen through the gate bay's doors lines up
  // with it and the keep spawns (north)
  cut(56, 58, G0, G0 + 3.2, 4, 7);

  // ---------------- the instrument floor (y 5) ----------------
  // the dome gallery / radio room over the halls (a glass dome over the north one); the stair
  // up from the hall runs along the back wall
  ns(
    (a, c) =>
      vol(47, 60, F0, F1, a, c, {
        ...deck,
        ceiling: a < 0 ? S_DOME : S_CEIL,
      }),
    -40,
    -26,
  );
  ns((a, c) => vol(49, 59, G0, F1, a, c, deck), -40, -37.5);
  ns((a, c) => vol(51, 54, F0, F1, a, c, deck), -25, -9);
  ns((a, c) => cut(51, 54, F0, F0 + 3, a, c), -26, -25);
  ns((a, c) => cut(51, 54, F0, F0 + 3, a, c), -9, -8);
  vol(46, 56, F0, F1, -8, 8, deck);

  // ---------------- the undercroft (y -4) ----------------
  // the vaults under the bridgehead / spanhead, the stair pit up
  ns((a, c) => vol(37, 47, U0, U1, a, c, under), -40, -26);
  ns((a, c) => vol(41, 43.5, U0, G1, a, c, under), -38, -30);
  // north: vault → a tunnel east → down to the keep cellar
  vol(47, 62, U0, U1, -30, -27, under);
  vol(59, 62, U0, U1, -27, -11, under);
  // vault → a tunnel south → the cistern under the front
  ns((a, c) => vol(40, 43, U0, U1, a, c, under), -26, -9);
  vol(37, 52, U0, U1, -9, 9, under);
  vol(52, 57, U0, U1, -2.5, 2.5, under);
  // the keep cellar under the courtyard
  vol(57, 69, U0, U1, -11, 11, under);
  // south: the hatch (a spawn), a tunnel up to the cellar and one west to the south vault
  vol(56, 68, U0, U1, 14, 25, under);
  vol(60, 63, U0, U1, 11, 14, under);
  // (a dog-leg before the hatch: no straight look into the spawn from the tunnel)
  vol(44, 52, U0, U1, 19, 22, under);
  vol(52, 55, U0, U1, 19, 22, under);
  vol(52, 56, U0, U1, 22, 25, under);
  vol(44, 47, U0, U1, 22, 26, under);

  // ---------------- the Eye ----------------
  const D = S.dome;
  const brass = { floor: S_UNDER_FLOOR, wall: S_BRASS, ceiling: S_BRASS };
  // the Lens Dome (A), the crypt under it and the stair pit between
  vol(D.x0, D.x1, D.y, D.y + D.h, D.z0, D.z1, { floor: S_LENS, wall: S_STONE, ceiling: S_DOME });
  cut(D.x1, D.x1 + T, G0, G0 + 3.2, -34, -30);
  const C = S.crypt;
  vol(0, C.x1, U0, U1, C.z0, C.z1, brass);
  vol(C.x0, 0, U0, U1, C.z0, C.z1, brass);
  cut(S.pit.x0, S.pit.x1, U0, G0, S.pit.zHigh, S.pit.zLow);
  // the Cable Duct under the Glass Bridge (its roof carries the glass deck)
  const DU = S.duct;
  vol(DU.x0, DU.x1, U0, -1.3, DU.z0, DU.z1, brass);
  // the Sag (B): a tall hall; the span comes in at y 0, the Pipe Gallery at y -4
  const SG = S.sag;
  vol(0, SG.x1, SG.y, SG.top, SG.z0, SG.z1, { floor: S_SAG, wall: S_STONE, ceiling: S_CEIL });
  vol(SG.x0, 0, SG.y, SG.top, SG.z0, SG.z1, { floor: S_SAG, wall: S_STONE, ceiling: S_CEIL });
  cut(SG.x1, SG.x1 + T, G0, G0 + 3.5, S.span.z0, S.span.z1);
  cut(SG.x1, SG.x1 + T, U0, U1, S.gallery.z0, S.gallery.z1);
  const GA = S.gallery;
  vol(GA.x0, GA.x1, U0, U1, GA.z0, GA.z1, { floor: S_UNDER_FLOOR, wall: S_BRASS, ceiling: S_SPAN });
  return { vols, carves };
};

export const buildStormglass = (): LevelDef => {
  const S = STORMGLASS;
  const b = new LevelBuilder();
  const lights: LightDef[] = [];

  /** a box between two corners given in any order */
  const box: BoxFn = (x0, y0, z0, x1, y1, z1, mat, extra = {}) => {
    b.box(
      v3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      v3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)),
      { mat, ...extra },
    );
  };
  /** the box east and its mirror image west (authored east: x ≥ 0) */
  const both: BoxFn = (x0, y0, z0, x1, y1, z1, mat, extra = {}) => {
    for (const s of SIGNS) box(s * x0, y0, z0, s * x1, y1, z1, mat, extra);
  };
  /** both(), and north ↔ south mirrored too (four copies; authored for z ≤ 0) */
  const quad: BoxFn = (x0, y0, z0, x1, y1, z1, mat, extra = {}) => {
    for (const n of SIGNS) both(x0, y0, n * z0, x1, y1, n * z1, mat, extra);
  };
  /** a box centred on c, half extents h, turned `deg` about the vertical */
  const turned = (c: Vec3, h: Vec3, deg: number, mat: Material, extra: Extra = {}) => {
    const d = ((deg % 180) + 180) % 180;
    if (d < 1e-9 || 180 - d < 1e-9) b.boxes.push({ c, h, mat, ...extra });
    else if (Math.abs(d - 90) < 1e-9) b.boxes.push({ c, h: v3(h.z, h.y, h.x), mat, ...extra });
    else b.boxes.push({ c, h, q: qFromAxisAngle(UP, (deg * Math.PI) / 180), mat, ...extra });
  };
  /** a beam from p0 to p1, `w` wide and `t` tall (a rib, a strut, a mast) */
  const beam: BeamFn = (p0, p1, w, t, mat, extra = {}) => {
    const k = p1.x - p0.x < -1e-9 ? -1 : 1;
    const d = v3(k * (p1.x - p0.x), k * (p1.y - p0.y), k * (p1.z - p0.z));
    const l = Math.hypot(d.x, d.y, d.z);
    const dir = v3(d.x / l, d.y / l, d.z / l);
    const c = v3((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
    const h = v3(l / 2, t / 2, w / 2);
    if (Math.abs(Math.abs(dir.x) - 1) < 1e-9) b.boxes.push({ c, h, mat, ...extra });
    else b.boxes.push({ c, h, q: qFromUnitVectors(X_AXIS, dir, UP), mat, ...extra });
  };
  const mirror = (p: Vec3) => v3(-p.x, p.y, p.z);
  /** a beam east and its mirror west */
  const beams: BeamFn = (p0, p1, w, t, mat, extra = {}) => {
    beam(p0, p1, w, t, mat, extra);
    beam(mirror(p0), mirror(p1), w, t, mat, extra);
  };
  /** A solid regular octagon (apothem `a`, from y0 to y1) around (cx, cz): four crossed boxes. */
  const octagon: OctFn = (cx, y0, y1, cz, a, mat, extra = {}, turn = 0) => {
    const h = v3(a, (y1 - y0) / 2, a * TAN);
    const c = v3(cx, (y0 + y1) / 2, cz);
    for (const deg of [0, 45, 90, 135]) turned(c, h, deg + turn, mat, extra);
  };
  /** a soft eight-pointed blob (two squares, a quarter turn apart: clouds, far rocks) */
  const blob: OctFn = (cx, y0, y1, cz, a, mat, extra = {}, turn = 0) => {
    const h = v3(a * 0.9, (y1 - y0) / 2, a * 0.9);
    const c = v3(cx, (y0 + y1) / 2, cz);
    for (const deg of [0, 45]) turned(c, h, deg + turn, mat, extra);
  };
  /** blob() east and west (mirrored: turned the other way) */
  const blobs: OctFn = (cx, y0, y1, cz, a, mat, extra = {}, turn = 0) => {
    blob(cx, y0, y1, cz, a, mat, extra, turn);
    blob(-cx, y0, y1, cz, a, mat, extra, -turn);
  };
  const light: LightFn = (x, y, z, color, radius, k) => {
    lights.push({ pos: v3(x, y, z), color, radius, intensity: k });
  };
  const lights2: LightFn = (x, y, z, color, radius, k) => {
    light(x, y, z, color, radius, k);
    light(-x, y, z, color, radius, k);
  };

  // =============================== the stone: bastions, dome, Sag, tunnels ===============================
  const { vols, carves } = plan();
  const B = S.bastion;
  const F = S.floors;
  // glass floor panels in the Cable Duct and the Pipe Gallery, windows in their outer walls
  const glassPanels: [number, number, number, number, number, number][] = [];
  const panel = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    carves.push({ min: v3(x0, y0, z0), max: v3(x1, y1, z1), walls: false });
    glassPanels.push([x0, x1, y0, y1, z0, z1]);
  };
  const DU = S.duct;
  const GA = S.gallery;
  for (const [x0, x1] of [
    [19.5, 22],
    [28, 30.5],
  ]) {
    panel(x0, x1, F.under - T, F.under, DU.z0 + 0.5, DU.z1 - 0.5);
    panel(x0, x1, F.under - T, F.under, GA.z0 + 0.5, GA.z1 - 0.5);
  }
  for (const [x0, x1] of [
    [16, 18.5],
    [22, 24],
    [27, 29],
    [32, 34],
  ]) {
    panel(x0, x1, -3, -2, DU.z0 - T, DU.z0); // the duct's north wall
    panel(x0, x1, -3, -2, GA.z1, GA.z1 + T); // the gallery's south wall
  }
  solidify(
    [...vols, ...carves],
    [{ min: v3(B.x0, F.under - T, B.z0), max: v3(B.x1, F.deck + 5, B.z1), style: S_WALL }],
    both,
  );
  for (const [x0, x1, y0, y1, z0, z1] of glassPanels)
    both(x0, y0, z0, x1, y1, z1, 'skyglass', { color: GLASS, trim: GLASS_EDGE });

  // chicanes in the tunnels: pipe bundles from the wall to just past the middle, alternating
  // sides (no straight look down a tunnel)
  const pipeBank = { color: PIPE };
  const CHICANE = 2.1;
  for (const [x, north] of [
    [15, true],
    [25, false],
    [34, true],
  ] as [number, boolean][]) {
    const [a, c] = north ? [DU.z0, DU.z0 + CHICANE] : [DU.z1 - CHICANE, DU.z1];
    both(x, F.under, a, x + 1, -1.3, c, 'hull', pipeBank);
  }
  for (const [x, south] of [
    [15, true],
    [25, false],
    [34, true],
  ] as [number, boolean][]) {
    const [a, c] = south ? [GA.z1 - CHICANE, GA.z1] : [GA.z0, GA.z0 + CHICANE];
    both(x, F.under, a, x + 1, -1, c, 'hull', pipeBank);
  }

  // the stairs: the vault pits (deck ↔ undercroft), the halls (deck ↔ instrument floor), the
  // dome pit (crypt ↔ Lens)
  const stairStyle = { mat: 'plate' as Material, color: SLATE_FLOOR };
  for (const n of SIGNS)
    for (const s of SIGNS) {
      // the vault pit: along z, low end away from the front hall
      b.boxes.push(
        wedgeRamp('z', n * -38, n * -30, F.under, F.deck, s * 42.25, 2.5, {
          ...stairStyle,
          color: GRATE,
          mat: 'grate',
        }),
      );
      // the hall stair: along x, up toward the front
      b.boxes.push(wedgeRamp('x', s * 59, s * 49, F.deck, F.upper, n * -38.75, 2.5, stairStyle));
    }
  const P = S.pit;
  b.boxes.push(
    wedgeRamp('z', P.zLow, P.zHigh, F.under, F.deck, 0, P.x1 - P.x0, {
      mat: 'plate',
      color: LENS_FLOOR,
    }),
  );

  // the island's rock underside, tapering into a spike
  both(B.x0 + 0.5, -9, B.z0 + 1, B.x1 - 0.5, F.under - T, B.z1 - 1, 'rock', { color: ROCK });
  both(B.x0 + 4, -15, B.z0 + 6, B.x1 - 4, -9, B.z1 - 6, 'rock', { color: ROCK });
  both(B.x0 + 9, -22, B.z0 + 13, B.x1 - 8, -15, B.z1 - 13, 'rock', { color: ROCK_DEEP });
  both(B.x0 + 14, -30, -12, B.x1 - 11, -22, 12, 'rock', { color: ROCK_DEEP });
  both(53, -38, -4, 57, -30, 4, 'rock', { color: ROCK_DEEP });

  // merlons on the courtyard walls, glass dome over the north gallery
  const wallLook = { color: SLATE };
  for (const z of [-7, -3, 3, 7]) both(70, 8, z - 0.8, 71, 9, z + 0.8, 'panel', wallLook);
  for (const x of [60, 64, 68]) quad(x - 0.8, 8, -10, x + 0.8, 9, -9, 'panel', wallLook);
  const dome = { color: DOME_GLASS, trim: BRASS };
  both(49.5, F.upper + 4.5, -38, 57.5, F.upper + 6, -28, 'skyglass', dome);
  both(51.5, F.upper + 6, -36, 55.5, F.upper + 7, -30, 'skyglass', dome);

  // ---- guard walls along every edge over the void: a thin stone wall (half cover, nothing to
  // stand on) with a brass bar above it, out of a jump's reach ----
  const para = { color: STONE };
  const rail = { color: BRASS };
  const GT = S.guard.thick;
  const RH = S.guard.h;
  const GW = S.guard.wall;
  /** bars of a handrail (knee, top): nothing fits under or between them, nothing jumps over */
  const BAR_ROWS: [number, number][] = [
    [0.55, 0.65],
    [RH - 0.12, RH],
  ];
  /** a guard wall from (x0, z0) to (x1, z1) standing at y; `place`: both (mirrored) or box */
  const guardAt = (place: BoxFn, x0: number, z0: number, x1: number, z1: number, y = 0) => {
    place(x0, y, z0, x1, y + GW, z1, 'rock', para);
    place(x0, y + RH - 0.12, z0, x1, y + RH, z1, 'plate', rail);
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const [a0, a1] = alongX ? [x0, x1] : [z0, z1];
    const n = Math.ceil(Math.abs(a1 - a0) / 10);
    for (let i = 0; i <= n; i++) {
      const u = Math.min(
        Math.max(a0 + ((a1 - a0) * i) / n, Math.min(a0, a1) + 0.06),
        Math.max(a0, a1) - 0.06,
      );
      if (alongX) place(u - 0.06, y + GW, z0, u + 0.06, y + RH - 0.12, z1, 'plate', rail);
      else place(x0, y + GW, u - 0.06, x1, y + RH - 0.12, u + 0.06, 'plate', rail);
    }
  };
  const guard = (x0: number, z0: number, x1: number, z1: number, y = 0) =>
    guardAt(both, x0, z0, x1, z1, y);
  const R0 = S.rimX;
  const LK = S.lookout;
  const gate = S.catwalk.width / 2;
  // the open fronts: pad bays (the lookout stands in the gap) and the gate bay (the catwalk)
  for (const [z0, z1] of [
    [-20, LK.z0],
    [LK.z1, -8],
    [-6, -gate - 0.6],
    [gate + 0.6, 6],
    [8, -LK.z1],
    [-LK.z0, 20],
  ])
    guard(R0, z0, R0 + GT, z1);
  // the lookouts: brass instrument towers on the rim, too tall to vault (climb them)
  quad(LK.x0, 0, LK.z0, LK.x1, LK.y, LK.z1, 'panel', { color: BRASS_DARK });
  quad(LK.x0, LK.y, LK.z0, LK.x0 + 0.3, LK.y + 0.06, LK.z1, 'trim', {
    color: BRASS_GLOW,
    noCollide: true,
  });
  // gate posts where the catwalks leave the rim and reach the Anemometer (with lamps)
  const gatePost = (x0: number, x1: number, y: number, top: number) => {
    quad(x0, y, -gate - 0.6, x1, y + top, -gate, 'pillar', { color: BRASS_DARK });
    quad(x0 - 0.05, y + top, -gate - 0.65, x1 + 0.05, y + top + 0.3, -gate, 'glow', {
      color: BRASS_GLOW,
      noCollide: true,
    });
  };
  gatePost(R0 - 0.3, R0 + 0.3, 0, 3.4);
  gatePost(S.disc.apothem - 0.3, S.disc.apothem + 0.3, S.disc.y, 3.6);

  // ---- cover inside the bastions ----
  const cab = { color: BRASS_DARK };
  const crate = { color: CRATE };
  // bridgehead / spanhead: an instrument cabinet (full) between the door and the pit, a crate
  quad(38.5, 0, -38.5, 40, 2.4, -36.5, 'panel', cab);
  quad(44, 0, -38.5, 45.5, 1.1, -37, 'crate', crate);
  // halls: crates by the stair, a cabinet in the middle
  quad(50, 0, -35, 52, 1.1, -33.5, 'crate', crate);
  quad(55.5, 0, -32, 57, 2.4, -29.5, 'panel', cab);
  // front hall: a cabinet (full) on the north side, across from the courtyard door
  both(53, 0, -6, 54.5, 2.4, -4, 'panel', cab);
  // pad bays: a crate
  quad(43, 0, -10, 44.5, 1.1, -8.5, 'crate', crate);
  // the cistern: pillars
  for (const [x, z] of [
    [42, -4],
    [47, 4],
  ] as [number, number][])
    for (const n of SIGNS) both(x - 0.6, F.under, n * z - 0.6, x + 0.6, -1, n * z + 0.6, 'hull', pipeBank);

  // ---- zip-rail gantries in the gate bay (the rail hangs between the posts) ----
  quad(37.8, 0, -3, 38.2, 3.9, -2.6, 'pillar', { color: BRASS_DARK });
  quad(37.8, 0, -5.4, 38.2, 3.9, -5, 'pillar', { color: BRASS_DARK });

  // =============================== the Glass Bridge ===============================
  const G = S.glassBridge;
  both(G.x0, -0.3, G.z0, G.x1, 0, G.z1, 'skyglass', { color: GLASS, trim: GLASS_EDGE });
  const bars = (x0: number, x1: number, z0: number, z1: number) => {
    for (const [y0, y1] of BAR_ROWS) both(x0, y0, z0, x1, y1, z1, 'plate', rail);
  };
  const handrail = (x0: number, x1: number, z0: number, z1: number) => {
    bars(x0, x1, z0, z1);
    const n = Math.ceil((x1 - x0) / 10);
    for (let i = 0; i <= n; i++) {
      const px = Math.min(Math.max(x0 + ((x1 - x0) * i) / n, x0 + 0.06), x1 - 0.06);
      both(px - 0.06, 0, z0, px + 0.06, RH, z1, 'plate', rail);
    }
  };
  handrail(G.x0, G.x1, G.z0, G.z0 + 0.1);
  handrail(G.x0, G.x1, G.z1 - 0.1, G.z1);

  // =============================== the Lens Dome (A) ===============================
  const D = S.dome;
  // the stair pit's railing (east, west, south), the telescope housing and its crates
  for (const [y0, y1] of BAR_ROWS) {
    both(P.x1, y0, P.zHigh + 0.5, P.x1 + 0.1, y1, P.zLow, 'plate', rail);
  }
  both(P.x1, 0, P.zHigh + 0.5, P.x1 + 0.12, RH, P.zHigh + 0.62, 'plate', rail);
  both(P.x1, 0, P.zLow - 0.12, P.x1 + 0.12, RH, P.zLow, 'plate', rail);
  box(-1.2, 0, -41.8, 1.2, 2.4, -40, 'panel', { color: BRASS_DARK });
  beam(v3(0, 2.4, -41), v3(0, 5.2, -38.5), 0.9, 0.9, 'panel', {
    color: BRASS_DARK,
    noCollide: true,
  });
  both(4, 0, -38.5, 5.5, 1.1, -37, 'crate', crate);
  both(8.5, 0, -41, 10.5, 2.4, -39, 'panel', cab);
  both(9, 0, -26, 10.5, 1.1, -24, 'crate', crate);
  // the lens itself: a glowing ring inlaid in the floor
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const r = 3.4;
    turned(v3(r * Math.cos(a), 0.01, -36.5 + r * Math.sin(a)), v3(0.08, 0.01, r * TAN), -k * 45, 'trim', {
      color: GLASS_EDGE,
      noCollide: true,
    });
  }

  // =============================== the Broken Span ===============================
  const SP = S.span;
  const SG = S.sag;
  const deckLook = { color: BRASS_DECK };
  // (outside, the span's deck is the Pipe Gallery's roof; inside the Sag it runs on as a balcony)
  box(SP.x0, -0.5, SP.z0, SG.x1, 0, SP.z1, 'plate', deckLook);
  box(-SG.x1, -0.5, SP.z0, -SP.x0, 0, SP.z1, 'plate', deckLook);
  both(SP.x0, -1.2, SP.z0, SG.x1, -0.5, SP.z0 + 0.3, 'plate', { color: BRASS_DARK });
  both(SP.x0, -1.2, SP.z1 - 0.3, SG.x1, -0.5, SP.z1, 'plate', { color: BRASS_DARK });
  // outside: guard walls (half cover), cover on the deck, the roofed stretch
  guard(GA.x0, SP.z0, SP.x1, SP.z0 + GT);
  guard(GA.x0, SP.z1 - GT, SP.x1, SP.z1);
  both(24, 0, SP.z0 + GT, 26, 2.4, 31.2, 'panel', cab);
  both(29.5, 0, 33.2, 31.5, 1.1, SP.z1 - GT, 'crate', crate);
  both(17, 0, 33.2, 19, 2.4, SP.z1 - GT, 'panel', cab);
  for (const x of [20, 32.6])
    for (const [z0, z1] of [
      [SP.z0, SP.z0 + GT],
      [SP.z1 - GT, SP.z1],
    ])
      both(x, RH, z0, x + 0.4, 3.6, z1, 'pillar', { color: BRASS_DARK });
  both(19.6, 3.6, SP.z0 - 0.3, 33.4, 3.9, SP.z1 + 0.3, 'panel', { color: BRASS_DARK });
  // inside: handrails along the balcony (open at the ramp), a crate by the lip
  const SR = S.sagRamp;
  for (const [y0, y1] of BAR_ROWS) {
    both(SP.x0, y0, SP.z0, SG.x1, y1, SP.z0 + 0.1, 'plate', rail);
    both(SP.x0, y0, SP.z1 - 0.1, SR.x0, y1, SP.z1, 'plate', rail);
  }
  for (const x of [SP.x0 + 0.06, SR.x0 - 0.06])
    both(x - 0.06, 0, SP.z1 - 0.1, x + 0.06, RH, SP.z1, 'plate', rail);
  both(SP.x0 + 0.06 - 0.06, 0, SP.z0, SP.x0 + 0.12, RH, SP.z0 + 0.1, 'plate', rail);
  both(5, 0, SP.z0 + 0.1, 6.5, 1.1, 30.6, 'crate', crate);
  // the ramps down to the Sag's floor, with a stone wall on their open side
  for (const s of SIGNS)
    b.boxes.push(
      wedgeRamp('z', SR.zTop, SR.zFoot, 0, SG.y, s * ((SR.x0 + SR.x1) / 2), SR.x1 - SR.x0, {
        mat: 'plate',
        color: BRASS_DECK,
      }),
    );
  both(SR.x0 - 0.3, SG.y, SR.zTop, SR.x0, 1.1, SR.zFoot - 1.5, 'rock', para);
  // snapped girders at the lip, bent down into the gap (decoration)
  beams(v3(SP.x0 + 0.15, -1.2, SP.z1 - 1.4), v3(0.9, -2.6, SP.z1 - 1.1), 0.35, 0.35, 'plate', {
    color: BRASS_DARK,
    noCollide: true,
  });
  both(SP.x0 - 0.05, -0.5, SP.z0 + 0.1, SP.x0, 0, SP.z1 - 0.1, 'trim', {
    color: BRASS_GLOW,
    noCollide: true,
  });
  // the Sag's floor: a fallen gear housing (half) in the middle, cabinets (full) in the corners,
  // crates (half) under the balcony
  box(-1.6, SG.y, 40.3, 1.6, SG.y + 1.1, 41.5, 'panel', { color: BRASS_DARK });
  both(4, SG.y, 42, 5.5, SG.y + 2.4, 43.6, 'panel', cab);
  both(4, SG.y, 25, 5.2, SG.y + 1.1, 26.2, 'crate', crate);
  both(6.5, SG.y, 36.5, 7.7, SG.y + 1.1, 37.7, 'crate', crate);

  // =============================== the Anemometer ===============================
  const Dc = S.disc;
  const disc = { color: BRASS_DISC };
  octagon(0, Dc.y - 0.6, Dc.y, 0, Dc.apothem, 'plate', disc);
  // the keel underneath, tapering into a spike
  octagon(0, Dc.y - 1.6, Dc.y - 0.6, 0, 8, 'plate', { color: BRASS_DARK }, 22.5);
  octagon(0, Dc.y - 3.6, Dc.y - 1.6, 0, 5, 'plate', { color: BRASS_DARK });
  octagon(0, -2, Dc.y - 3.6, 0, 2.5, 'plate', { color: BRASS_DARK }, 22.5);
  box(-0.6, -9, -0.6, 0.6, -2, 0.6, 'pillar', { color: BRASS_DARK });
  // handrails round the edge, open only where the catwalks come up (east, west)
  const octagonRail = (cx: number, y: number, cz: number, a: number, skip: number[]) => {
    const side = a * TAN;
    for (let k = 0; k < 8; k++) {
      if (skip.includes(k)) continue;
      const ang = (k * Math.PI) / 4;
      const r = a - 0.06;
      for (const [y0, y1] of BAR_ROWS)
        turned(
          v3(cx + r * Math.cos(ang), y + (y0 + y1) / 2, cz + r * Math.sin(ang)),
          v3(0.05, (y1 - y0) / 2, side),
          -k * 45,
          'plate',
          rail,
        );
    }
    for (let k = 0; k < 8; k++) {
      const ang = ((k + 0.5) * Math.PI) / 4;
      const r = a / Math.cos(Math.PI / 8) - 0.15;
      const x = cx + r * Math.cos(ang);
      const z = cz + r * Math.sin(ang);
      box(x - 0.08, y, z - 0.08, x + 0.08, y + RH, z + 0.08, 'plate', rail);
    }
  };
  octagonRail(0, Dc.y, 0, Dc.apothem, [0, 4]);
  const discSide = Dc.apothem * TAN;
  for (const n of SIGNS)
    for (const [y0, y1] of BAR_ROWS)
      both(
        Dc.apothem - 0.11,
        Dc.y + y0,
        n * (S.catwalk.width / 2 + 0.6),
        Dc.apothem - 0.01,
        Dc.y + y1,
        n * discSide,
        'plate',
        rail,
      );
  // an inlaid ring of light on the deck
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const r = 8.5;
    turned(v3(r * Math.cos(a), Dc.y + 0.01, r * Math.sin(a)), v3(0.08, 0.01, r * TAN), -k * 45, 'trim', {
      color: BRASS_GLOW,
      noCollide: true,
    });
  }
  // the mast housing: a solid brass block (cuts the ring in two); its roof is the perch
  const PE = S.perch;
  box(-PE.half, Dc.y, -PE.half, PE.half, PE.y, PE.half, 'panel', { color: BRASS_DARK });
  box(-0.6, PE.y, -0.6, 0.6, 24, 0.6, 'pillar', { color: BRASS_DARK });
  b.boxes.push(wedgeRamp('z', 10.5, PE.half, Dc.y, PE.y, 0, 2, { mat: 'plate', ...disc }));
  // perch parapets (half cover): north, east, west; the ramp comes up on the south
  box(-PE.half, PE.y, -PE.half, PE.half, PE.y + 1, -PE.half + 0.3, 'plate', rail);
  both(PE.half - 0.3, PE.y, -PE.half + 0.3, PE.half, PE.y + 1, PE.half, 'plate', rail);
  // the anemometer: four arms with cups, and a wind vane on top
  const arm = { color: BRASS_DARK, noCollide: true };
  both(0.6, 21.3, -0.15, 6, 21.7, 0.15, 'pillar', arm);
  for (const n of SIGNS) box(-0.15, 21.3, n * 0.6, 0.15, 21.7, n * 6, 'pillar', arm);
  const cup = { color: BRASS, noCollide: true };
  both(6, 20.7, -0.8, 7.6, 22.3, 0.8, 'plate', cup);
  for (const n of SIGNS) box(-0.8, 20.7, n * 6, 0.8, 22.3, n * 7.6, 'plate', cup);
  box(-0.15, 24, -2.5, 0.15, 24.3, 2.5, 'plate', cup);
  box(-0.05, 24.3, 1.2, 0.05, 25.6, 2.5, 'plate', cup);
  box(-0.3, 24.3, -0.3, 0.3, 24.6, 0.3, 'glow', { color: STORM, noCollide: true });

  // =============================== catwalks rim → Anemometer ===============================
  const CW = S.catwalk;
  const cwY = (x: number) => (S.rimX - x) * 0.25;
  for (const s of SIGNS)
    b.ramp('x', s * CW.x0, s * CW.x1, cwY(CW.x0), 0, 0, CW.width, { mat: 'grate', color: GRATE });
  for (const z of [-(CW.width / 2 - 0.06), CW.width / 2 - 0.06]) {
    for (const h of [0.55, 1.45, 2.35, 3])
      beams(v3(CW.x0, cwY(CW.x0) + h, z), v3(CW.x1, h, z), 0.1, 0.1, 'plate', rail);
    for (const x of [18, 24, 30])
      both(x - 0.05, cwY(x - 0.05) + 0.02, z - 0.05, x + 0.05, cwY(x) + 3.05, z + 0.05, 'plate', rail);
  }

  // =============================== shards ===============================
  /** a floating rock; `crystal`: a glowing crystal on its west (-1) or east (+1) face */
  const shard = (x0: number, z0: number, x1: number, z1: number, top: number, crystal = 0) => {
    box(x0, top - 0.6, z0, x1, top, z1, 'rock', { color: SHARD_TOP });
    box(x0 + 0.4, top - 2.6, z0 + 0.4, x1 - 0.4, top - 0.6, z1 - 0.4, 'rock', { color: SHARD_ROCK });
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    box(cx - 0.6, top - 5.5, cz - 0.6, cx + 0.6, top - 2.6, cz + 0.6, 'rock', { color: ROCK_DEEP });
    if (crystal) {
      const fx = crystal < 0 ? x0 + 0.4 : x1 - 0.4;
      box(fx, top - 2.2, cz - 0.3, fx + crystal * 0.6, top - 1.4, cz + 0.3, 'glow', {
        color: STORM,
        noCollide: true,
      });
    }
  };
  for (const s of SIGNS)
    for (const n of SIGNS)
      S.shards.forEach(([x0, z0, x1, z1, top], i) =>
        shard(
          Math.min(s * x0, s * x1),
          Math.min(n * z0, n * z1),
          Math.max(s * x0, s * x1),
          Math.max(n * z0, n * z1),
          top,
          i % 2 === 1 ? -s : 0,
        ),
      );
  for (const s of SIGNS)
    for (const [x0, z0, x1, z1, top] of S.dropShards)
      shard(Math.min(s * x0, s * x1), z0, Math.max(s * x0, s * x1), z1, top);

  // =============================== Towers, spawns, Controller homes ===============================
  const towers: TowerDef[] = [];
  const spawns: SpawnDef[] = [];
  const homes: Vec3[] = [];
  for (const team of [0, 1] as const) {
    const s: Sign = team === 0 ? -1 : 1;
    const tp = S.towers[team];
    const tc = team === 0 ? CYAN : ORANGE;
    b.block(v3(tp.x, 2, tp.z), v3(2, 4, 2), { mat: team === 0 ? 'teamA' : 'teamB', trim: tc });
    towers.push({ team, pos: tp, radius: 1.5, height: 4 });
    homes.push(v3(s * 61.5, 0.9, 0));
    for (const [group, list] of Object.entries(S.spawnGroups))
      for (const p of list)
        spawns.push({ pos: v3(s * p.x, p.y, p.z), yawDeg: team === 0 ? -90 : 90, team, group });
  }

  // =============================== launch pads ===============================
  const launchPads: LaunchPadDef[] = [];
  for (const s of SIGNS)
    for (const n of SIGNS) {
      const xs = [s * S.pad.x0, s * S.pad.x1];
      const zs = [n * S.pad.z0, n * S.pad.z1];
      box(xs[0], 0, zs[0], xs[1], S.pad.y, zs[1], 'panel', { color: BRASS_DARK });
      launchPads.push({
        min: v3(Math.min(...xs), S.pad.y, Math.min(...zs)),
        max: v3(Math.max(...xs), S.pad.y + 2.5, Math.max(...zs)),
        vel: v3(s * S.padVel.x, S.padVel.y, n * S.padVel.z),
      });
    }

  // =============================== zip-rails ===============================
  const rails: RailDef[] = [];
  for (const s of SIGNS)
    for (const n of SIGNS) rails.push({ points: S.rail.map((p) => v3(s * p.x, p.y, n * p.z)) });

  decorate(box, both, beams, blob, blobs, light, lights2, launchPads, rails);

  // (trigonometry leaves ±1e-16 where the plan has 0: snap it, so mirror twins match exactly)
  const snap = (p: Vec3) =>
    v3(...([p.x, p.y, p.z].map((u) => (Math.abs(u) < 1e-9 ? 0 : u)) as [number, number, number]));
  for (const bx of b.boxes) {
    bx.c = snap(bx.c);
    bx.h = snap(bx.h);
  }

  return b.build({
    name: 'Stormglass',
    boundsMin: v3(-75, -30, -55),
    boundsMax: v3(75, 30, 55),
    defaultGravity: v3(0, -1, 0),
    zones: [],
    rails,
    pads: [],
    spawns,
    towers,
    controllerHomes: homes,
    waypoints: waypoints(),
    areas: [
      { name: 'Cyan keep', pos: v3(-64, 0, 5), yawDeg: -90 },
      { name: 'Orange keep', pos: v3(64, 0, 5), yawDeg: 90 },
      { name: 'Orange dome gallery', pos: v3(55, S.floors.upper, -32), yawDeg: 90 },
      { name: 'Orange hatch', pos: v3(64, S.floors.under, 19), yawDeg: 90 },
      { name: 'Orange gate bay', pos: v3(41, 0, 0), yawDeg: 90 },
      { name: 'Orange cistern', pos: v3(45, S.floors.under, 0), yawDeg: 90 },
      { name: 'Glass Bridge', pos: v3(22, 0, -32), yawDeg: 90 },
      { name: 'Cable Duct', pos: v3(20, S.floors.under, -32), yawDeg: 90 },
      { name: 'The Lens (A)', pos: v3(0, 0, -36), yawDeg: 180 },
      { name: 'Broken Span', pos: v3(22, 0, 32), yawDeg: 90 },
      { name: 'Pipe Gallery', pos: v3(22, S.floors.under, 32), yawDeg: 90 },
      { name: 'The Sag (B)', pos: v3(0, S.sag.y, 39), yawDeg: 180 },
      { name: 'The Anemometer', pos: v3(6, S.disc.y, -3), yawDeg: 90 },
      { name: 'The perch', pos: v3(0, S.perch.y, 1), yawDeg: 0 },
    ],
    fog: { color: HORIZON, near: 70, far: 280 },
    ambient: 0.9,
    sideTint: { neg: 0x1d6a80, pos: 0x86501f, amount: 0.1 },
    lights,
    bombSites: [
      { name: 'A', ...S.bombSites.A },
      { name: 'B', ...S.bombSites.B },
    ],
    powerups: S.powerups,
    launchPads,
    killVolumes: [{ min: v3(-120, -90, -100), max: v3(120, S.killY, 100) }],
    outdoor: {
      top: 0x221a4a,
      horizon: HORIZON,
      ground: 0x5b4880,
      sun: { dir: v3(0.8, 0.07, -0.6), color: 0xfff1e6, sizeDeg: 3.2 },
      sunLight: 0xffdcc8,
      stars: true,
    },
  });
};

/**
 * Markings, lamps, team colours, antenna masts, the cloud sea with its lightning and the far
 * storm (nothing here collides).
 */
const decorate = (
  box: BoxFn,
  both: BoxFn,
  beams: BeamFn,
  blob: OctFn,
  blobs: OctFn,
  light: LightFn,
  lights2: LightFn,
  pads: LaunchPadDef[],
  rails: RailDef[],
): void => {
  const S = STORMGLASS;
  const F = S.floors;
  const deco = { noCollide: true };
  for (const p of pads) {
    const y = p.min.y;
    box(p.min.x + 0.1, y + 0.01, p.min.z + 0.1, p.max.x - 0.1, y + 0.08, p.max.z - 0.1, 'trim', {
      color: PAD,
      ...deco,
    });
    light((p.min.x + p.max.x) / 2, y + 1, (p.min.z + p.max.z) / 2, PAD, 5, 0.8);
  }
  // bomb sites: red outlines on their floors
  for (const st of [S.bombSites.A, S.bombSites.B]) {
    const y0 = st.min.y + 0.01;
    const y1 = st.min.y + 0.05;
    const w = 0.12;
    const t = { color: SITE, ...deco };
    box(st.min.x, y0, st.min.z, st.max.x, y1, st.min.z + w, 'trim', t);
    box(st.min.x, y0, st.max.z - w, st.max.x, y1, st.max.z, 'trim', t);
    box(st.min.x, y0, st.min.z + w, st.min.x + w, y1, st.max.z - w, 'trim', t);
    box(st.max.x - w, y0, st.min.z + w, st.max.x, y1, st.max.z - w, 'trim', t);
  }
  // team colours: a strip round the courtyard's back wall and over the gate bay; spawn lights
  for (const team of [0, 1] as const) {
    const s = team === 0 ? -1 : 1;
    const tc = team === 0 ? CYAN : ORANGE;
    box(s * 69.94, 5, -8, s * 70, 5.3, 8, 'trim', { color: tc, ...deco });
    box(s * 44.94, 2.6, -1.4, s * 45, 3.6, 1.4, 'trim', { color: tc, ...deco });
    light(s * 64, 4.5, 0, tc, 15, 0.9);
    light(s * 55, F.upper + 2.6, -33, tc, 9, 0.6);
    light(s * 63, F.under + 2.4, 19.5, tc, 9, 0.6);
  }
  // interior lamps: the deck rooms, the instrument floor, the undercroft
  for (const n of [1, -1] as const) {
    lights2(41.5, 3.2, n * 33, LAMP, 9, 0.7); // bridgehead / spanhead
    lights2(53.5, 3.2, n * 33, LAMP, 10, 0.7); // halls
    lights2(52.5, 3.2, n * 17, LAMP, 8, 0.6); // corridors
    lights2(59.5, 3.2, n * 16, LAMP, 7, 0.6); // keep passages
    lights2(52.5, F.upper + 2.8, n * 17, LAMP, 8, 0.5);
    lights2(42, F.under + 2.4, n * 33, BRASS_GLOW, 9, 0.7); // vaults
    lights2(41.5, F.under + 2.4, n * 18, BRASS_GLOW, 7, 0.6); // tunnels
    lights2(22, F.under + 2, n * 32, STORM, 10, 0.7); // duct, gallery
  }
  lights2(53.5, F.upper + 2.8, 33, LAMP, 10, 0.6); // radio room
  lights2(51, 3.2, 0, LAMP, 10, 0.7); // front hall
  lights2(51, F.upper + 2.8, 0, LAMP, 10, 0.6); // instrument deck
  lights2(41, 3.2, 0, LAMP, 8, 0.6); // gate bay
  lights2(44.5, F.under + 2.4, 0, BRASS_GLOW, 10, 0.7); // cistern
  lights2(63, F.under + 2.4, 0, BRASS_GLOW, 10, 0.6); // keep cellar
  lights2(54.5, F.under + 2.2, -28.5, BRASS_GLOW, 7, 0.6);
  lights2(51, F.under + 2.2, 20.5, BRASS_GLOW, 7, 0.6);
  lights2(4, F.under + 2.2, -32, STORM, 9, 0.7); // the crypt
  light(0, 4.5, -36, LAMP, 13, 0.9); // the Lens
  light(0, S.sag.y + 3, 39, LAMP, 13, 0.9); // the Sag
  light(0, 2.5, 32, LAMP, 10, 0.6);
  lights2(26, 3.2, 32, LAMP, 9, 0.6);
  lights2(22, 1.2, -32, 0xbcd8ff, 9, 0.45);
  light(0, S.disc.y + 2.2, 0, LAMP, 14, 0.9);
  light(0, S.perch.y + 1.5, 0, LAMP, 7, 0.5);
  light(0, 24.5, 0, STORM, 9, 0.8);
  light(0, S.disc.y - 2, 0, BRASS_GLOW, 12, 0.7);
  // the zip-rails' pulleys at their Anemometer ends
  for (const r of rails) {
    const e = r.points[r.points.length - 1];
    box(e.x - 0.15, e.y + 0.1, e.z - 0.15, e.x + 0.15, e.y + 0.4, e.z + 0.15, 'trim', {
      color: BRASS_GLOW,
      ...deco,
    });
  }
  // wind-bent antenna masts on the keep's back corners (leaning north / south, away)
  for (const n of [1, -1] as const) {
    const z = n * 21;
    const mast = { color: BRASS_DARK, ...deco };
    beams(v3(68, 5, z), v3(68, 14, z + n * 0.6), 0.35, 0.35, 'pillar', mast);
    beams(v3(68, 14, z + n * 0.6), v3(68, 19, z + n * 2), 0.28, 0.28, 'pillar', mast);
    beams(v3(68, 19, z + n * 2), v3(68, 22.5, z + n * 3.8), 0.2, 0.2, 'pillar', mast);
    const tip = z + n * 4;
    both(67.8, 22.7, tip - 0.2, 68.2, 23.1, tip + 0.2, 'glow', { color: 0xff5a6a, ...deco });
    lights2(68, 22.9, tip, 0xff5a6a, 5, 0.5);
  }

  // ---------------- the cloud sea far below, lit by lightning ----------------
  const CY = S.cloudY;
  box(-400, CY - 8, -400, 400, CY, 400, 'cloud', {
    color: CLOUD,
    noCollide: true,
    lowDetail: true,
  });
  /** a puff heaped on the sea: three stacked blobs (east and west) */
  const puff = (x: number, z: number, w: number, turn: number, color = CLOUD) => {
    let y = CY;
    for (const [k, hk] of [
      [1, 0.14],
      [0.66, 0.14],
      [0.36, 0.12],
    ]) {
      const h = w * hk;
      const look = { color, noCollide: true, lowDetail: true };
      if (x === 0) blob(0, y, y + h, z, (w * k) / 2, 'cloud', look, turn);
      else blobs(x, y, y + h, z, (w * k) / 2, 'cloud', look, turn);
      y += h;
    }
  };
  /** a lightning-lit patch on the sea's top: a dim wide glow with a bright heart */
  const flash = (x: number, z: number, r: number) => {
    const oct = x === 0 ? blob : blobs;
    oct(x, CY, CY + 0.3, z, r, 'glow', { color: 0xb4a2e4, noCollide: true, lowDetail: true });
    oct(x, CY + 0.3, CY + 0.6, z, r * 0.45, 'glow', {
      color: 0xd6caff,
      noCollide: true,
      lowDetail: true,
    });
  };
  puff(30, -30, 26, 10);
  puff(58, 22, 30, 25);
  puff(14, 44, 20, 5, CLOUD_DEEP);
  puff(95, -40, 44, 15);
  puff(120, 60, 50, 30, CLOUD_DEEP);
  puff(0, -70, 40, 0, CLOUD_DEEP);
  puff(0, 90, 46, 22.5);
  flash(22, 8, 7);
  flash(0, -14, 9);
  // lightning bolts crawling down into the clouds (zigzags of glow): one past the duct's
  // windows, one past the gallery's
  const bolt = (pts: [number, number, number][]) => {
    for (let i = 1; i < pts.length; i++)
      beams(v3(...pts[i - 1]), v3(...pts[i]), 0.35, 0.35, 'glow', {
        color: LIGHTNING,
        noCollide: true,
        lowDetail: true,
      });
  };
  bolt([
    [22, -12, -44],
    [25, -18, -42],
    [21, -24, -45],
    [24, -32, -43],
    [21.5, CY + 1, -44],
  ]);
  bolt([
    [26, -12, 46],
    [23, -19, 44],
    [27, -26, 47],
    [24.5, -36, 45],
  ]);
  bolt([
    [62, -6, -60],
    [58, -16, -63],
    [64, -26, -61],
    [60, -40, -66],
  ]);
  lights2(22, -14, -44, STORM, 30, 1.1);
  lights2(25, -14, 46, STORM, 30, 1);
  light(0, -24, -14, STORM, 36, 1);
  lights2(58, -30, 22, STORM, 30, 0.7);

  // ---------------- the far storm: cloud banks on the horizon and drifting rocks ----------------
  const far = (color: number) => ({ color, noCollide: true, lowDetail: true });
  blobs(150, CY, -14, -120, 40, 'cloud', far(CLOUD_DEEP));
  blobs(150, -14, -4, -120, 26, 'cloud', far(CLOUD), 22.5);
  blobs(205, CY, -18, 115, 40, 'cloud', far(CLOUD), 22.5);
  blobs(110, -10, 4, 150, 10, 'rock', far(ROCK));
  blobs(110, 4, 6, 150, 7, 'rock', far(SHARD_TOP));
  blobs(128, 8, 16, -46, 5, 'rock', far(ROCK), 22.5);
  blob(0, CY, -10, -200, 50, 'cloud', far(CLOUD));
  blob(0, -10, 4, -200, 30, 'cloud', far(CLOUD_DEEP), 22.5);
  blob(0, CY, -16, 210, 50, 'cloud', far(CLOUD_DEEP), 22.5);
  blob(0, -30, -12, -96, 12, 'rock', far(ROCK_DEEP));
  blob(0, -12, -10, -96, 9, 'rock', far(SHARD_TOP));
};

/**
 * Bot waypoints, named (tests and tools refer to them by name). Authored for the east half at
 * world coordinates and mirrored west; names end in E / W ('bhNE'), one on the middle line has
 * none ('siteA'). Bots walk every floor: the deck rooms, the instrument floor, the undercroft,
 * the Glass Bridge into the Lens, the Cable Duct into the crypt, the Broken Span and the Pipe
 * Gallery into the Sag, the catwalks up to the Anemometer — never the gap jump, the pads, the
 * rails or the shards.
 */
const waypoints = (): WaypointDef[] => {
  const S = STORMGLASS;
  const U = S.floors.under;
  const F5 = S.floors.upper;
  const wps: WaypointDef[] = [];
  const onMid = new Map<string, boolean>();
  const nameOf = (base: string, s: Sign) => `${base}${onMid.get(base) ? '' : s > 0 ? 'E' : 'W'}`;
  /** a waypoint at `feet` + 1 m (body height) */
  const add = (base: string, x: number, feet: number, z: number) => {
    onMid.set(base, x === 0);
    for (const s of SIGNS) {
      if (x === 0 && s < 0) continue;
      wps.push({ pos: v3(s * x, feet + 1, z), links: [], name: nameOf(base, s) });
    }
  };
  const idx = (name: string) => {
    const i = wps.findIndex((w) => w.name === name);
    if (i < 0) throw new Error(`waypoint ${name} missing`);
    return i;
  };
  const link = (a: string, c: string) => {
    for (const s of SIGNS) {
      const i = idx(nameOf(a, s));
      const j = idx(nameOf(c, s));
      if (i === j) continue;
      if (!wps[i].links.includes(j)) wps[i].links.push(j);
      if (!wps[j].links.includes(i)) wps[j].links.push(i);
    }
  };
  const chain = (...names: string[]) => {
    for (let i = 1; i < names.length; i++) link(names[i - 1], names[i]);
  };
  const cw = (x: number) => (S.rimX - x) * 0.25;

  // ---- the deck: the keep, the front hall, the gate bay ----
  add('tower', 61.5, 0, 0);
  add('door', 57, 0, 5.5);
  add('front', 50.5, 0, 0);
  add('gate', 41, 0, 0);
  // north / south alike (z mirrored)
  for (const [n, k] of [
    ['N', -1],
    ['S', 1],
  ] as const) {
    add(`yard${n}`, 60, 0, k * 7.5);
    add(`pass${n}`, 59.5, 0, k * 15);
    add(`pass${n}2`, 59.5, 0, k * 19.5);
    add(`corr${n}0`, 52.5, 0, k * 23.5);
    add(`corr${n}2`, 52.5, 0, k * 19.5);
    add(`corr${n}1`, 52.5, 0, k * 14);
    add(`corr${n}3`, 52.5, 0, k * 10.5);
    add(`front${n}`, 51.5, 0, k * 6.5);
    add(`gdOut${n}`, 42, 0, k * 4.5);
    add(`gdIn${n}`, 49, 0, k * 4.5);
    add(`padPass${n}`, 48, 0, k * 14);
    add(`padBay${n}`, 42.5, 0, k * 13.5);
    add(`hall${n}`, 52.5, 0, k * 29);
    add(`bh${n}`, 44.5, 0, k * 28);
    add(`bh${n}2`, 40, 0, k * 28.5);
    // the stair up to the instrument floor, the gallery / radio room, the upper corridor
    add(`stairFoot${n}`, 59.5, 0, k * 38.6);
    add(`stairMid${n}`, 54, 2.5, k * 38.75);
    add(`stairTop${n}`, 48, F5, k * 38.5);
    add(`gal${n}`, 53, F5, k * 30);
    add(`uCorr${n}0`, 52.5, F5, k * 23.5);
    add(`uCorr${n}1`, 52.5, F5, k * 10.5);
    // the vault under the bridgehead / spanhead, its stair pit up, the tunnel to the cistern
    add(`vault${n}In`, 38.5, U, k * 30.95);
    add(`vault${n}1`, 41.5, U, k * 28);
    add(`vault${n}2`, 45.5, U, k * 28.5);
    add(`vault${n}3`, 45, U, k * 38.5);
    add(`pitFoot${n}`, 42.25, U, k * 39.3);
    add(`pitMid${n}`, 42.25, -2, k * 34);
    add(`pitTop${n}`, 42.25, 0, k * 28.8);
    add(`tun${n}`, 42.2, U, k * 17);
    add(`cis${n}`, 41.5, U, k * 7);
    add(`cellar${n}`, 62, U, k * 7);
  }
  add('upDeck', 51, F5, 0);
  add('cis', 45, U, 0);
  add('cisLink', 54.5, U, 0);
  add('cellar', 62, U, 0);
  // the north tunnel vault → keep cellar; the south one vault → the hatch → the cellar
  add('tunK1', 60.5, U, -28.5);
  add('tunK2', 60.5, U, -12.5);
  add('hTun1', 45.5, U, 20.5);
  add('hTun2', 53.5, U, 20.5);
  add('hTun3', 53.5, U, 23.5);
  add('hatch', 60, U, 22);
  add('hatchN', 61.5, U, 12.5);

  // ---- the catwalk and the Anemometer ----
  add('cw0', 37.5, 0, 0);
  add('cw1', 30, cw(30), 0);
  add('cw2', 21, cw(21), 0);
  add('cwTop', 13.5, cw(13.5), 0);
  add('d', 9, S.disc.y, 0);
  add('dN', 5.5, S.disc.y, -6.5);
  add('dS', 5.5, S.disc.y, 6.5);
  add('discN', 0, S.disc.y, -8.5);
  add('rampFoot', 0, S.disc.y, 11.3);
  add('perchS', 0, S.perch.y, 2);
  add('perch', 1.8, S.perch.y, -1.2);

  // ---- the Glass Bridge, the Lens (A), its stair pit, the crypt and the Cable Duct ----
  add('gbHead', 38.5, 0, -32);
  add('gb1', 25, 0, -32);
  add('gb2', 15.5, 0, -32);
  add('lens', 9, 0, -32);
  add('siteA', 0, 0, -35);
  add('pitTop', 0, 0, -30.7);
  add('pitMid', 0, -2, -26);
  add('pitFoot', 0, -3.75, -22.5);
  add('cryptFoot', 2.6, U, -22.6);
  add('crypt', 4.5, U, -32);
  add('cryptMid', 0, U, -36);
  add('d0', 10, U, -32);
  // the pipe-bank chicane: a waypoint either side of each bank, in its gap (a bot that reaches
  // one heads straight through the gap to the next)
  add('d1a', 12.6, U, -30.95);
  add('d1b', 18.4, U, -30.95);
  add('d2a', 22.6, U, -33.05);
  add('d2b', 28.4, U, -33.05);
  add('d3a', 31.6, U, -30.95);

  // ---- the Broken Span, the Sag (B), the Pipe Gallery ----
  add('spHead', 38.5, 0, 32);
  add('sp1', 21, 0, 32.2);
  add('spIn', 10, 0, 32);
  add('sagTop', 10, 0, 34.3);
  add('sagRampMid', 10, -2, 39);
  add('sagFoot', 10, S.sag.y, 43.3);
  add('siteB', 0, S.sag.y, 37.5);
  add('pg1a', 12.6, U, 30.95);
  add('pg1b', 18.4, U, 30.95);
  add('pg2a', 22.6, U, 33.05);
  add('pg2b', 28.4, U, 33.05);
  add('pg3a', 31.6, U, 30.95);
  add('sagIn', 9, U, 32);

  // keep, front hall, gate bay, catwalk up to the Anemometer and the perch
  chain('tower', 'door', 'front');
  chain('gate', 'cw0', 'cw1', 'cw2', 'cwTop', 'd');
  chain('d', 'dN', 'discN');
  chain('d', 'dS', 'rampFoot', 'perchS', 'perch');
  for (const n of ['N', 'S']) {
    // courtyard → side passage → corridor → front hall; the pad bay; the hall and bridgehead
    chain('tower', `yard${n}`, `pass${n}`, `pass${n}2`, `corr${n}2`);
    chain(`corr${n}0`, `corr${n}2`, `corr${n}1`, `corr${n}3`, `front${n}`, 'front');
    chain(`corr${n}1`, `padPass${n}`, `padBay${n}`);
    chain('gate', `gdOut${n}`, `gdIn${n}`, 'front');
    link(`gdIn${n}`, `front${n}`);
    chain(`corr${n}0`, `hall${n}`, `bh${n}`, `bh${n}2`);
    // upstairs: the hall stair, the gallery / radio room, the upper corridor, the instrument deck
    chain(`hall${n}`, `stairFoot${n}`, `stairMid${n}`, `stairTop${n}`, `gal${n}`);
    chain(`gal${n}`, `uCorr${n}0`, `uCorr${n}1`, 'upDeck');
    // downstairs: the pit, the vault, the tunnel to the cistern and on to the keep cellar
    chain(`bh${n}2`, `pitTop${n}`, `bh${n}`);
    chain(`pitTop${n}`, `pitMid${n}`, `pitFoot${n}`, `vault${n}3`, `vault${n}2`, `vault${n}1`);
    chain(`vault${n}In`, `vault${n}1`, `tun${n}`, `cis${n}`, 'cis', 'cisLink', 'cellar');
    link('cellar', `cellar${n}`);
  }
  chain('vaultN2', 'tunK1', 'tunK2', 'cellarN');
  chain('vaultS2', 'hTun1', 'hTun2', 'hTun3', 'hatch', 'hatchN', 'cellarS');
  // the Glass Bridge into the Lens; down the pit into the crypt; the Cable Duct back home
  chain('bhN2', 'gbHead', 'gb1', 'gb2', 'lens', 'siteA', 'pitTop', 'pitMid', 'pitFoot');
  chain('pitFoot', 'cryptFoot', 'crypt', 'cryptMid');
  chain('crypt', 'd0', 'd1a', 'd1b', 'd2a', 'd2b', 'd3a', 'vaultNIn');
  // the Broken Span into the Sag and down its ramp; the Pipe Gallery under it
  chain('bhS2', 'spHead', 'sp1', 'spIn', 'sagTop', 'sagRampMid', 'sagFoot', 'siteB');
  chain('vaultSIn', 'pg3a', 'pg2b', 'pg2a', 'pg1b', 'pg1a', 'sagIn', 'siteB');
  return wps;
};
