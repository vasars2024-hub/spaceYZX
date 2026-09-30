// "The Orrery" — a clock the size of a cathedral: an observatory built round a brass model of
// a solar system still running in the dark (docs/NEW-MAPS.md, docs/maps/orrery.md). World x =
// east, z = south, y up; the ground floor is y 0. Mirror-symmetric across x = 0 — every box,
// spawn, waypoint, light and moving planet has its twin (Cyan, team 0, west; Orange, team 1,
// east). The building is also the same north ↔ south (bomb site A in the north gallery, B in the
// south one), except the Sun's two ramps, which both climb from south to north.
//
// Three floors, CS-style: rooms, corridors and doors, nothing open from end to end.
//
//   THE ORBIT HALL (|x| < 20, |z| < 22, ground, glass roof at 18)   the sealed hall of the
//        orrery. Six ground doors (two per side wall, one to each gallery corridor). In the
//        middle THE SUN (|x|, |z| ≤ 7, top y 7): its glowing core (|x|, |z| ≤ 4.5, 4 m tall)
//        blocks every line across the hall; its top is a ledge round the core. Two brass ramps
//        (east and west faces) climb it. Great upright gears stand in the hall's corners.
//   THE PLANETS (LevelDef.movers) glide inside the hall between upper docks and the Sun:
//          MERCURY ×2  north upper dock (y 7)  ↔  the Sun's north ledge (y 7)
//          VENUS   ×2  the Sun's south ledge   ↔  south upper dock (half a loop apart)
//          SATURN  ×2  north upper dock  ↔  south upper dock, along the hall's side (x ±16)
//        A ride is a shortcut between the upper galleries and the Sun; every place is also
//        reached on foot (bots never ride).
//   THE UPPER GALLERIES (y 7, north and south of the hall)   enclosed corridors along the
//        hall's walls, with the docks as windows into it; partitions and a kiosk break them up.
//        Doors lead onto HEAVEN, a balcony over each bomb site, and ramps lead down to the spawns.
//   THE BOMB SITES (|x| < 14, |z| 31..45, ground, ceiling 12)   A north, B south: galleries
//        entered from the hall (the mid corridor), from each team's star-chart library (side
//        doors) and from heaven above. A big astrolabe plinth in the middle.
//   THE WINGS (|x| 21..58)   per team: two clock rooms beside the hall, the Tower room (the
//        team's Tower) and the lens workshops behind it, the star-chart libraries and map rooms
//        by the sites, the south / north corridor, and the two spawn rooms.
//   THE GEAR CRYPT (y -5)   under the Sun: stairwells down from the hall (north and south of
//        the Sun), the crypt round the Sun's axle, crawl tunnels east and west, and a ramp tube
//        up into each Tower room: the basement flank route from wing to wing.
//   SPAWNS: two detached rooms per team (group 'north' nearer A, 'south' nearer B), each
//        behind an L-shaped vestibule with three doors (ramp up to the gallery, lens workshop
//        toward the Tower, map room toward the site).
import type { Vec3 } from '../../math/vec3';
import { v3 } from '../../math/vec3';
import { qFromAxisAngle } from '../../math/quat';
import { subtractHoles, wedgeRamp } from '../builder';
import type {
  BoxDef,
  LevelDef,
  LightDef,
  Material,
  MoverDef,
  SpawnDef,
  TowerDef,
  WaypointDef,
} from '../types';

const CYAN = 0x19e3ff;
const ORANGE = 0xff8a1f;
const SITE = 0xc23b3b;

// velvet, brass and old gold
const VELVET = 0x5a1723;
const BRASS = 0xc39a48;
const BRASS_DARK = 0x7d5a26;
const GEAR = 0xa47a34;
const GOLD = 0xd9a84a;
const IRON = 0x2d2a30;
const RAMP = 0xa98040;
const HALL_FLOOR = 0x3a2c22;
const PARQUET = 0x4b2e1c;
const DECK_WOOD = 0x6a4428;
const CRYPT = 0x2a2426;
const STARCHART = 0x141b3d;
const STAR = 0xe9efff;
const LAMP = 0xffc47a;
const SUNGLOW = 0xffab3d;
const DOCK = 0xffcf6a;
const SHELF = 0x3b2415;
const TABLE = 0x5b3a22;

/** Key coordinates (the east half, mostly the south-east quarter; the rest is mirrored). */
export const ORRERY = {
  /** the upper galleries' floor (and the Sun's ledge), their ceiling */
  upper: 7,
  upperCeiling: 11,
  /** ground rooms' ceiling (the upper floor's slab underside) */
  ceiling: 6.4,
  /** the crypt's floor */
  crypt: -5,
  /** the Sun: pedestal half-size and top, core half-size and top */
  sun: 7,
  pedestal: 7,
  core: 4.5,
  coreTop: 11,
  /** the orbit hall: |x| < x, |z| < z; its glass roof */
  hall: { x: 20, z: 22, roof: 18 },
  /** spawn rooms (south-east one; inner faces): x0..x1, z0..z1 */
  spawnRoom: { x0: 49, x1: 57, z0: 16, z1: 30 },
  /** Towers: Cyan's (west) first */
  towers: [v3(-37, 0, 0), v3(37, 0, 0)] as [Vec3, Vec3],
  bombSites: {
    A: { min: v3(-7, 0, -44), max: v3(7, 3, -35) },
    B: { min: v3(-7, 0, 35), max: v3(7, 3, 44) },
  },
  /** on the Sun's ledge, north and south of the core */
  powerups: [v3(0, 8, -5.25), v3(0, 8, 5.25)],
  /**
   * The planets (east ones; each has its twin at -x with the same timeline). `at` is the centre
   * of the walking surface where it is built (tick 0), `to` where it travels; `r` its rim's
   * apothem.
   */
  planets: {
    mercury: { at: v3(3.6, 7, -18.6), to: v3(3.6, 7, -10.35), r: 3.2, speed: 3, wait: 3 },
    venus: { at: v3(3.6, 7, 10.35), to: v3(3.6, 7, 18.6), r: 3.2, speed: 3, wait: 3 },
    saturn: { at: v3(16, 7, -18.2), to: v3(16, 7, 18.2), r: 3.6, speed: 5, wait: 3 },
  },
};

type Sign = 1 | -1;
const SIGNS: Sign[] = [1, -1];
type Extra = Omit<BoxDef, 'c' | 'h' | 'mat'>;
type Hole = [number, number, number, number];

/** A box from two corners (any order). */
const mk = (
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  mat: Material,
  extra: Extra = {},
): BoxDef => ({
  c: v3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
  h: v3(Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, Math.abs(z1 - z0) / 2),
  mat,
  ...extra,
});

const AXES = { x: v3(1, 0, 0), y: v3(0, 1, 0), z: v3(0, 0, 1) };

/** A box turned `angle` about one world axis through its centre (no turn: axis-aligned). */
const turned = (
  c: Vec3,
  h: Vec3,
  axis: 'x' | 'y' | 'z',
  angle: number,
  mat: Material,
  extra: Extra = {},
): BoxDef => ({
  c,
  h,
  ...(Math.abs(Math.sin(angle)) > 1e-9 ? { q: qFromAxisAngle(AXES[axis], angle) } : {}),
  mat,
  ...extra,
});

/** Mirror image across x = 0 (a turn keeps its axis' x part, flips the rest). */
const mirrorX = (b: BoxDef): BoxDef => ({
  ...b,
  c: v3(-b.c.x, b.c.y, b.c.z),
  ...(b.q ? { q: { x: b.q.x, y: -b.q.y, z: -b.q.z, w: b.q.w } } : {}),
});

/** Mirror image across z = 0 (a prism's ridge moves to the other side of its local z). */
const mirrorZ = (b: BoxDef): BoxDef => ({
  ...b,
  c: v3(b.c.x, b.c.y, -b.c.z),
  ...(b.q ? { q: { x: -b.q.x, y: -b.q.y, z: b.q.z, w: b.q.w } } : {}),
  ...(b.prism !== undefined ? { prism: -b.prism } : {}),
});

/** A flat 2n-gon (apothem `a`, from y0 to y1) as n bars turned about y: planets, hubs. */
const polygon = (
  cx: number,
  y0: number,
  y1: number,
  cz: number,
  a: number,
  n: number,
  phase: number,
  mat: Material,
  extra: Extra = {},
): BoxDef[] => {
  const w = a * Math.tan(Math.PI / (2 * n));
  const out: BoxDef[] = [];
  for (let k = 0; k < n; k++)
    out.push(
      turned(
        v3(cx, (y0 + y1) / 2, cz),
        v3(a, (y1 - y0) / 2, w),
        'y',
        phase + (k * Math.PI) / n,
        mat,
        extra,
      ),
    );
  return out;
};

/**
 * An upright gear turning about x (its disc in the y-z plane): a 16-gon body and `teeth`
 * teeth (bars through the middle), `t` thick.
 */
const gear = (
  cx: number,
  cy: number,
  cz: number,
  r: number,
  t: number,
  teeth: number,
  depth: number,
): BoxDef[] => {
  const out: BoxDef[] = [];
  const rb = r - depth;
  const w = rb * Math.tan(Math.PI / 16);
  for (let k = 0; k < 8; k++)
    out.push(
      turned(v3(cx, cy, cz), v3(t / 2, w, rb), 'x', (k * Math.PI) / 8, 'plate', { color: GEAR }),
    );
  const bars = teeth / 2;
  for (let j = 0; j < bars; j++)
    out.push(
      turned(
        v3(cx, cy, cz),
        v3(t / 2, 0.42, r),
        'x',
        Math.PI / 16 + (j * Math.PI) / bars,
        'plate',
        { color: GEAR },
      ),
    );
  return out;
};

/** A lying gear hub (half cover, 1.15 m): an eight-toothed star with a dark cap. */
const hub = (x: number, z: number, a: number): BoxDef[] => [
  mk(x - a, 0, z - a, x + a, 1.1, z + a, 'plate', { color: GEAR }),
  turned(v3(x, 0.55, z), v3(a, 0.55, a), 'y', Math.PI / 4, 'plate', { color: GEAR }),
  turned(v3(x, 1.125, z), v3(a * 0.6, 0.025, a * 0.6), 'y', Math.PI / 8, 'pillar', {
    color: BRASS_DARK,
  }),
];

/** A tall gear tooth (full cover, `h` m): a broad base and a narrower tip. */
const tooth = (x: number, y: number, z: number, alongZ: boolean, h = 2.5): BoxDef[] => {
  const [a, c] = alongZ ? [0.8, 1.2] : [1.2, 0.8];
  const [a2, c2] = alongZ ? [0.55, 0.95] : [0.95, 0.55];
  return [
    mk(x - a, y, z - c, x + a, y + h - 0.7, z + c, 'plate', { color: GEAR }),
    mk(x - a2, y + h - 0.7, z - c2, x + a2, y + h, z + c2, 'plate', { color: GEAR }),
  ];
};

/**
 * A planet platform, built with its walking surface at `c.y`: a brass 16-gon rim (apothem r),
 * a coloured cap on it (0.12 m step), and the planet's body hanging 2 m under it (drawn as
 * octagons, its upper half glowing; one plain box collides for it).
 */
const planet = (c: Vec3, r: number, cap: number, body: number): BoxDef[] => {
  const t = c.y;
  return [
    ...polygon(c.x, t - 0.5, t, c.z, r, 8, 0, 'plate', { color: BRASS }),
    ...polygon(c.x, t, t + 0.12, c.z, r * 0.7, 4, Math.PI / 8, 'panel', { color: cap }),
    ...polygon(c.x, t - 1.3, t - 0.5, c.z, r * 0.8, 4, Math.PI / 8, 'glow', {
      color: body,
      noCollide: true,
    }),
    ...polygon(c.x, t - 2, t - 1.3, c.z, r * 0.5, 4, 0, 'panel', { color: body, noCollide: true }),
    mk(c.x - r * 0.45, t - 2, c.z - r * 0.45, c.x + r * 0.45, t - 0.5, c.z + r * 0.45, 'panel', {
      noRender: true,
    }),
  ];
};

/** Rectangles of [x0,x1]×[z0,z1] minus holes ([x0, x1, z0, z1]), as slabs from y0 to y1. */
const slab = (
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y0: number,
  y1: number,
  holes: Hole[],
  mat: Material,
  extra: Extra = {},
): BoxDef[] =>
  subtractHoles(
    { u0: x0, u1: x1, v0: z0, v1: z1 },
    holes.map(([a, b, c, d]) => ({ u0: a, u1: b, v0: c, v1: d })),
  )
    .filter((r) => r.u1 - r.u0 > 1e-3 && r.v1 - r.v0 > 1e-3)
    .map((r) => mk(r.u0, y0, r.v0, r.u1, y1, r.v1, mat, extra));

const WALL = { color: VELVET };
/**
 * A wall [x0,x1]×[y0,y1]×[z0,z1] with openings (doors, windows): [along0, along1, y0, y1],
 * measured along its longer side. Every wall, fill and ceiling of the building shares one look
 * (velvet panel), so where they meet they merge.
 */
const wall = (
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y0: number,
  y1: number,
  holes: Hole[] = [],
): BoxDef[] => {
  const alongX = x1 - x0 >= z1 - z0;
  return subtractHoles(
    alongX ? { u0: x0, u1: x1, v0: y0, v1: y1 } : { u0: z0, u1: z1, v0: y0, v1: y1 },
    holes.map(([a, b, c, d]) => ({ u0: a, u1: b, v0: c, v1: d })),
  )
    .filter((r) => r.u1 - r.u0 > 1e-3 && r.v1 - r.v0 > 1e-3)
    .map((r) =>
      alongX
        ? mk(r.u0, r.v0, z0, r.u1, r.v1, z1, 'panel', WALL)
        : mk(x0, r.v0, r.u0, x1, r.v1, r.u1, 'panel', WALL),
    );
};

/** Round a coordinate (keeps mirrored boxes exactly mirrored). */
const rd = (n: number) => Math.round(n * 1e6) / 1e6;

/** a door's height */
const DH = 3.2;

export const buildOrrery = (): LevelDef => {
  const O = ORRERY;
  const U = O.upper;
  const UC = O.upperCeiling;
  const CL = O.ceiling;
  const B = O.crypt;
  const HX = O.hall.x;
  const HZ = O.hall.z;
  const P = O.pedestal;
  const S = O.sun;
  const K = O.core;

  /** the east half (x ≥ 0): mirrored to the west at the end */
  const E: BoxDef[] = [];
  /** on the mirror line (prisms that span it): authored whole */
  const C: BoxDef[] = [];
  const lights: LightDef[] = [];
  const light = (x: number, y: number, z: number, color: number, radius: number, k: number) =>
    lights.push({ pos: v3(x, y, z), color, radius, intensity: k });
  /** east and west copies of a light */
  const lightX = (x: number, y: number, z: number, color: number, radius: number, k: number) => {
    light(x, y, z, color, radius, k);
    if (x !== 0) light(-x, y, z, color, radius, k);
  };
  /** east / west and north / south copies of a light (authored in the south, z > 0) */
  const lightQ = (x: number, y: number, z: number, color: number, radius: number, k: number) => {
    lightX(x, y, z, color, radius, k);
    lightX(x, y, -z, color, radius, k);
  };
  /** push boxes, plus their north ↔ south mirror (authored in the south, z > 0) */
  const q = (boxes: BoxDef[], list: BoxDef[] = E) => {
    for (const b of boxes) list.push(b, mirrorZ(b));
  };
  const deco = (b: BoxDef): BoxDef => ({ ...b, noCollide: true });
  const brass = { color: BRASS };

  // ======================= floors =======================
  // the ground: parquet under the whole wing (walls stand on it), the hall's bronze plates
  E.push(
    ...slab(
      20,
      58,
      -46,
      46,
      -1,
      0,
      [
        [20, 31, -1.5, 1.5],
        [44, 58, -10, 10],
      ],
      'wood',
      {
        color: PARQUET,
      },
    ),
  );
  q(slab(0, 20, 23, 46, -1, 0, [], 'wood', { color: PARQUET }));
  q(slab(0, HX, 0, HZ, -1, 0, [[0, 2, 8, 17.5]], 'plate', { color: HALL_FLOOR }));
  q([mk(0, -1, HZ, HX, 0, 23, 'plate', { color: HALL_FLOOR })]);
  // the crypt and its tunnels (y -5)
  q([mk(0, B - 1, 0, 7.5, B, 8.5, 'plate', { color: CRYPT })]);
  E.push(mk(7.5, B - 1, -1.5, 21, B, 1.5, 'plate', { color: CRYPT }));
  // the upper galleries (y 7) and the heavens over the sites
  const deck = { color: DECK_WOOD };
  q(slab(0, 31, 23, 30, CL, U, [], 'wood', deck));
  q([mk(0, CL, 31, 14, U, 34, 'wood', deck)]);

  // ======================= the orbit hall =======================
  // side wall (two doors), end walls: a door to the gallery corridor; the docks up high
  E.push(
    ...wall(HX, HX + 1, -23, 23, 0, O.hall.roof, [
      [-13, -10, 0, DH],
      [10, 13, 0, DH],
    ]),
  );
  q(
    wall(0, HX, HZ, HZ + 1, 0, O.hall.roof, [
      [0, 2, 0, DH],
      [0.3, 7.2, U, U + 3.5],
      [12, HX, U, U + 3.5],
    ]),
  );
  q([mk(0, O.hall.roof, 0, HX + 1, O.hall.roof + 0.6, HZ + 1, 'skyglass')]);
  // the dome's ribs under the glass
  q([deco(mk(0, O.hall.roof - 0.5, 11.2, HX, O.hall.roof, 11.8, 'plate', { color: BRASS_DARK }))]);
  E.push(
    deco(mk(9.7, O.hall.roof - 0.5, -HZ, 10.3, O.hall.roof, HZ, 'plate', { color: BRASS_DARK })),
  );
  // amber strips on the docks' sills
  q([
    deco(mk(0.3, U, HZ, 7.2, U + 0.03, HZ + 0.3, 'glow', { color: DOCK })),
    deco(mk(12, U, HZ, HX, U + 0.03, HZ + 0.3, 'glow', { color: DOCK })),
  ]);
  lightQ(3.6, U + 1, HZ - 1, DOCK, 5, 0.5);
  lightQ(16, U + 1, HZ - 1, DOCK, 5, 0.5);

  // ---- the Sun: iron pedestal, gold rim, the glowing core (blocks the hall's middle)
  q([mk(0, 0, 0, P, S - 0.4, P, 'pillar', { color: IRON })]);
  q([mk(0, S - 0.4, 0, P, S, P, 'plate', { color: GOLD, trim: SUNGLOW })]);
  q([mk(0, S, 0, K, O.coreTop, K, 'glow', { color: SUNGLOW })]);
  // slits of light down the pedestal's north and south faces (clear of the ramps)
  q([deco(mk(1, 1, P, 5.5, S - 1, P + 0.05, 'glow', { color: SUNGLOW }))]);
  light(0, O.coreTop + 1.5, 0, SUNGLOW, 26, 1.5);
  lightQ(0, 4, P + 3, SUNGLOW, 9, 0.6);
  // the ramps (east; the west one is its mirror): up the east face from south to north
  E.push(wedgeRamp('z', P, -P, 0, S, P + 1.5, 3, { mat: 'plate', color: RAMP }));
  // brass rail on the ramp's outer edge (low: a climber still shows the chest)
  {
    const run = 2 * P;
    const a = Math.atan2(S, run);
    const len = Math.hypot(run, S);
    E.push(
      turned(
        v3(P + 3.15, S / 2 + 0.45 * Math.cos(a), 0.45 * Math.sin(a)),
        v3(0.15, 0.45, len / 2),
        'x',
        a,
        'plate',
        brass,
      ),
    );
  }
  // great upright gears in the hall's corners (full cover, 7.6 m) on brass bearings
  q(gear(11, 3.8, 15, 3.8, 1, 12, 0.5));
  q([mk(10.4, 0, 13.6, 11.6, 0.9, 16.4, 'plate', { color: GEAR })]);
  // cover along the hall's sides (under Saturn's path: ≤ 2.5 m) and in its end strips
  E.push(...tooth(16, 0, 0, false));
  q(hub(16.5, 5.5, 1.1));
  q(tooth(6, 0, 19.5, false));
  q(hub(17, 19.5, 1));
  // rails round the stairwells down to the crypt
  q([mk(2, 0, 7.75, 2.25, 1.1, 17.5, 'plate', brass), mk(0, 0, 7.75, 2, 1.1, 8, 'plate', brass)]);
  lightQ(15, 5, 6, LAMP, 11, 0.8);
  lightQ(8, 5, 18, LAMP, 11, 0.8);

  // ======================= the crypt (y -5): under the Sun =======================
  q([
    ...wall(7.5, 8, 1.5, 9, B - 1, -1),
    ...wall(2, 8, 8.5, 9, B - 1, -1),
    ...wall(2, 2.5, 9, 17.5, B - 1, -1),
    // the crawl tunnel's side
    ...wall(8, 21, 1.5, 2, B - 1, -1),
  ]);
  // the stairwells: from the hall floor down to the crypt (north and south of the Sun)
  const stair = wedgeRamp('z', 8.5, 17.5, B, 0, 0, 4, { mat: 'plate', color: RAMP });
  C.push(stair, mirrorZ(stair));
  // the Sun's axle: an iron column through the middle (no line across the crypt)
  q([mk(0, B, 0, 1.6, -1, 1.6, 'pillar', { color: IRON })]);
  q(hub(4.5, 5, 0.9).map((b) => ({ ...b, c: v3(b.c.x, b.c.y + B, b.c.z) })));
  lightQ(4.5, -2, 4.5, SUNGLOW, 8, 0.8);
  lightX(14, -2, 0, LAMP, 8, 0.7);
  // the tube: a ramp from the crawl tunnel up into the Tower room, inside a gear housing
  E.push(wedgeRamp('x', 21, 31, B, 0, 0, 3, { mat: 'plate', color: RAMP }));
  q([
    ...wall(21, 30, 1.5, 4, B - 1, -1),
    ...wall(21, 30, 1.5, 4, 0, CL),
    ...wall(21, 30, 0, 1.5, 3, CL),
  ]);
  lightX(26, 1.5, 0, LAMP, 7, 0.6);

  // ======================= the gallery corridors and the sites =======================
  // fill beside the mid corridor (the upper gallery stands on it)
  q(wall(2, 21, 23, 30, 0, CL));
  // the site's front wall: the mid door, heaven's door up high; side wall: the library door
  q(
    wall(0, 14, 30, 31, 0, 12, [
      [0, 2, 0, DH],
      [9, 12, U, U + 3],
    ]),
  );
  q(wall(14, 15, 31, 45, 0, 12, [[37, 41, 0, DH]]));
  // the outer wall (sites, libraries, map rooms)
  q(wall(0, 58, 45, 46, 0, 12));
  q([mk(0, 12, 31, 15, 12.6, 45, 'panel', WALL)]);
  // heaven's rail
  q([mk(0, U, 34, 14, U + 1.1, 34.3, 'plate', brass)]);
  // the site: the astrolabe plinth (full), crates by the doors, half cover at the back
  q([mk(3, 0, 36.5, 5, 2.4, 40.5, 'plate', { color: BRASS_DARK, trim: GOLD })]);
  q([mk(3.9, 2.4, 38, 4.1, 4.4, 39, 'plate', brass)].map((b) => deco(b)));
  q([mk(8, 0, 33, 10, 2.2, 35, 'crate', { color: TABLE })]);
  q([mk(10.5, 0, 42, 13, 1.1, 43.2, 'crate', { color: TABLE })]);
  lightQ(0, 5, 32.5, LAMP, 8, 0.7);
  lightQ(6, 9, 39, LAMP, 12, 0.9);
  lightQ(10.5, U + 2.5, 26.5, LAMP, 9, 0.7);

  // ======================= the upper galleries (y 7) =======================
  // the wall along the clock rooms' roofs, partitions, the kiosk between the twin docks
  q(wall(21, 31, 22, 23, U, UC));
  q(wall(12.5, 13, 26, 30, U, UC));
  q(wall(0, 1, 23, 27, U, UC));
  q([mk(0, UC, 23, 45, UC + 0.6, 31, 'panel', WALL)]);
  q([mk(1, U + 2.2, 23, 1.4, U + 2.8, 27, 'trim', { color: LAMP })].map(deco));
  lightQ(24, U + 2.5, 26.5, LAMP, 9, 0.7);
  lightQ(5, U + 2.5, 28, LAMP, 8, 0.6);

  // ======================= the east wing (Orange) =======================
  // the clock-room / Tower-room / lens line (x 30..31): tube, Tower doors, lens doors
  E.push(
    ...wall(30, 31, -23, 23, 0, CL, [
      [-1.5, 1.5, 0, 3],
      [-8, -5, 0, DH],
      [5, 8, 0, DH],
      [-20, -17, 0, DH],
      [17, 20, 0, DH],
    ]),
  );
  // clock rooms: their far wall (door to the corridor), a tall clock case, gear cover
  q(wall(21, 31, 23, 24, 0, CL, [[24, 28, 0, DH]]));
  q([mk(24, 0, 7.5, 27, 3.6, 10, 'crate', { color: SHELF, trim: GOLD })]);
  q(tooth(24, 0, 19.5, true));
  // the Tower room (|z| < 10) and the lens workshops behind it
  q(wall(31, 44, 10, 11, 0, CL, [[36, 39, 0, DH]]));
  E.push(...wall(43, 44, -10, 10, 0, CL));
  q([mk(40, 0, 3, 42, 2.2, 5.5, 'crate', { color: TABLE })]);
  q(hub(34.5, 8, 0.9));
  q([mk(33, 0, 20.5, 36, 1.1, 22.5, 'crate', { color: TABLE })]);
  q([mk(40, 0, 17, 42.5, 2.4, 21, 'crate', { color: SHELF })]);
  lightQ(25.5, 5, 14, LAMP, 11, 0.8);
  lightX(37, 5, 0, ORANGE, 10, 0.7);
  lightQ(38, 5, 17, LAMP, 9, 0.7);
  // the ramp shaft: from the vestibule up to the gallery (its walls reach the ceiling)
  q(wall(31, 45, 23, 24, 0, UC));
  q(wall(31, 58, 30, 31, 0, CL, [[45, 48, 0, DH]]));
  q(wall(31, 45, 30, 31, CL, UC));
  q(wall(44, 45, 23, 31, CL, UC));
  q([wedgeRamp('x', 44, 31, 0, U, 27, 6, { mat: 'wood', color: DECK_WOOD })]);
  lightQ(38, 6, 27, LAMP, 9, 0.7);
  // the star-chart library (by the site) and the map room
  q(wall(14, 31, 30, 31, 0, UC, [[22, 26, 0, DH]]));
  q(wall(30, 31, 31, 45, 0, CL, [[32, 35, 0, DH]]));
  q([
    mk(17, 0, 34.3, 25, 2.6, 35, 'crate', { color: SHELF }),
    mk(19, 0, 41.5, 29, 2.6, 42.2, 'crate', { color: SHELF }),
    mk(27.5, 0, 38.5, 29.5, 1.1, 40.5, 'crate', { color: TABLE }),
  ]);
  q([
    mk(37, 0, 36, 45, 1.1, 40, 'crate', { color: TABLE, trim: GOLD }),
    mk(33.5, 0, 42, 35, 2.4, 43.5, 'pillar', { color: BRASS_DARK }),
    mk(50, 0, 36, 51.5, 2.4, 37.5, 'pillar', { color: BRASS_DARK }),
    mk(51, 0, 41.5, 54, 1.1, 43.5, 'crate', { color: TABLE }),
  ]);
  lightQ(23, 5, 38, LAMP, 11, 0.8);
  lightQ(44, 5, 38, LAMP, 13, 0.8);
  // the vestibule (x 45..48 and the strip along z 11..15) and the spawn room
  q(
    wall(44, 45, 11, 30, 0, CL, [
      [11, 14, 0, DH],
      [25, 28, 0, DH],
    ]),
  );
  q(wall(44, 58, 10, 11, 0, CL));
  q(wall(48, 49, 15, 30, 0, CL));
  q(wall(49, 57, 15, 16, 0, CL, [[54, 57, 0, DH]]));
  q(wall(57, 58, 11, 45, 0, CL));
  q(roofs());
  lightQ(46.5, 5, 20, LAMP, 9, 0.7);
  lightQ(53, 5, 23, ORANGE, 10, 0.8);

  /** the wing's roof (velvet, like the walls): everything but the gallery and the shaft */
  function roofs(): BoxDef[] {
    return [
      ...slab(
        21,
        58,
        0,
        46,
        CL,
        U,
        [
          [21, 45, 23, 31],
          [44, 58, 0, 10],
        ],
        'panel',
        WALL,
      ),
      mk(14, CL, 31, 21, U, 46, 'panel', WALL),
    ];
  }

  // ======================= look: star charts, lamps, brass =======================
  const dots: [number, number][] = [
    [-2.9, 2.2],
    [-0.8, 5.6],
    [1.7, 3.6],
    [3.2, 6.4],
    [-3.3, 4.8],
  ];
  // star charts high on the hall's walls
  const chartZ = (x: number, z: number, y: number, ht = 7) => [
    deco(mk(x - 4, y, z - 0.06, x + 4, y + ht, z, 'panel', { color: STARCHART })),
    ...dots.map(([dx, dy]) =>
      deco(
        mk(
          x + dx - 0.15,
          y + (dy * ht) / 7,
          z - 0.1,
          x + dx + 0.15,
          y + 0.3 + (dy * ht) / 7,
          z - 0.06,
          'glow',
          {
            color: STAR,
          },
        ),
      ),
    ),
  ];
  const chartX = (x: number, z: number, y: number) => [
    deco(mk(x - 0.06, y, z - 4, x, y + 7, z + 4, 'panel', { color: STARCHART })),
    ...dots.map(([dz, dy]) =>
      deco(
        mk(x - 0.1, y + dy, z + dz - 0.15, x - 0.06, y + 0.3 + dy, z + dz + 0.15, 'glow', {
          color: STAR,
        }),
      ),
    ),
  ];
  q(chartZ(9.6, HZ, 10.8, 6.4));
  q(chartX(HX, 5, 8));
  q(chartZ(8, 45, 4, 7.6));
  q(chartZ(44, 45, 1.5, 4.6));
  // lamps and brass skirting
  const lampZ = (x: number, y: number, z: number) =>
    deco(mk(x - 0.3, y, z - 0.25, x + 0.3, y + 0.6, z, 'trim', { color: LAMP }));
  q([lampZ(2.5, 5, 45), lampZ(13, 5, 45), lampZ(25, 4, 45), lampZ(38, 4, 45)]);
  q([deco(mk(0, 0, HZ - 0.2, HX, 0.4, HZ, 'plate', brass))]);
  E.push(deco(mk(HX - 0.2, 0, -HZ, HX, 0.4, -13, 'plate', brass)));
  E.push(deco(mk(HX - 0.2, 0, -10, HX, 0.4, 10, 'plate', brass)));
  E.push(deco(mk(HX - 0.2, 0, 13, HX, 0.4, HZ, 'plate', brass)));
  // the orbit line on the hall's floor round the Sun (an octagon, apothem 13.5)
  {
    const a = 13.5;
    const half = a * Math.tan(Math.PI / 8) + 0.15;
    for (let k = 0; k < 8; k++) {
      const th = (k * Math.PI) / 4;
      const c = v3(rd(a * Math.cos(th)), 0.01, rd(a * Math.sin(th)));
      if (c.x < -1e-6) continue;
      const b = deco(turned(c, v3(0.15, 0.01, half), 'y', -th, 'plate', brass));
      if (Math.abs(c.x) < 1e-6) C.push(b);
      else E.push(b);
    }
  }
  // the armillary: a brass ring hanging over the Sun
  {
    const a = 10;
    const y = 15;
    const th = 0.25;
    const half = a * Math.tan(Math.PI / 8) + th;
    for (let k = 0; k < 8; k++) {
      const t = (k * Math.PI) / 4;
      const c = v3(rd(a * Math.cos(t)), y, rd(a * Math.sin(t)));
      if (c.x < -1e-6) continue;
      const b = deco(turned(c, v3(th, th, half), 'y', -t, 'plate', brass));
      if (Math.abs(c.x) < 1e-6) C.push(b);
      else E.push(b);
    }
  }
  light(0, 16, 0, 0x6f8cff, 30, 0.35);

  // ======================= sites =======================
  for (const st of [O.bombSites.A, O.bombSites.B]) {
    const w = 0.12;
    const t = { color: SITE };
    const cz = (st.min.z + st.max.z) / 2;
    const edge = [
      mk(0, 0.01, st.min.z, st.max.x, 0.05, st.min.z + w, 'trim', t),
      mk(0, 0.01, st.max.z - w, st.max.x, 0.05, st.max.z, 'trim', t),
      mk(st.max.x - w, 0.01, st.min.z + w, st.max.x, 0.05, st.max.z - w, 'trim', t),
    ];
    E.push(...edge.map(deco));
    light(0, 3, cz, 0xff6a5a, 8, 0.5);
  }

  // ======================= teams: Towers, spawns, homes =======================
  const T: BoxDef[] = [];
  const towers: TowerDef[] = [];
  const spawns: SpawnDef[] = [];
  const homes: Vec3[] = [];
  for (const team of [0, 1] as const) {
    const s: Sign = team === 0 ? -1 : 1;
    const tc = team === 0 ? CYAN : ORANGE;
    const tmat: Material = team === 0 ? 'teamA' : 'teamB';
    const tp = O.towers[team];
    // the Tower: a team-coloured column from floor to ceiling
    T.push(mk(tp.x - 1, 0, -1, tp.x + 1, CL, 1, tmat, { trim: tc }));
    towers.push({ team, pos: tp, radius: 1.5, height: 4 });
    homes.push(v3(s * 40.5, 0.9, 0));
    for (const n of SIGNS) {
      const group = n < 0 ? 'north' : 'south';
      for (const x of [51.5, 55])
        for (const z of [22, 26.5])
          spawns.push({
            pos: v3(s * x, 0, n * z),
            // facing the room's door (north-west for Orange's south room)
            yawDeg: s * (n > 0 ? 45 : 135),
            team,
            group,
          });
      // team colour over the room's door and on its back wall
      T.push(
        deco(mk(s * 54, DH + 0.05, n * 16, s * 57, DH + 0.25, n * 16.12, 'trim', { color: tc })),
      );
      T.push(deco(mk(s * 50, 1, n * 29.9, s * 56, 4.5, n * 30, tmat)));
    }
  }

  // ======================= the planets (moving blocks) =======================
  const boxes: BoxDef[] = [...C, ...E, ...E.map(mirrorX), ...T];
  const movers: MoverDef[] = [];
  const PL = O.planets;
  const addPlanet = (
    p: { at: Vec3; to: Vec3; r: number; speed: number; wait: number },
    cap: number,
    body: number,
  ) => {
    const east = planet(p.at, p.r, cap, body);
    for (const set of [east, east.map(mirrorX)]) {
      const first = boxes.length;
      boxes.push(...set);
      movers.push({
        boxes: set.map((_, i) => first + i),
        path: [v3(0, 0, 0), v3(p.to.x - p.at.x, p.to.y - p.at.y, p.to.z - p.at.z)],
        speed: p.speed,
        delay: p.wait,
      });
    }
  };
  addPlanet(PL.mercury, 0xb9adc9, 0x7f7690);
  addPlanet(PL.venus, 0xf2d59a, 0xc9a86a);
  addPlanet(PL.saturn, 0xe7b96a, 0xb9854a);

  return {
    name: 'The Orrery',
    boundsMin: v3(-58, B - 2, -46),
    boundsMax: v3(58, O.hall.roof + 1, 46),
    defaultGravity: v3(0, -1, 0),
    boxes,
    zones: [],
    rails: [],
    pads: [],
    spawns,
    towers,
    controllerHomes: homes,
    waypoints: waypoints(),
    areas: [
      { name: 'Cyan spawn (south)', pos: v3(-53, 0, 24), yawDeg: -45 },
      { name: 'Orange spawn (south)', pos: v3(53, 0, 24), yawDeg: 45 },
      { name: 'The Sun', pos: v3(0, S, 5.25), yawDeg: 180 },
      { name: 'Orbit hall, east', pos: v3(15, 0, 3), yawDeg: -90 },
      { name: 'A site (north gallery)', pos: v3(0, 0, -42.5), yawDeg: 180 },
      { name: 'B site (south gallery)', pos: v3(0, 0, 42.5), yawDeg: 0 },
      { name: 'Heaven over B', pos: v3(6, U, 32.5), yawDeg: 0 },
      { name: 'South upper gallery', pos: v3(-7, U, 28), yawDeg: 90 },
      { name: 'Gear crypt', pos: v3(0, B, 6), yawDeg: 0 },
      { name: 'West Tower room', pos: v3(-34, 0, 5), yawDeg: -90 },
      { name: 'West library (B)', pos: v3(-23, 0, 36), yawDeg: 90 },
    ],
    fog: { color: 0x0a1027, near: 40, far: 170 },
    ambient: 0.62,
    sideTint: { neg: 0x1d6a80, pos: 0x86501f, amount: 0.12 },
    lights,
    bombSites: [
      { name: 'A', ...O.bombSites.A },
      { name: 'B', ...O.bombSites.B },
    ],
    powerups: O.powerups,
    movers,
    sky: {
      moons: [
        { dir: v3(0.35, 0.8, -0.49), sizeDeg: 20, color: 0x9fb2e6 },
        { dir: v3(-0.62, 0.6, 0.5), sizeDeg: 3.5, color: 0xe6e0d0 },
        { dir: v3(0.8, 0.35, 0.49), sizeDeg: 1.5, color: 0xd98a6a },
      ],
    },
  };
};

/**
 * Bot waypoints (static routes only: none on or over a planet's path). Authored in the
 * south-east quarter and mirrored: a name gets 'N'/'S' when mirrored north ↔ south and 'E'/'W'
 * when mirrored east ↔ west ('spawnSE'). Nodes on x = 0 or z = 0 have no copy there. The
 * Sun's ramps are the same north and south (authored with `z: false`, explicit names).
 */
const waypoints = (): WaypointDef[] => {
  const U = ORRERY.upper;
  const B = ORRERY.crypt;
  const wps: WaypointDef[] = [];
  const flags = new Map<string, { x: boolean; z: boolean }>();
  const nameOf = (base: string, s: Sign, n: Sign) => {
    const f = flags.get(base);
    if (!f) throw new Error(`waypoint ${base} missing`);
    return `${base}${f.z ? (n < 0 ? 'N' : 'S') : ''}${f.x ? (s > 0 ? 'E' : 'W') : ''}`;
  };
  const add = (base: string, x: number, feet: number, z: number, o: { z?: boolean } = {}) => {
    const fx = x !== 0;
    const fz = o.z ?? z !== 0;
    flags.set(base, { x: fx, z: fz });
    for (const n of fz ? SIGNS : [1 as Sign])
      for (const s of fx ? SIGNS : [1 as Sign])
        wps.push({ pos: v3(s * x, feet + 1, n * z), links: [], name: nameOf(base, s, n) });
  };
  const idx = (name: string) => {
    const i = wps.findIndex((w) => w.name === name);
    if (i < 0) throw new Error(`waypoint ${name} missing`);
    return i;
  };
  const both = (i: number, j: number) => {
    if (i === j) return;
    if (!wps[i].links.includes(j)) wps[i].links.push(j);
    if (!wps[j].links.includes(i)) wps[j].links.push(i);
  };
  /** link two bases in every mirrored copy */
  const link = (a: string, b: string) => {
    for (const n of SIGNS) for (const s of SIGNS) both(idx(nameOf(a, s, n)), idx(nameOf(b, s, n)));
  };
  const chain = (...names: string[]) => {
    for (let i = 1; i < names.length; i++) link(names[i - 1], names[i]);
  };
  /** link a node's north and south copies (both sides) */
  const acrossZ = (base: string) => {
    for (const s of SIGNS) both(idx(nameOf(base, s, -1)), idx(nameOf(base, s, 1)));
  };

  // spawn room, vestibule, ramp up to the gallery
  add('spawn', 53, 0, 24);
  add('rIn', 55.5, 0, 18.5);
  add('rOut', 55.5, 0, 12.8);
  add('vN', 46.5, 0, 12.8);
  add('vMid', 46.5, 0, 20);
  add('vS', 46.5, 0, 26.5);
  add('vD3', 46.5, 0, 29.5);
  add('rampLow', 42, 1.1, 27);
  add('rampHigh', 34, 5.4, 27);
  add('uE', 28, U, 26.5);
  add('uSat', 17, U, 24.5);
  add('uW', 10, U, 24.5);
  add('uCtr', 0, U, 28.5);
  add('heaven', 10.5, U, 32.5);
  add('heavenC', 0, U, 32.5);
  // map room, library, the site
  add('mapN', 46.5, 0, 33.5);
  add('mapC', 48, 0, 40);
  add('mapW', 33, 0, 33.5);
  add('libE', 28.5, 0, 33.5);
  add('libN', 24, 0, 33);
  add('libMid', 25.5, 0, 38);
  add('libW', 17, 0, 39);
  add('siteE', 12, 0, 39);
  add('siteNE', 5, 0, 34);
  add('siteN', 0, 0, 33.5);
  add('siteC', 0, 0, 39.5);
  add('site', 0, 0, 42.5);
  add('siteSE', 7.5, 0, 42);
  // the mid corridor and the hall
  add('bcorr', 0, 0, 26.5);
  add('hallDoor', 0, 0, 20);
  add('hallS1', 6, 0, 17);
  add('hallGap', 11, 0, 20.6);
  add('hallCorner', 14.5, 0, 19.5);
  add('hallE', 15, 0, 11.5);
  add('hallEc', 12.5, 0, 3);
  add('sunFoot', 8.5, 0, 9);
  // the Sun's ramps and ledge (the same north and south: named explicitly)
  add('sunRampMid', 8.5, 3.5, 0);
  add('sunRampTop', 8.5, 6.4, -5.8, { z: false });
  add('sunNE', 5.25, U, -5.25, { z: false });
  add('sunE', 5.25, U, 0);
  add('sunSE', 5.25, U, 5.25, { z: false });
  add('sunS', 0, U, 5.25, { z: false });
  add('sunN', 0, U, -5.25, { z: false });
  // the crypt
  add('wellTop', 0, 0, 18.5);
  add('wellMid', 0, -2.5, 13);
  add('pitS', 0, B, 6);
  add('pitSE', 4.5, B, 2.5);
  add('pitE', 5, B, 0);
  add('crawl', 14, B, 0);
  add('tubeLow', 22.5, B + 0.75, 0);
  add('tubeHigh', 29, -1, 0);
  // clock room, Tower room, lens workshop
  add('clockW', 22.5, 0, 11.5);
  add('clockSW', 22.5, 0, 5.5);
  add('clockTr', 28.5, 0, 6.5);
  add('clockE', 27, 0, 18.5);
  add('clockS', 26, 0, 21.5);
  add('scorr', 26, 0, 27);
  add('tubeTop', 32.5, 0, 0);
  add('trDoor', 33, 0, 4.5);
  add('tower', 34.5, 0, 0);
  add('trS', 37.5, 0, 4);
  add('trLens', 37.5, 0, 8.5);
  add('lens', 37.5, 0, 13);
  add('lensE', 42, 0, 12.5);
  add('lensW', 33, 0, 18.5);

  chain('spawn', 'rIn', 'rOut', 'vN', 'vMid', 'vS', 'vD3', 'mapN');
  chain('vS', 'rampLow', 'rampHigh', 'uE', 'uSat', 'uW', 'uCtr');
  chain('uW', 'heaven', 'heavenC');
  chain('mapN', 'mapW', 'libE', 'libMid', 'libW', 'siteE', 'siteSE', 'site', 'siteC', 'siteN');
  link('mapN', 'mapC');
  chain('libE', 'libN', 'scorr', 'clockS', 'clockE', 'clockW', 'clockSW', 'clockTr');
  chain('siteE', 'siteNE', 'siteN', 'bcorr', 'hallDoor', 'hallS1', 'hallGap', 'hallCorner');
  chain('hallCorner', 'hallE');
  chain('hallE', 'hallEc');
  link('hallE', 'sunFoot');
  link('hallS1', 'sunFoot');
  link('hallE', 'clockW');
  chain('hallDoor', 'wellTop', 'wellMid', 'pitS', 'pitSE', 'pitE', 'crawl', 'tubeLow', 'tubeHigh');
  chain('tubeHigh', 'tubeTop', 'tower', 'trS', 'trLens', 'lens', 'lensE', 'vN');
  link('tubeTop', 'trDoor');
  chain('clockTr', 'trDoor');
  chain('lens', 'lensW', 'clockE');
  acrossZ('hallEc');
  // the Sun: up the ramp (south foot → north top), round the ledge
  for (const s of SIGNS) {
    const n = (b: string) => idx(nameOf(b, s, 1));
    const at = (b: string, z: Sign) => idx(nameOf(b, s, z));
    both(at('sunFoot', 1), n('sunRampMid'));
    both(n('sunRampMid'), n('sunRampTop'));
    both(n('sunRampTop'), n('sunNE'));
    both(n('sunNE'), n('sunE'));
    both(n('sunE'), n('sunSE'));
    both(n('sunSE'), n('sunS'));
    both(n('sunNE'), n('sunN'));
  }
  return wps;
};
