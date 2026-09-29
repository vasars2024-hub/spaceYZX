// "Stormglass" — a weather station that the storm won: two walled fortress islands hanging in a
// gas giant's upper atmosphere at violet dusk, and between them The Eye, a 72 m open-air void over
// a lightning-lit cloud sea. 150 × 110 m (world x = east, the team axis; world z = south; bastion
// floors y 0). Mirror-symmetric across x = 0 (Cyan, team 0, bastion west; Orange, team 1, east):
// everything is authored for the east half and mirrored. Bomb site A is on the north crossing,
// B on the south one, both on the middle line.
//
//   BASTIONS (|x| 36..71)   floating islands, walled. The KEEP (|x| 55..71, z -24..24) holds the
//        spawn courtyard (|x| 56..70, z -12..12, walls 8 m, open to the sky) with the Tower; three
//        covered exits: the front door (a screen wall inside it) onto the terrace, and a roofed
//        L-shaped corridor north and south out onto the wings. THE RIM TERRACE (|x| 36..55) faces
//        the Eye: a zip-rail to the Anemometer at z ±4, a launch pad on a launch tower (2.6 m,
//        climb it) at z ±(15..18), the catwalk head at z 0 between gate posts, a lookout tower
//        (2.6 m) at z ±(9..12.5) where the hop shards start
//   EDGES      every edge over the void has a guard: a thin stone wall (half cover, 1.1 m) with a
//        brass bar at 1.85 m, or brass handrails (bars at 0.6 and 1.85 m, no cover): out of a
//        jump's reach and nothing to stand on, so nobody strafes, slides or stumbles off. You go
//        over on purpose: climb (hold jump against it) or the jetpack
//   THE EYE (|x| < 36)      no floor: fall and you're gone (a kill volume below y -9; the cloud
//        sea is ~40 m down). Crossings:
//     THE GLASS BRIDGE (north, z -34.5..-29.5, y 0): straight, 5 m wide, a solid glass deck with
//        brass handrails and no cover at all, into THE LENS (bomb site A): a glass octagon
//        (apothem 8) on the middle line at z -32 under two broken dome ribs
//     THE BROKEN SPAN (south, z 29..35, y 0): guard walls, cabinets, a roofed stretch — covered —
//        but it snaps in the middle: a 3.6 m gap at |x| < 1.8, a sprinting jump. Under the gap
//        hangs THE SAG (bomb site B, y -4, |x| < 8, z 28..42): the fallen middle section, reached
//        by a walled ramp down from each side (the walking way across, and the bots' way); fall
//        short of the far lip and you land in it
//     THE ANEMOMETER (centre, y 6): a floating brass octagon (apothem 12) with the mast and its
//        cups, a ramp up to THE PERCH (y 10, the highest ground; the power-up). Reached by a
//        narrow caged catwalk from each rim (bots walk it), the launch pads and the zip-rails
//     SHARDS: floating rocks. A hop chain on each flank (four shards rising 2 → 5 m) from the
//        lookout's top to the Anemometer's railing (climb it), and a drop shard off its north and
//        south edges
import type { Vec3 } from '../../math/vec3';
import { v3 } from '../../math/vec3';
import { qFromAxisAngle, qFromUnitVectors } from '../../math/quat';
import { LevelBuilder } from '../builder';
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
const STONE = 0x6c6484; // parapets
const ROCK = 0x3f3552; // island undersides
const ROCK_DEEP = 0x2e2640;
const SHARD_TOP = 0x74688e;
const SHARD_ROCK = 0x4a3f60;
const BRASS = 0xc89b4a; // rails, frames, cups
const BRASS_DARK = 0x8a6a34; // mast, housings
const BRASS_DECK = 0x86694a; // the span
const SAG_FLOOR = 0x5a4636; // the fallen middle section: scorched, darker than the deck above
const BRASS_DISC = 0x9a7a45; // the Anemometer
const BRASS_GLOW = 0xffc46b; // lamps, inlays
const CRATE = 0x6a5238;
const GRATE = 0x7a6a50;
const GLASS = 0xa9c8ee; // the glass deck and the Lens
const GLASS_EDGE = 0xe3d2ff;
const DOME_GLASS = 0x8fb2dc;
const CLOUD = 0xc9b6e6;
const CLOUD_DEEP = 0xa592cf;
const LIGHTNING = 0xeae0ff;
const STORM = 0xb48cff;
const LAMP = 0xffc98a;
const HORIZON = 0xb27fb8;

/** Key coordinates (the plan). The west half mirrors the east (x → -x). */
export const STORMGLASS = {
  /** the bastions' front edge (x = ±36): the Eye lies between */
  rimX: 36,
  /** the void between the bastions (all heights) */
  eye: { x0: -36, x1: 36, z0: -55, z1: 55 },
  /** below this you are dead (the kill volume's top) */
  killY: -9,
  /** top of the cloud sea far below */
  cloudY: -42,
  /** the east bastion (the west one mirrored) */
  bastion: { x0: 36, x1: 71, z0: -38, z1: 38 },
  keep: { x0: 55, x1: 71, z0: -24, z1: 24 },
  courtyard: { x0: 56, x1: 70, z0: -12, z1: 12 },
  /** keep wall height */
  wallH: 8,
  glassBridge: { x0: 8, x1: 36, z0: -34.5, z1: -29.5, y: 0 },
  /** the glass octagon on the middle line (bomb site A) */
  lens: { z: -32, apothem: 8, y: 0 },
  /** the Broken Span's deck (east half): its lip at x 1.8, a 3.6 m gap to the west lip */
  span: { x0: 1.8, x1: 36, z0: 29, z1: 35, y: 0 },
  /** the fallen middle section under the gap (bomb site B) */
  sag: { x0: -8, x1: 8, z0: 28, z1: 42, y: -4 },
  /** the ramp from the span down into the sag (east; along x, 3 m wide) */
  sagRamp: { x0: 8, x1: 16, z0: 35, z1: 38 },
  /** the Anemometer's octagon deck (apothem 12) and the perch over it */
  disc: { y: 6, apothem: 12 },
  perch: { y: 10, half: 3 },
  /** the catwalk rim → disc (east): along z = 0, 1.6 m wide, rising 1 in 4 */
  catwalk: { x0: 12.15, x1: 36, width: 1.6 },
  /** Towers: Cyan's (west) first */
  towers: [v3(-64, 0, 0), v3(64, 0, 0)] as [Vec3, Vec3],
  bombSites: {
    A: { min: v3(-6, 0, -36.5), max: v3(6, 3, -27.5) },
    B: { min: v3(-6, -4, 30.5), max: v3(6, -1, 39.5) },
  },
  /** on the perch, beside the mast */
  powerups: [v3(0, 11.2, 1.9)],
  /**
   * guard walls and handrails along every edge over the void: a thin stone wall (half cover) up
   * to `wall` and a brass bar at `h` — a jump lifts your feet 1.2 m and a capsule rides over a
   * thin edge up to 0.4 m above its feet, so nobody walks, strafes or stumbles over; thin, so
   * there is nothing to stand on (no vaulting up onto it)
   */
  guard: { h: 1.85, wall: 1.1, thick: 0.12 },
  /** the lookouts on the rim the hop chains start from (east, north; mirrored): 2.6 m towers */
  lookout: { x0: 35.5, x1: 39, z0: -12.5, z1: -9, y: 2.6 },
  /**
   * launch pads on the rim (east, south; mirrored): on top of a 2.6 m launch tower — climb it
   * (hold jump against it), which bots never do: they never get thrown by accident
   */
  pad: { x0: 38.5, x1: 41.5, z0: 15, z1: 18, y: 2.6 },
  /** the south-east pad's throw (west: x negated, north: z negated) — onto the Anemometer */
  padVel: v3(-17.9, 20.8, -5.5),
  /** zip-rails rim → Anemometer (east, z = +4; mirrored to z = -4 and west) */
  rail: [v3(37.5, 3.7, 4), v3(13, 10, 4), v3(8, 9.6, 4)] as Vec3[],
  /** the hop chain (east, north; mirrored south and west): [x0, z0, x1, z1, top] */
  shards: [
    [28, -12.5, 32, -9, 2],
    [22, -13.5, 25.5, -10, 3],
    [16.5, -12.5, 20, -9, 4],
    [12.5, -9.5, 15, -6.5, 5],
  ] as [number, number, number, number, number][],
  /** the drop shards off the Anemometer's north / south edge (on the middle line) */
  dropShards: [
    [-2.5, -19.5, 2.5, -16, 3],
    [-2.5, 16, 2.5, 19.5, 3],
  ] as [number, number, number, number, number][],
};

type Sign = 1 | -1;
const SIGNS: Sign[] = [1, -1];
const TAN = Math.tan(Math.PI / 8); // half an octagon's side per unit of apothem
const UP = v3(0, 1, 0);
const X_AXIS = v3(1, 0, 0);

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
    // (a beam is the same both ways: point it east-ish, so it turns less than a quarter turn and
    // its top stays on top)
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
  /**
   * A solid regular octagon (apothem `a`, from y0 to y1) around (cx, cz): four boxes crossing at
   * its middle (every one's corners are the octagon's corners, so together they are exactly it).
   */
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

  // =============================== the bastions ===============================
  const B = S.bastion;
  const H = S.wallH;
  // the flagstone deck (a grate square where the catwalk meets the rim)
  both(B.x0, -1, B.z0, B.x0 + 0.5, 0, -0.8, 'plate', { color: SLATE_FLOOR });
  both(B.x0, -1, 0.8, B.x0 + 0.5, 0, B.z1, 'plate', { color: SLATE_FLOOR });
  both(B.x0, -1, -0.8, B.x0 + 0.5, 0, 0.8, 'grate', { color: GRATE });
  both(B.x0 + 0.5, -1, B.z0, B.x1, 0, B.z1, 'plate', { color: SLATE_FLOOR });
  // the island's rock underside, tapering into a spike
  both(B.x0 + 0.5, -5, B.z0 + 0.5, B.x1 - 0.5, -1, B.z1 - 0.5, 'rock', { color: ROCK });
  both(B.x0 + 3, -11, B.z0 + 4, B.x1 - 3, -5, B.z1 - 4, 'rock', { color: ROCK });
  both(B.x0 + 8, -18, B.z0 + 11, B.x1 - 7, -11, B.z1 - 11, 'rock', { color: ROCK_DEEP });
  both(B.x0 + 14, -28, -12, B.x1 - 11, -18, 12, 'rock', { color: ROCK_DEEP });
  both(53, -36, -4, 57, -28, 4, 'rock', { color: ROCK_DEEP });

  // ---- the keep: walls around the courtyard and the two corridors ----
  const wall = { color: SLATE };
  // (authored for the north half, z ≤ 0; the south half mirrors it)
  quad(55, 0, -24, 61, H, -23, 'panel', wall); // north end of the front face
  quad(55, 0, -20, 56, H, -2, 'panel', wall); // front wall
  quad(55, 3.4, -23, 61, H, -20, 'panel', wall); // over the corridor's outer leg
  quad(58, 3.4, -20, 61, H, -12, 'panel', wall); // over the corridor's inner leg
  quad(56, 0, -20, 58, H, -12, 'panel', wall);
  quad(61, 0, -24, 71, H, -12, 'panel', wall); // the mass beside the corridor
  both(55, 3.2, -2, 56, H, 2, 'panel', wall); // over the front door
  both(70, 0, -12, 71, H, 12, 'panel', wall); // back wall
  // a screen inside the front door: no line from the terrace to the spawns
  both(58, 0, -6.5, 58.6, 3.4, 6.5, 'panel', { color: SLATE_DARK });
  // merlons on the courtyard walls
  for (const z of [-10.5, -6.5, 6.5, 10.5]) both(55, H, z - 0.8, 56, H + 1, z + 0.8, 'panel', wall);
  for (const z of [-9, -3, 3, 9]) both(70, H, z - 0.8, 71, H + 1, z + 0.8, 'panel', wall);
  for (const x of [58, 63, 67.5]) quad(x - 0.8, H, -13, x + 0.8, H + 1, -12, 'panel', wall);
  // brass caps on the front wall tops
  quad(55, H, -24, 55.5, H + 0.12, -12, 'plate', { color: BRASS_DARK });

  // ---- observatory halls at the back corners (solid; glass domes on top) ----
  quad(62, 0, -38, 71, 9, -24, 'panel', { color: SLATE_DARK });
  const dome = { color: DOME_GLASS, trim: BRASS };
  quad(63, 9, -36.5, 70, 11, -25.5, 'skyglass', dome);
  quad(64.5, 11, -35, 68.5, 12.6, -27, 'skyglass', dome);
  quad(65.8, 12.6, -32.2, 67.2, 13.6, -29.8, 'skyglass', dome);

  // ---- guard walls along every edge over the void: a thin stone wall (half cover, nothing to
  // stand on: no vaulting up onto it) with a brass bar above it, out of a jump's reach (you
  // climb or fly over on purpose, you never stumble or strafe over) ----
  const para = { color: STONE };
  const rail = { color: BRASS };
  const GT = S.guard.thick;
  const RH = S.guard.h;
  const GW = S.guard.wall;
  /**
   * bars of a handrail (knee, top): nothing fits under or between them (a crouching body is
   * 1.1 m tall), nothing jumps over
   */
  const BAR_ROWS: [number, number][] = [
    [0.55, 0.65],
    [RH - 0.12, RH],
  ];
  /** a guard wall from (x0, z0) to (x1, z1) standing at y; `place`: both (mirrored) or box */
  const guardAt = (place: BoxFn, x0: number, z0: number, x1: number, z1: number, y = 0) => {
    place(x0, y, z0, x1, y + GW, z1, 'rock', para);
    place(x0, y + RH - 0.12, z0, x1, y + RH, z1, 'plate', rail);
    // posts carrying the bar
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
  const R0 = B.x0;
  // the rim: open for the bridges and the catwalk (between two gate posts); the lookouts stand
  // in it
  const LK = S.lookout;
  const gate = S.catwalk.width / 2;
  for (const [z0, z1] of [
    [-38, -34.5],
    [-29.5, LK.z0],
    [LK.z1, -gate - 0.6],
    [gate + 0.6, -LK.z1],
    [-LK.z0, 29],
    [35, 38],
  ])
    guard(R0, z0, R0 + GT, z1);
  // the north and south edges of the wings
  guard(R0 + GT, -38, 62, -38 + GT);
  guard(R0 + GT, 38 - GT, 62, 38);
  // the lookouts: brass instrument towers on the rim, too tall to vault (climb them: hold jump
  // against the wall); the hop chains start from their tops
  quad(LK.x0, 0, LK.z0, LK.x1, LK.y, LK.z1, 'panel', { color: BRASS_DARK });
  quad(LK.x0, LK.y, LK.z0, LK.x0 + 0.3, LK.y + 0.06, LK.z1, 'trim', {
    color: BRASS_GLOW,
    noCollide: true,
  });
  // gate posts where the catwalks leave the rim and reach the Anemometer (with lamps)
  const gatePost = (x0: number, x1: number, y: number) => {
    quad(x0, y, -gate - 0.6, x1, y + 3.6, -gate, 'pillar', { color: BRASS_DARK });
    quad(x0 - 0.05, y + 3.6, -gate - 0.65, x1 + 0.05, y + 3.9, -gate, 'glow', {
      color: BRASS_GLOW,
      noCollide: true,
    });
  };
  gatePost(R0 - 0.3, R0 + 0.3, 0);
  gatePost(S.disc.apothem - 0.3, S.disc.apothem + 0.3, S.disc.y);
  // lamp posts beside the bridgeheads
  for (const [z0, z1] of [
    [-35, -34.7],
    [-29.3, -29],
    [28.7, 29],
    [35, 35.3],
  ]) {
    both(R0 + GT, 0, z0, R0 + GT + 0.3, 2.6, z1, 'pillar', { color: BRASS_DARK });
    both(R0 + GT - 0.05, 2.6, z0 - 0.05, R0 + GT + 0.35, 2.95, z1 + 0.05, 'glow', {
      color: BRASS_GLOW,
      noCollide: true,
    });
  }

  // ---- terrace and wing cover ----
  const cab = { color: BRASS_DARK };
  // instrument cabinets (full cover) and crates (half cover)
  quad(43, 0, -17.5, 45, 2.4, -15.5, 'panel', cab);
  quad(48.5, 0, -6, 50, 1.1, -4, 'crate', { color: CRATE });
  quad(42, 0, -24.5, 44.5, 1.1, -23, 'crate', { color: CRATE });
  // wings: a broken dome column (full) and a low wall (half)
  quad(47, 0, -31.5, 49, 2.6, -29.5, 'rock', { color: STONE });
  quad(52.5, 0, -35, 55, 1.1, -34, 'rock', { color: STONE });

  // ---- zip-rail gantries (the rail hangs between the posts) ----
  quad(37.8, 0, -3, 38.2, 3.9, -2.6, 'pillar', { color: BRASS_DARK });
  quad(37.8, 0, -5.4, 38.2, 3.9, -5, 'pillar', { color: BRASS_DARK });
  quad(37.8, 3.9, -5.4, 38.2, 4.2, -2.6, 'pillar', { color: BRASS_DARK });

  // =============================== the Glass Bridge ===============================
  const G = S.glassBridge;
  both(G.x0, -0.3, G.z0, G.x1, 0, G.z1, 'skyglass', { color: GLASS, trim: GLASS_EDGE });
  // the brass frame under the glass: side beams and cross ribs
  both(G.x0, -0.9, G.z0, G.x1, -0.3, G.z0 + 0.3, 'plate', { color: BRASS_DARK });
  both(G.x0, -0.9, G.z1 - 0.3, G.x1, -0.3, G.z1, 'plate', { color: BRASS_DARK });
  for (let x = 11; x < 36; x += 4)
    both(x - 0.12, -0.6, G.z0 + 0.3, x + 0.12, -0.3, G.z1 - 0.3, 'plate', { color: BRASS_DARK });
  // handrails: three bars on thin posts — no cover (you can't hide behind a bar), they only
  // keep you on
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
  /**
   * Handrails (three bars, posts at the corners) round an octagon of apothem `a` standing at
   * height y, except on the sides in `skip` (k: 0 = east, 2 = south, 4 = west, 6 = north).
   */
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
  handrail(G.x0, G.x1, G.z0, G.z0 + 0.1);
  handrail(G.x0, G.x1, G.z1 - 0.1, G.z1);

  // =============================== the Lens (A) ===============================
  const L = S.lens;
  octagon(0, -0.3, 0, L.z, L.apothem, 'skyglass', { color: GLASS, trim: GLASS_EDGE });
  // brass frame underneath: the hub and a ring under the rim
  octagon(0, -1.2, -0.3, L.z, 2, 'plate', { color: BRASS_DARK });
  const lensSide = L.apothem * TAN; // half the length of a side
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const r = L.apothem - 0.25;
    turned(
      v3(r * Math.cos(a), -0.6, L.z + r * Math.sin(a)),
      v3(0.25, 0.3, lensSide),
      -k * 45,
      'plate',
      { color: BRASS_DARK },
    );
  }
  // handrails round the rim (the Glass Bridge comes in at the east and west sides)
  octagonRail(0, L.y, L.z, L.apothem, [0, 4]);
  for (const n of SIGNS) {
    const za = L.z + n * lensSide;
    const zb = n < 0 ? G.z0 : G.z1;
    bars(L.apothem - 0.1, L.apothem, Math.min(za, zb), Math.max(za, zb));
  }
  // cover: a telescope housing (full) north with instrument crates (half) either side, benches
  // (half) south; the way through from bridge to bridge stays open
  box(-1.2, 0, -38.4, 1.2, 2.4, -36.6, 'panel', { color: BRASS_DARK });
  both(3, 0, -36.2, 4.4, 1.1, -34.8, 'crate', { color: CRATE });
  both(1.6, 0, -27.4, 3.6, 1, -26.6, 'plate', { color: BRASS_DARK });
  // the telescope's barrel, pointing up out of the housing
  beam(v3(0, 2.4, -37.5), v3(0, 5.2, -40.2), 0.9, 0.9, 'panel', {
    color: BRASS_DARK,
    noCollide: true,
  });
  // broken dome ribs: columns at the four diagonal sides; each rib arches from its north
  // column over the middle and snaps off before its south one (a stump)
  const ribR = 7.2;
  const ribFoot = 3.5;
  for (const s of SIGNS) {
    const foot = (sz: Sign) => v3(-s * sz * ribR * Math.SQRT1_2, 0, L.z + sz * ribR * Math.SQRT1_2);
    for (const sz of SIGNS) {
      const f = foot(sz);
      box(f.x - 0.4, 0, f.z - 0.4, f.x + 0.4, ribFoot, f.z + 0.4, 'pillar', { color: BRASS_DARK });
    }
    // the arc from the north foot (sz = -1) toward the south one, in 8 segments; 3 are gone
    const n0 = foot(-1);
    const s0 = foot(1);
    const at = (phi: number) => {
      const t = (1 - Math.cos(phi)) / 2;
      return v3(n0.x + (s0.x - n0.x) * t, ribFoot + ribR * Math.sin(phi), n0.z + (s0.z - n0.z) * t);
    };
    for (let k = 0; k < 5; k++)
      beam(at((k * Math.PI) / 8), at(((k + 1) * Math.PI) / 8), 0.6, 0.6, 'pillar', {
        color: BRASS_DARK,
        noCollide: true,
      });
  }

  // =============================== the Broken Span ===============================
  const P = S.span;
  const R = S.sagRamp;
  const deck = { color: BRASS_DECK };
  both(P.x0, -0.5, P.z0, P.x1, 0, P.z1, 'plate', deck);
  // girders under the deck's edges
  both(P.x0, -1.4, P.z0, P.x1, -0.5, P.z0 + 0.3, 'plate', { color: BRASS_DARK });
  both(P.x0, -1.4, P.z1 - 0.3, P.x1, -0.5, P.z1, 'plate', { color: BRASS_DARK });
  // guard walls (half cover); the south one opens where the ramp to the sag leaves
  guard(P.x0, P.z0, P.x1, P.z0 + GT);
  guard(P.x0, P.z1 - GT, R.x1, P.z1);
  guard(19.5, P.z1 - GT, P.x1, P.z1);
  // cover on the deck
  both(24, 0, P.z0 + GT, 26, 2.4, 31.2, 'panel', cab); // full
  both(29.5, 0, 33.2, 31.5, 1.1, P.z1 - GT, 'crate', { color: CRATE }); // half
  both(10, 0, 33.2, 12, 2.4, P.z1 - GT, 'panel', cab); // full
  both(5, 0, P.z0 + GT, 6.5, 1.1, 30.6, 'crate', { color: CRATE }); // half, by the lip
  // the roofed stretch (bastion side): a brass canopy on posts standing on the guard walls
  for (const x of [20, 32.6])
    for (const [z0, z1] of [
      [P.z0, P.z0 + GT],
      [P.z1 - GT, P.z1],
    ])
      both(x, RH, z0, x + 0.4, 3.6, z1, 'pillar', { color: BRASS_DARK });
  both(19.6, 3.6, P.z0 - 0.3, 33.4, 3.9, P.z1 + 0.3, 'panel', { color: BRASS_DARK });
  // the landing where the ramp leaves the deck, with its guard walls
  both(R.x1, -0.5, R.z0, 19.5, 0, R.z1, 'plate', deck);
  guard(R.x1, R.z1 - GT, 19.5, R.z1);
  guard(19.5 - GT, R.z0, 19.5, R.z1 - GT);
  // the ramp down into the sag (26.6°) between two stone walls (full cover: a jump down a
  // slope carries you higher above it than on the flat, so the walls stand tall)
  const rampMid = (R.z0 + R.z1) / 2;
  for (const s of SIGNS)
    b.ramp('x', s * R.x0, s * R.x1, S.sag.y, 0, rampMid, R.z1 - R.z0 - 2 * GT, {
      mat: 'plate',
      ...deck,
    });
  both(R.x0, S.sag.y - 0.6, R.z0, R.x1, 2.5, R.z0 + GT, 'rock', para);
  both(R.x0, S.sag.y - 0.6, R.z1 - GT, R.x1, 2.5, R.z1, 'rock', para);
  // snapped girders at the lip, bent down into the gap (decoration)
  beams(v3(P.x0 + 0.15, -1.4, P.z1 - 1.4), v3(0.9, -2.9, P.z1 - 1.1), 0.35, 0.35, 'plate', {
    color: BRASS_DARK,
    noCollide: true,
  });
  // the lip: a glowing strip along the broken end, so you see where to jump
  both(P.x0 - 0.05, -0.5, P.z0 + GT, P.x0, 0, P.z1 - GT, 'trim', {
    color: BRASS_GLOW,
    noCollide: true,
  });

  // =============================== the Sag (B) ===============================
  const SG = S.sag;
  box(SG.x0, SG.y - 0.5, SG.z0, SG.x1, SG.y, SG.z1, 'plate', { color: SAG_FLOOR });
  const sagGuard = (x0: number, z0: number, x1: number, z1: number) =>
    guardAt(box, x0, z0, x1, z1, SG.y);
  sagGuard(SG.x0, SG.z0, SG.x1, SG.z0 + GT);
  sagGuard(SG.x0, SG.z1 - GT, SG.x1, SG.z1);
  for (const s of SIGNS) {
    sagGuard(s * (SG.x1 - GT), SG.z0 + GT, s * SG.x1, R.z0);
    sagGuard(s * (SG.x1 - GT), R.z1, s * SG.x1, SG.z1 - GT);
  }
  // cover: a fallen gear housing (half) in the middle, broken cabinets (full) in the corners,
  // crates (half) under the lips
  box(-1.6, SG.y, 37, 1.6, SG.y + 1.1, 38.2, 'panel', { color: BRASS_DARK });
  both(4, SG.y, 39.6, 5.5, SG.y + 2.4, SG.z1 - 0.4, 'panel', cab);
  both(4, SG.y, 30.8, 5.2, SG.y + 1.1, 31.8, 'crate', { color: CRATE });

  // =============================== the Anemometer ===============================
  const D = S.disc;
  const disc = { color: BRASS_DISC };
  octagon(0, D.y - 0.6, D.y, 0, D.apothem, 'plate', disc);
  // the keel underneath, tapering into a spike
  octagon(0, D.y - 1.6, D.y - 0.6, 0, 8, 'plate', { color: BRASS_DARK }, 22.5);
  octagon(0, D.y - 3.6, D.y - 1.6, 0, 5, 'plate', { color: BRASS_DARK });
  octagon(0, -2, D.y - 3.6, 0, 2.5, 'plate', { color: BRASS_DARK }, 22.5);
  box(-0.6, -9, -0.6, 0.6, -2, 0.6, 'pillar', { color: BRASS_DARK });
  // handrails round the edge, open only where the catwalks come up (east, west); the hop
  // shards and the drop shards are over the rail (a climb, or the jetpack)
  octagonRail(0, D.y, 0, D.apothem, [0, 4]);
  const discSide = D.apothem * TAN;
  for (const n of SIGNS)
    for (const [y0, y1] of BAR_ROWS)
      both(
        D.apothem - 0.11,
        D.y + y0,
        n * (S.catwalk.width / 2 + 0.6),
        D.apothem - 0.01,
        D.y + y1,
        n * discSide,
        'plate',
        rail,
      );
  // an inlaid ring of light on the deck
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const r = 8.5;
    turned(
      v3(r * Math.cos(a), D.y + 0.01, r * Math.sin(a)),
      v3(0.08, 0.01, r * TAN),
      -k * 45,
      'trim',
      {
        color: BRASS_GLOW,
        noCollide: true,
      },
    );
  }
  // the mast, the perch round it, the ramp up
  const PE = S.perch;
  box(-0.6, D.y, -0.6, 0.6, PE.y - 0.4, 0.6, 'pillar', { color: BRASS_DARK });
  box(-PE.half, PE.y - 0.4, -PE.half, PE.half, PE.y, PE.half, 'plate', disc);
  box(-0.6, PE.y, -0.6, 0.6, 24, 0.6, 'pillar', { color: BRASS_DARK });
  b.ramp('z', PE.half, 10.5, PE.y, D.y, 0, 2, { mat: 'plate', ...disc });
  fillUnder(b, 'z', PE.half, 10.5, PE.y, D.y, 0, 2, BRASS_DISC);
  // brackets under the perch (decoration)
  for (const s of SIGNS)
    beam(v3(s * 0.6, D.y + 1.2, 0), v3(s * 2.6, PE.y - 0.58, 0), 0.3, 0.3, 'pillar', {
      color: BRASS_DARK,
      noCollide: true,
    });
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
  // lamps hanging under the deck's corners
  for (let k = 0; k < 8; k++) {
    const a = ((k + 0.5) * Math.PI) / 4;
    const x = 10.5 * Math.cos(a);
    const z = 10.5 * Math.sin(a);
    box(x - 0.25, D.y - 1.1, z - 0.25, x + 0.25, D.y - 0.6, z + 0.25, 'glow', {
      color: BRASS_GLOW,
      noCollide: true,
    });
  }

  // =============================== catwalks rim → Anemometer ===============================
  const C = S.catwalk;
  const cwY = (x: number) => (S.rimX - x) * 0.25;
  for (const s of SIGNS) {
    b.ramp('x', s * C.x0, s * C.x1, cwY(C.x0), 0, 0, C.width, { mat: 'grate', color: GRATE });
  }
  // the railing: four brass bars a side on posts, up to 3 m over the walkway (a jump down the
  // slope carries you higher above it than on the flat); nothing fits between the bars
  for (const z of [-(C.width / 2 - 0.06), C.width / 2 - 0.06]) {
    for (const h of [0.55, 1.45, 2.35, 3])
      beams(v3(C.x0, cwY(C.x0) + h, z), v3(C.x1, h, z), 0.1, 0.1, 'plate', rail);
    for (const x of [18, 24, 30])
      both(
        x - 0.05,
        cwY(x - 0.05) + 0.02,
        z - 0.05,
        x + 0.05,
        cwY(x) + 3.05,
        z + 0.05,
        'plate',
        rail,
      );
  }

  // =============================== shards ===============================
  /** a floating rock; `crystal`: a glowing crystal on its west (-1) or east (+1) face */
  const shard = (x0: number, z0: number, x1: number, z1: number, top: number, crystal = 0) => {
    box(x0, top - 0.6, z0, x1, top, z1, 'rock', { color: SHARD_TOP });
    box(x0 + 0.4, top - 2.6, z0 + 0.4, x1 - 0.4, top - 0.6, z1 - 0.4, 'rock', {
      color: SHARD_ROCK,
    });
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
  for (const [x0, z0, x1, z1, top] of S.dropShards) shard(x0, z0, x1, z1, top);

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
    for (const x of [60.5, 67.5])
      for (const z of [-9, -5, 5, 9])
        spawns.push({ pos: v3(s * x, 0, z), yawDeg: team === 0 ? -90 : 90, team });
  }

  // =============================== launch pads ===============================
  const launchPads: LaunchPadDef[] = [];
  for (const s of SIGNS)
    for (const n of SIGNS) {
      const xs = [s * S.pad.x0, s * S.pad.x1];
      const zs = [n * S.pad.z0, n * S.pad.z1];
      // (the launch tower: a brass block you climb)
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
      { name: 'Cyan bastion', pos: v3(-62, 0, 0), yawDeg: -90 },
      { name: 'Orange bastion', pos: v3(62, 0, 0), yawDeg: 90 },
      { name: 'Orange rim terrace', pos: v3(46, 0, 0), yawDeg: 90 },
      { name: 'Glass Bridge', pos: v3(22, 0, -32), yawDeg: 90 },
      { name: 'The Lens (A)', pos: v3(0, 0, -30), yawDeg: 180 },
      { name: 'Broken Span', pos: v3(22, 0, 32.2), yawDeg: 90 },
      { name: 'The Sag (B)', pos: v3(0, S.sag.y, 34), yawDeg: 180 },
      { name: 'The Anemometer', pos: v3(6, S.disc.y, -6), yawDeg: 90 },
      { name: 'The perch', pos: v3(0, S.perch.y, 2), yawDeg: 0 },
      { name: 'Hop shards', pos: v3(30.5, 1, -10.75), yawDeg: 90 },
    ],
    fog: { color: HORIZON, near: 70, far: 280 },
    ambient: 0.95,
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
  const deco = { noCollide: true };
  // launch pad plates and their glow
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
  // team colours: a banner over each front door, a strip round the courtyard's back wall,
  // the spawn light
  for (const team of [0, 1] as const) {
    const s = team === 0 ? -1 : 1;
    const tc = team === 0 ? CYAN : ORANGE;
    box(s * 54.94, 3.6, -1.4, s * 55, 7.4, 1.4, 'trim', { color: tc, ...deco });
    box(s * 69.94, 5, -11, s * 70, 5.3, 11, 'trim', { color: tc, ...deco });
    light(s * 63, 4.5, 0, tc, 15, 0.9);
    light(s * 47, 3.5, 0, tc, 9, 0.35);
  }
  // lamps: corridors, terrace, bridgeheads, the Lens, the span, the sag, the Anemometer
  for (const n of [1, -1] as const) lights2(58.5, 2.8, n * 21.5, LAMP, 7, 0.6);
  for (const n of [1, -1] as const) lights2(45, 3.2, n * 16.5, LAMP, 10, 0.55);
  lights2(38, 2.2, -32, LAMP, 8, 0.6);
  lights2(38, 2.2, 32, LAMP, 8, 0.6);
  lights2(22, 1.2, -32, 0xbcd8ff, 9, 0.45);
  light(0, 3, S.lens.z, LAMP, 12, 0.8);
  lights2(26, 3.2, 32, LAMP, 9, 0.6);
  light(0, S.sag.y + 2.5, 35, LAMP, 12, 0.8);
  light(0, S.disc.y + 2.2, 0, LAMP, 14, 0.9);
  light(0, S.perch.y + 1.5, 0, LAMP, 7, 0.5);
  light(0, 24.5, 0, STORM, 9, 0.8);
  light(0, S.disc.y - 2, 0, BRASS_GLOW, 12, 0.7);
  for (const n of [1, -1] as const) lights2(66.5, 11.5, n * 31, 0xd9c2ff, 9, 0.6);
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
    beams(v3(68, 8, z), v3(68, 14, z + n * 0.6), 0.35, 0.35, 'pillar', mast);
    beams(v3(68, 14, z + n * 0.6), v3(68, 19, z + n * 2), 0.28, 0.28, 'pillar', mast);
    beams(v3(68, 19, z + n * 2), v3(68, 22.5, z + n * 3.8), 0.2, 0.2, 'pillar', mast);
    const zc = z + n * 1.1;
    both(66.4, 16.2, zc - 0.05, 67.8, 16.4, zc + 0.05, 'pillar', { color: BRASS, ...deco });
    both(68.2, 16.2, zc - 0.05, 69.6, 16.4, zc + 0.05, 'pillar', { color: BRASS, ...deco });
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
  // lightning bolts crawling down into the clouds (zigzags of glow)
  const bolt = (pts: [number, number, number][]) => {
    for (let i = 1; i < pts.length; i++)
      beams(v3(...pts[i - 1]), v3(...pts[i]), 0.35, 0.35, 'glow', {
        color: LIGHTNING,
        noCollide: true,
        lowDetail: true,
      });
  };
  bolt([
    [22, -14, 8],
    [25, -20, 10],
    [21, -26, 12],
    [24, -33, 9],
    [21.5, CY + 1, 8],
  ]);
  bolt([
    [62, -6, -60],
    [58, -16, -63],
    [64, -26, -61],
    [60, -40, -66],
  ]);
  lights2(22, -20, 8, STORM, 34, 1.1);
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
 * Solid steps under a ramp (so nobody hides under it): `from` is the high end at `yHigh`,
 * `to` the low end at `yLow`; each step's top stays under the ramp slab.
 */
const fillUnder = (
  b: LevelBuilder,
  axis: 'x' | 'z',
  from: number,
  to: number,
  yHigh: number,
  yLow: number,
  across: number,
  width: number,
  color: number,
  steps = 4,
): void => {
  const run = to - from;
  for (let i = 0; i < steps; i++) {
    const a = from + (run * i) / steps;
    const c = from + (run * (i + 1)) / steps;
    const surf = yHigh + ((yLow - yHigh) * (i + 1)) / steps;
    const top = surf - 0.8;
    if (top <= yLow + 0.1) continue;
    const lo = Math.min(a, c);
    const hi = Math.max(a, c);
    const w0 = across - width / 2;
    const w1 = across + width / 2;
    const opts = { mat: 'plate' as Material, color };
    if (axis === 'z') b.box(v3(w0, yLow, lo), v3(w1, top, hi), opts);
    else b.box(v3(lo, yLow, w0), v3(hi, top, w1), opts);
  }
};

/**
 * Bot waypoints, named (tests and tools refer to them by name). Authored for the east half at
 * world coordinates and mirrored west; names end in E / W ('spHeadE'), one on the middle line has
 * none ('lensN'). Bots walk the catwalks over the Anemometer, the Glass Bridge through the Lens,
 * and the Broken Span down through the Sag — never the jump, the pads, the rails or the shards.
 */
const waypoints = (): WaypointDef[] => {
  const S = STORMGLASS;
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

  // the keep
  add('tower', 61.5, 0, 0);
  for (const [n, z] of [
    ['N', -1],
    ['S', 1],
  ] as const) {
    add(`cy${n}`, 59.3, 0, z * 8.5);
    add(`ch${n}`, 57, 0, z * 7.5);
    add(`door${n}`, 59.5, 0, z * 12.5);
    add(`corr${n}`, 59.5, 0, z * 21.5);
    add(`exit${n}`, 55.5, 0, z * 21.5);
    add(`out${n}`, 51.5, 0, z * 21.5);
    add(`t${n}`, 46, 0, z * 12);
    add(`wing${n}`, 46, 0, z * 27);
    add(`wingB${n}`, 55, 0, z * 31);
  }
  add('chM', 57, 0, 0);
  add('fdoor', 55.5, 0, 0);
  add('porch', 52.5, 0, 0);
  add('tMid', 45.5, 0, 0);
  add('cwHead', 38.5, 0, 0);
  // the catwalk and the Anemometer
  add('cw1', 30, cw(30), 0);
  add('cw2', 21, cw(21), 0);
  add('cwTop', 13.5, cw(13.5), 0);
  add('d', 8.5, S.disc.y, 0);
  add('dN', 5.5, S.disc.y, -6.5);
  add('dS', 5.5, S.disc.y, 6.5);
  add('discN', 0, S.disc.y, -8.5);
  add('rampFoot', 0, S.disc.y, 11.3);
  add('perchS', 0, S.perch.y, 2);
  add('perch', 2, S.perch.y, -1.3);
  // the Glass Bridge and the Lens
  add('gbHead', 38.5, 0, -32);
  add('gb', 22, 0, -32);
  add('lens', 5.5, 0, -32);
  add('siteA', 0, 0, -32);
  add('lensS', 0, 0, -28.4);
  // the Broken Span, the ramps, the Sag
  add('spHead', 38.5, 0, 32);
  add('sp1', 28, 0, 32.2);
  add('sp2', 18, 0, 32.2);
  add('spLand', 17.8, 0, 36.5);
  add('sagRamp', 12, -2, 36.5);
  add('sagFoot', 6.6, S.sag.y, 36.5);
  add('sagN', 3, S.sag.y, 33.5);
  add('sagS', 3.2, S.sag.y, 39.5);
  add('siteB', 0, S.sag.y, 34);

  // keep: courtyard round the screen to the front door; the corridors out to the wings
  chain('tower', 'cyN', 'chN', 'chM', 'fdoor', 'porch', 'tMid');
  chain('tower', 'cyS', 'chS', 'chM');
  for (const n of ['N', 'S']) {
    chain(`cy${n}`, `door${n}`, `corr${n}`, `exit${n}`, `out${n}`, `t${n}`, 'tMid');
    chain(`out${n}`, `wing${n}`, `wingB${n}`);
    link(`t${n}`, `wing${n}`);
  }
  // catwalk to the Anemometer and up to the perch
  chain('tMid', 'cwHead', 'cw1', 'cw2', 'cwTop', 'd');
  chain('d', 'dN', 'discN');
  chain('d', 'dS', 'rampFoot', 'perchS', 'perch');
  // the Glass Bridge into the Lens
  chain('wingN', 'gbHead', 'gb', 'lens', 'siteA', 'lensS');
  // the Broken Span, down the ramp, through the Sag
  chain('wingS', 'spHead', 'sp1', 'sp2', 'spLand', 'sagRamp', 'sagFoot');
  chain('sagFoot', 'sagN', 'siteB');
  chain('sagFoot', 'sagS', 'siteB');
  return wps;
};
