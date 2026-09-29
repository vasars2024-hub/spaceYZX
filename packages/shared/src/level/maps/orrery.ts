// "The Orrery" — a clock the size of a cathedral: a dim observatory dome in deep space, a brass
// model of a solar system still running in the dark (docs/NEW-MAPS.md). World x = east, z =
// south, y up; the Well's floor is y 0. Mirror-symmetric across x = 0 — every box, spawn,
// waypoint and moving planet (paths and timing) has its twin (Cyan, team 0, spawns west; Orange,
// team 1, east). The outer parts are also built the same north ↔ south; the Sun's double spiral
// ramp is not (both ramps start at the south and end at the north), so bomb site A (north
// gallery) and B (south gallery) differ a little — both lie on the mirror line x = 0.
//
//   THE WELL (|x| < 32, |z| < 30, y 0)   the open floor under the dome (glass at y 26, stars):
//        four giant upright gears (full cover, 7.5 m tall), lying gear hubs (half cover), a
//        brass orbit line on the floor. The Sun stands in its middle
//   THE SUN (|x|, |z| ≤ 9, top y 12)   the high ground and the power-up: a glowing brass core
//        on a pedestal, four low solar flares on top (half cover). Reached by
//          - the DOUBLE SPIRAL: two 3 m ramps (≤ 26°) that start together at the Sun gate
//            (south, x = 0), wind out along the south face and up the east / west faces to the
//            NE / NW landings (y 12)
//          - the PLANETS (moving blocks, LevelDef.movers): Mercury (north) and Venus (south)
//   THE UNDERCROFT (y 0, ceiling 5.4)   all round the Well under the Ring deck, open to it
//        through an arcade (lintel 3.8: the Sun can't see into it):
//          - GEAR GALLERIES north / south (|z| 30..46): upright gears, gear teeth, hubs;
//            site A (north) and B (south) on x = 0; ramps up to the Ring at the back
//          - YARDS east / west (|x| 32..46): each team's Tower in front of its spawn; a ramp up
//            to the Ring at each end
//   THE RING (y 6)   the walkway on the deck over the undercroft, all the way round: velvet
//        walls with star charts and brass lamps, waist-high brass rails along the Well (open
//        only at the planets' docks), gear teeth and brass half walls
//   SPAWNS (|x| 46.6..57.4, |z| < 9.4)   walled rooms behind the yards; two L-shaped exits
//        (door → vestibule → yard), so nothing outside sees in
//
// The planets (brass-ringed discs, big enough for a team): each waits 3 s at an end, then
// glides to the other, forever (level/movers.ts: a pure function of the tick). Mirrored pairs
// share one timeline; Mercury and Venus alternate (one pair is always at the Sun).
//   MERCURY ×2 (x ±4.5)  north Ring edge (y 6)  ↔  the Sun's north face (y 12)
//   VENUS   ×2 (x ±4.5)  the Sun's south face   ↔  south Ring edge (over the spiral's foot)
//   SATURN  ×2 (x ±22)   north Ring edge  ↔  south Ring edge, flat at y 6 (flank to flank)
// Nothing static stands in a planet's way, over its path, or under it within reach of a
// standing player; the Ring's rails open only where a planet docks. Bots never ride them: every
// place is also reached by static routes (the waypoints never touch a planet).
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

// velvet, brass and old gold under a deep-blue dome
const VELVET = 0x5a1723;
const VELVET_DARK = 0x3a0e16;
const BRASS = 0xc39a48;
const BRASS_DARK = 0x7d5a26;
const GEAR = 0xa47a34;
const GOLD = 0xd9a84a;
const IRON = 0x2d2a30;
const RAMP = 0xa98040;
const WELL_FLOOR = 0x3a2c22;
const PARQUET = 0x4b2e1c;
const DECK_WOOD = 0x6a4428;
const STARCHART = 0x141b3d;
const STAR = 0xe9efff;
const LAMP = 0xffc47a;
const SUNGLOW = 0xffab3d;
const DOCK = 0xffcf6a;
const SPAWN_FLOOR = 0x2f2a2c;
const SPAWN_WALL = 0x46302c;

/** Key coordinates (the east half; the west half is its mirror image, x → -x). */
export const ORRERY = {
  /** the Ring deck's top (the walkway), its thickness, the arcade's lintel */
  ring: 6,
  deck: 0.6,
  lintel: 3.8,
  /** the Sun's top (high ground) and the dome's glass */
  sun: 12,
  dome: 26,
  /** the Well: |x| < x, |z| < z (floor y 0) */
  well: { x: 32, z: 30 },
  /** the undercroft's / Ring's outer walls (inner faces) */
  outer: { x: 46, z: 46 },
  /** spawn room (east; inner faces): x0..x1, |z| < z */
  spawn: { x0: 46.6, x1: 57.4, z: 9.4 },
  /** the Sun: pedestal half-size, ramp band outer edge, the gate (|x| < gate) at the south */
  pedestal: 9,
  band: 12,
  gate: 1.5,
  /** the spiral's corner landing height (south → east / west faces) */
  spiralLanding: 3.6,
  /** Towers: Cyan's (west) first */
  towers: [v3(-38, 0, 0), v3(38, 0, 0)] as [Vec3, Vec3],
  bombSites: {
    A: { min: v3(-6, 0, -41), max: v3(6, 3, -33) },
    B: { min: v3(-6, 0, 33), max: v3(6, 3, 41) },
  },
  powerups: [v3(0, 13, 0)],
  /**
   * The planets (east ones; each has its twin at -x with the same timeline). `at` is the centre
   * of the walking surface where it is built (tick 0), `to` where it travels; radius of its rim.
   */
  planets: {
    mercury: { at: v3(4.5, 6, -26.4), to: v3(4.5, 12, -12.6), r: 3.5, speed: 3.5, wait: 3 },
    venus: { at: v3(4.5, 12, 12.6), to: v3(4.5, 6, 26.4), r: 3.5, speed: 3.5, wait: 3 },
    saturn: { at: v3(22, 6, -25.9), to: v3(22, 6, 25.9), r: 4, speed: 5.5, wait: 3 },
  },
  /** great gears in the Well (upright, turning about x): centre, tip radius, thickness */
  greatGear: { x: 15, y: 1, z: 20, r: 6.5, t: 1.2 },
  /** gallery gears (upright, turning about x) */
  galleryGear: { x: 10, y: 0.4, z: 33.5, r: 3.2, t: 1 },
};

type Sign = 1 | -1;
const SIGNS: Sign[] = [1, -1];
type Extra = Omit<BoxDef, 'c' | 'h' | 'mat'>;

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
  // (a half turn leaves a box as it was)
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
 * An upright gear turning about x (its disc in the y-z plane): a 16-gon body and `teeth` teeth
 * (bars through the middle), `t` thick. Its lower part sinks into a slot plate of the same
 * brass under the floor.
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

/** A lying gear hub (half cover, 1.2 m): an eight-toothed star with a dark cap. */
const hub = (x: number, z: number, a: number): BoxDef[] => [
  mk(x - a, 0, z - a, x + a, 1.1, z + a, 'plate', { color: GEAR }),
  turned(v3(x, 0.55, z), v3(a, 0.55, a), 'y', Math.PI / 4, 'plate', { color: GEAR }),
  turned(v3(x, 1.15, z), v3(a * 0.6, 0.05, a * 0.6), 'y', Math.PI / 8, 'pillar', {
    color: BRASS_DARK,
  }),
];

/** A tall gear tooth (full cover, 2.8 m): a broad base and a narrower tip. */
const tooth = (x: number, y: number, z: number, alongZ: boolean): BoxDef[] => {
  const [a, c] = alongZ ? [0.8, 1.2] : [1.2, 0.8];
  const [a2, c2] = alongZ ? [0.55, 0.95] : [0.95, 0.55];
  return [
    mk(x - a, y, z - c, x + a, y + 2, z + c, 'plate', { color: GEAR }),
    mk(x - a2, y + 2, z - c2, x + a2, y + 2.8, z + c2, 'plate', { color: GEAR }),
  ];
};

/**
 * A planet platform, built with its walking surface at `c.y`: a brass 16-gon rim (radius r),
 * a coloured cap on it (0.12 m step), and the planet's body hanging 2 m under it (drawn as
 * octagons, its upper half glowing so the planets read in the dark wherever they are; one
 * plain box collides for it). (Moving blocks get no baked light: glow and bright colours.)
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
  holes: [number, number, number, number][],
  mat: Material,
  extra: Extra = {},
): BoxDef[] =>
  subtractHoles(
    { u0: x0, u1: x1, v0: z0, v1: z1 },
    holes.map(([a, b, c, d]) => ({ u0: a, u1: b, v0: c, v1: d })),
  )
    .filter((r) => r.u1 - r.u0 > 1e-3 && r.v1 - r.v0 > 1e-3)
    .map((r) => mk(r.u0, y0, r.v0, r.u1, y1, r.v1, mat, extra));

/** Round a coordinate (keeps mirrored boxes exactly mirrored). */
const rd = (n: number) => Math.round(n * 1e6) / 1e6;

export const buildOrrery = (): LevelDef => {
  const O = ORRERY;
  const R = O.ring;
  const U = R - O.deck; // the undercroft's ceiling
  const L = O.lintel;
  const WX = O.well.x;
  const WZ = O.well.z;
  const OX = O.outer.x;
  const OZ = O.outer.z;
  const P = O.pedestal;
  const BAND = O.band;
  const G = O.gate;
  const SL = O.spiralLanding;
  const S = O.sun;

  /** on the mirror line (authored whole) */
  const C: BoxDef[] = [];
  /** the east half (x ≥ 0): mirrored to the west at the end */
  const E: BoxDef[] = [];
  const lights: LightDef[] = [];
  const light = (x: number, y: number, z: number, color: number, radius: number, k: number) =>
    lights.push({ pos: v3(x, y, z), color, radius, intensity: k });
  /** east and west copies of a light */
  const lightX = (x: number, y: number, z: number, color: number, radius: number, k: number) => {
    light(x, y, z, color, radius, k);
    if (x !== 0) light(-x, y, z, color, radius, k);
  };
  /** push boxes, plus their north ↔ south mirror (authored in the south, z > 0) */
  const ns = (list: BoxDef[], boxes: BoxDef[]) => {
    for (const b of boxes) list.push(b, mirrorZ(b));
  };
  const deco = (b: BoxDef): BoxDef => ({ ...b, noCollide: true });

  // ======================= floors =======================
  const GG = O.greatGear;
  const GL = O.galleryGear;
  const ggSlot: [number, number, number, number] = [
    GG.x - 0.8,
    GG.x + 0.8,
    GG.z - GG.r - 0.1,
    GG.z + GG.r + 0.1,
  ];
  const glSlot: [number, number, number, number] = [
    GL.x - 0.8,
    GL.x + 0.8,
    GL.z - GL.r - 0.1,
    GL.z + GL.r + 0.1,
  ];
  // the Well: dark bronze plates, with brass slots the great gears stand in
  E.push(
    ...slab(
      0,
      WX,
      -WZ,
      WZ,
      -1,
      0,
      [ggSlot, [ggSlot[0], ggSlot[1], -ggSlot[3], -ggSlot[2]]],
      'plate',
      { color: WELL_FLOOR },
    ),
  );
  ns(E, [mk(ggSlot[0], -1, ggSlot[2], ggSlot[1], 0, ggSlot[3], 'plate', { color: GEAR })]);
  // the undercroft: parquet (galleries, yards); gallery gear slots
  ns(E, slab(0, OX, WZ, OZ, -1, 0, [glSlot], 'wood', { color: PARQUET }));
  ns(E, [mk(glSlot[0], -1, glSlot[2], glSlot[1], 0, glSlot[3], 'plate', { color: GEAR })]);
  E.push(mk(WX, -1, -WZ, OX, 0, WZ, 'wood', { color: PARQUET }));
  // spawn room and its vestibules
  E.push(mk(OX, -1, -15.6, 58, 0, 15.6, 'floor', { color: SPAWN_FLOOR }));

  // ======================= the Ring deck (y 5.4..6) =======================
  const yardHole: [number, number, number, number] = [41, OX, 16, WZ];
  const galHole: [number, number, number, number] = [12, 26, 41.5, OZ];
  ns(E, slab(0, OX, WZ, OZ, U, R, [galHole], 'wood', { color: DECK_WOOD }));
  E.push(
    ...slab(WX, OX, -WZ, WZ, U, R, [yardHole, [41, OX, -WZ, -16]], 'wood', { color: DECK_WOOD }),
  );
  E.push(mk(OX + 0.6, U, -15.6, 58, R, 15.6, 'hull', { color: 0x2a1c1a })); // spawn roof

  // ======================= outer walls: velvet, up to the dome =======================
  const velvet = { color: VELVET };
  ns(E, [mk(0, 0, OZ, OX + 0.6, O.dome, OZ + 0.6, 'panel', velvet)]); // galleries' back + Ring
  E.push(mk(OX, R, -OZ, OX + 0.6, O.dome, OZ, 'panel', velvet)); // over the Ring, east
  // below the deck at x = 46: the spawn's front, the vestibule openings, the yard's back
  E.push(mk(OX, 0, -11, OX + 0.6, R, 11, 'panel', velvet));
  ns(E, [
    mk(OX, 3.2, 11, OX + 0.6, R, 15, 'panel', velvet), // over the vestibule opening
    mk(OX, 0, 15, OX + 0.6, R, OZ, 'panel', velvet),
  ]);
  // the dome's glass
  C.push(mk(-OX - 0.6, O.dome, -OZ - 0.6, OX + 0.6, O.dome + 0.6, OZ + 0.6, 'skyglass'));

  // ======================= spawn rooms (east: Orange) =======================
  const SP = O.spawn;
  const sw = { color: SPAWN_WALL };
  E.push(mk(SP.x1, 0, -15.6, 58, U, 15.6, 'panel', sw)); // back
  ns(E, [
    // room ↔ vestibule: a door at the back (x 53..57)
    mk(SP.x0, 0, SP.z, 53, U, 10, 'panel', sw),
    mk(57, 0, SP.z, SP.x1, U, 10, 'panel', sw),
    mk(53, 3.2, SP.z, 57, U, 10, 'panel', sw),
    // the vestibule's far wall
    mk(SP.x0, 0, 15, SP.x1, U, 15.6, 'panel', sw),
  ]);

  // ======================= the arcade (Well ↔ undercroft) =======================
  const fascia = { color: VELVET_DARK };
  E.push(mk(WX, L, -WZ - 1, WX + 1, U, WZ + 1, 'panel', fascia));
  ns(E, [mk(0, L, WZ, WX, U, WZ + 1, 'panel', fascia)]);
  const pil = (x0: number, z0: number, x1: number, z1: number) =>
    mk(x0, 0, z0, x1, L, z1, 'pillar', { color: BRASS_DARK });
  E.push(pil(WX, -0.5, WX + 1, 0.5));
  for (const z of [8, 16, 24]) ns(E, [pil(WX, z - 0.5, WX + 1, z + 0.5)]);
  ns(E, [pil(WX, WZ, WX + 1, WZ + 1)]);
  for (const x of [6.5, 13, 19.5, 26]) ns(E, [pil(x - 0.5, WZ, x + 0.5, WZ + 1)]);

  // ======================= Ring rails (waist-high brass) =======================
  const rail = { color: BRASS };
  const RT = R + 1.1;
  // along the Well: open where the planets dock (x 0.5..8.5 twins, 17.5..26.5 Saturn)
  ns(E, [
    mk(8.5, R, WZ, 17.5, RT, WZ + 0.3, 'plate', rail),
    mk(26.5, R, WZ, WX + 0.3, RT, WZ + 0.3, 'plate', rail),
  ]);
  E.push(mk(WX, R, -WZ, WX + 0.3, RT, WZ, 'plate', rail));
  // round the stairwells
  ns(E, [
    mk(yardHole[0] - 0.3, R, yardHole[2] - 0.3, yardHole[0], RT, yardHole[3], 'plate', rail),
    mk(yardHole[0], R, yardHole[2] - 0.3, OX, RT, yardHole[2], 'plate', rail),
    mk(galHole[0], R, galHole[2] - 0.3, galHole[1] + 0.3, RT, galHole[2], 'plate', rail),
    mk(galHole[1], R, galHole[2], galHole[1] + 0.3, RT, OZ, 'plate', rail),
  ]);
  // where the planets dock: amber strips on the deck's edge
  ns(E, [
    deco(mk(1, R, WZ, 8, R + 0.03, WZ + 0.3, 'glow', { color: DOCK })),
    deco(mk(18, R, WZ, 26, R + 0.03, WZ + 0.3, 'glow', { color: DOCK })),
  ]);
  for (const z of [WZ + 0.5, -WZ - 0.5]) {
    lightX(4.5, R + 0.8, z, DOCK, 5, 0.5);
    lightX(22, R + 0.8, z, DOCK, 5, 0.5);
  }

  // ======================= ramps up to the Ring =======================
  const deckRamp = { mat: 'wood' as Material, color: DECK_WOOD };
  // yards: along the back wall, rising toward the galleries' corners
  ns(E, [
    wedgeRamp(
      'z',
      yardHole[2],
      yardHole[3],
      0,
      R,
      (yardHole[0] + OX) / 2,
      OX - yardHole[0],
      deckRamp,
    ),
  ]);
  // galleries: along the back wall, rising toward the site
  ns(E, [
    wedgeRamp('x', galHole[1], galHole[0], 0, R, (galHole[2] + OZ) / 2, OZ - galHole[2], deckRamp),
  ]);

  // ======================= the Sun =======================
  // a dark iron pedestal (the brass spiral winds round it), crowned by the glowing gold top
  C.push(mk(-P, 0, -P, P, S - 0.4, P, 'pillar', { color: IRON }));
  C.push(mk(-P, S - 0.4, -P, P, S, P, 'plate', { color: GOLD, trim: SUNGLOW }));
  // solar flares on top (half cover) round the power-up
  for (const sx of SIGNS)
    for (const sz of SIGNS)
      C.push(mk(sx * 4.7, S, sz * 4.7, sx * 6.3, S + 1.1, sz * 6.3, 'glow', { color: SUNGLOW }));
  // the core glows through slits in its north and south faces (clear of the spiral and docks)
  for (const [x0, x1] of [
    [-7, -3.5],
    [-1.75, 1.75],
    [3.5, 7],
  ]) {
    C.push(deco(mk(x0, 1, -P - 0.05, x1, 9, -P, 'glow', { color: SUNGLOW })));
    C.push(deco(mk(x0, SL + 0.6, P, x1, 9, P + 0.05, 'glow', { color: SUNGLOW })));
  }
  // docks on the Sun's edge
  for (const z of [-P, P - 0.3]) {
    E.push(deco(mk(1, S, z, 8, S + 0.03, z + 0.3, 'glow', { color: DOCK })));
    lightX(4.5, S + 0.8, z < 0 ? -P - 0.5 : P + 0.5, DOCK, 5, 0.5);
  }
  light(0, S + 3.5, 0, SUNGLOW, 30, 1.6);
  light(0, 5, P + 4, SUNGLOW, 9, 0.8);
  light(0, 5, -P - 4, SUNGLOW, 9, 0.7);

  // the double spiral (east ramp; the west one is its mirror): from the gate along the south
  // face, a landing, up the east face to the NE landing at the Sun's height
  const ramp = { mat: 'plate' as Material, color: RAMP };
  const mid = (P + BAND) / 2;
  const W = BAND - P;
  E.push(wedgeRamp('x', G, P, 0, SL, mid, W, ramp));
  E.push(mk(P, 0, P, BAND, SL - 0.4, BAND, 'pillar', { color: IRON }));
  E.push(mk(P, SL - 0.4, P, BAND, SL, BAND, 'plate', { color: RAMP }));
  E.push(mk(P, 0, -P, BAND, SL, P, 'pillar', { color: IRON }));
  E.push(wedgeRamp('z', P, -P, SL, S, mid, W, ramp));
  E.push(mk(P, 0, -BAND, BAND, S - 0.4, -P, 'pillar', { color: IRON }));
  E.push(mk(P, S - 0.4, -BAND, BAND, S, -P, 'plate', { color: RAMP }));
  // rails on the spiral's outer edges (sloped along the ramps, flat round the landings): 0.9 m,
  // low enough that a player up there shows the chest to the Well below
  {
    const SR = 0.9;
    const run1 = P - G;
    const a1 = Math.atan2(SL, run1);
    const len1 = Math.hypot(run1, SL);
    E.push(
      turned(
        v3((G + P) / 2 - (SR / 2) * Math.sin(a1), SL / 2 + (SR / 2) * Math.cos(a1), BAND + 0.15),
        v3(len1 / 2, SR / 2, 0.15),
        'z',
        a1,
        'plate',
        rail,
      ),
    );
    E.push(mk(P, SL, BAND, BAND + 0.3, SL + SR, BAND + 0.3, 'plate', rail));
    E.push(mk(BAND, SL, P, BAND + 0.3, SL + SR, BAND, 'plate', rail));
    const run2 = 2 * P;
    const rise2 = S - SL;
    const a2 = Math.atan2(rise2, run2);
    const len2 = Math.hypot(run2, rise2);
    E.push(
      turned(
        v3(BAND + 0.15, (SL + S) / 2 + (SR / 2) * Math.cos(a2), (SR / 2) * Math.sin(a2)),
        v3(0.15, SR / 2, len2 / 2),
        'x',
        a2,
        'plate',
        rail,
      ),
    );
    E.push(mk(BAND, S, -BAND - 0.3, BAND + 0.3, S + SR, -P, 'plate', rail));
    E.push(mk(P, S, -BAND - 0.3, BAND, S + SR, -BAND, 'plate', rail));
  }

  // ======================= gears, hubs, teeth: the cover =======================
  // great gears in the Well (full cover, 7.5 m) between the Sun and Saturn's path
  ns(E, gear(GG.x, GG.y, GG.z, GG.r, GG.t, 12, 0.6));
  // gallery gears flanking the sites, in brass bearing blocks (2.2 m: the gear's low ends
  // never make cover between half and full height)
  ns(E, gear(GL.x, GL.y, GL.z, GL.r, GL.t, 8, 0.4));
  ns(E, [
    mk(GL.x - 0.7, 0, GL.z - GL.r - 0.05, GL.x + 0.7, 2.2, GL.z + GL.r + 0.05, 'plate', {
      color: GEAR,
    }),
  ]);
  // hubs (half cover): Well, sites, gallery corners
  ns(E, hub(22, 5, 1.2));
  ns(E, hub(10.5, 21, 1.2));
  ns(E, hub(3, 36, 1.1));
  ns(E, hub(33, 41, 1.2));
  // tall teeth (full cover)
  E.push(...tooth(28.5, 0, 0, true)); // the Well, in front of each yard
  ns(E, tooth(24, 0, 34, true)); // galleries
  ns(C, tooth(0, 0, 42.5, false)); // behind each site
  ns(E, tooth(30, R, 40, true)); // Ring corners
  E.push(...tooth(35.5, R, 0, true)); // Ring over the yard
  // brass half walls on the Ring (and a tooth over each site)
  ns(E, [
    mk(15.75, R, 33.5, 16.25, RT, 37.5, 'plate', rail),
    mk(33.5, R, 20.75, 37, RT, 21.25, 'plate', rail),
    mk(4.25, R, 32, 4.75, RT, 34.5, 'plate', rail),
  ]);
  ns(C, tooth(0, R, 41, false));

  // ======================= look: star charts, lamps, brass, the armillary =======================
  // star charts on the velvet above the Ring, lamps between them
  const dots: [number, number][] = [
    [-2.9, 2.2],
    [-0.8, 6.6],
    [1.7, 3.6],
    [3.2, 7.4],
    [-3.3, 5.8],
  ];
  const chartS = (x: number) => [
    deco(mk(x - 4.5, 9, OZ - 0.06, x + 4.5, 18, OZ, 'panel', { color: STARCHART })),
    ...dots.map(([dx, dy]) =>
      deco(
        mk(x + dx - 0.15, 9 + dy, OZ - 0.1, x + dx + 0.15, 9.3 + dy, OZ - 0.06, 'glow', {
          color: STAR,
        }),
      ),
    ),
  ];
  const chartE = (z: number) => [
    deco(mk(OX - 0.06, 9, z - 4.5, OX, 18, z + 4.5, 'panel', { color: STARCHART })),
    ...dots.map(([dz, dy]) =>
      deco(
        mk(OX - 0.1, 9 + dy, z + dz - 0.15, OX - 0.06, 9.3 + dy, z + dz + 0.15, 'glow', {
          color: STAR,
        }),
      ),
    ),
  ];
  ns(E, [...chartS(10), ...chartS(30), ...chartE(24)]);
  E.push(...chartE(0));
  const lampS = (x: number) =>
    deco(mk(x - 0.3, 12.7, OZ - 0.25, x + 0.3, 13.3, OZ, 'trim', { color: LAMP }));
  const lampE = (z: number) =>
    deco(mk(OX - 0.25, 12.7, z - 0.3, OX, 13.3, z + 0.3, 'trim', { color: LAMP }));
  ns(C, [lampS(0)]);
  ns(E, [lampS(20), lampS(40), lampE(12), lampE(36)]);
  for (const z of [OZ - 1, -OZ + 1]) for (const x of [0, 20, 40]) lightX(x, 12.5, z, LAMP, 13, 0.8);
  for (const z of [12, 36, -12, -36]) lightX(OX - 1, 12.5, z, LAMP, 13, 0.8);
  // brass skirting and cornice along the walls
  const brass = { color: BRASS };
  ns(E, [
    deco(mk(0, R, OZ - 0.2, OX, R + 0.4, OZ, 'plate', brass)),
    deco(mk(0, 20, OZ - 0.3, OX, 20.4, OZ, 'plate', brass)),
  ]);
  E.push(deco(mk(OX - 0.2, R, -OZ + 0.2, OX, R + 0.4, OZ - 0.2, 'plate', brass)));
  E.push(deco(mk(OX - 0.3, 20, -OZ + 0.3, OX, 20.4, OZ - 0.3, 'plate', brass)));
  // lamps hanging under the deck (galleries, yards)
  const hang = (x: number, z: number) =>
    deco(mk(x - 0.3, U - 0.35, z - 0.3, x + 0.3, U, z + 0.3, 'trim', { color: LAMP }));
  ns(C, [hang(0, 44)]);
  ns(E, [hang(17, 44), hang(38, 43), hang(39, 22)]);
  E.push(hang(39, 6));
  E.push(hang(39, -6));
  for (const z of [43, -43]) for (const x of [0, 17, 38]) lightX(x, 4.6, z, LAMP, 10, 0.8);
  for (const z of [22, -22, 6, -6]) lightX(39, 4.6, z, LAMP, 9, 0.7);
  lightX(20, 4.6, 36, LAMP, 8, 0.5);
  lightX(20, 4.6, -36, LAMP, 8, 0.5);
  // warm light on the great gears
  for (const z of [GG.z, -GG.z]) lightX(GG.x, 9, z, LAMP, 10, 0.5);
  // the orbit line on the Well's floor round the Sun (an octagon, apothem 17.5)
  {
    const a = 17.5;
    const half = a * Math.tan(Math.PI / 8) + 0.15;
    for (let k = 0; k < 8; k++) {
      const th = (k * Math.PI) / 4;
      const c = v3(rd(a * Math.cos(th)), 0.01, rd(a * Math.sin(th)));
      C.push(deco(turned(c, v3(0.15, 0.01, half), 'y', -th, 'plate', brass)));
    }
  }
  // the armillary: two brass rings hanging over the Sun from the dome's ribs
  const armillary = (a: number, y: number, th: number) => {
    const half = a * Math.tan(Math.PI / 8) + th;
    for (let k = 0; k < 8; k++) {
      const t = (k * Math.PI) / 4;
      const c = v3(rd(a * Math.cos(t)), y, rd(a * Math.sin(t)));
      C.push(deco(turned(c, v3(th, th, half), 'y', -t, 'plate', brass)));
    }
    for (const [x, z] of [
      [a, 0],
      [-a, 0],
      [0, a],
      [0, -a],
    ])
      C.push(
        deco(
          mk(x - 0.1, y + th, z - 0.1, x + 0.1, O.dome - 0.6, z + 0.1, 'plate', {
            color: BRASS_DARK,
          }),
        ),
      );
  };
  armillary(20, 18, 0.3);
  armillary(13, 21, 0.25);
  // the dome's ribs
  const ribs = { color: BRASS_DARK };
  C.push(deco(mk(-OX, O.dome - 0.6, -0.4, OX, O.dome, 0.4, 'plate', ribs)));
  C.push(deco(mk(-0.4, O.dome - 0.6, -OZ, 0.4, O.dome, OZ, 'plate', ribs)));
  ns(C, [deco(mk(-OX, O.dome - 0.6, 22.6, OX, O.dome, 23.4, 'plate', ribs))]);
  E.push(deco(mk(22.6, O.dome - 0.6, -OZ, 23.4, O.dome, OZ, 'plate', ribs)));
  light(0, 22, 0, 0x6f8cff, 45, 0.35);

  // ======================= sites =======================
  for (const st of [O.bombSites.A, O.bombSites.B]) {
    const w = 0.12;
    const t = { color: SITE };
    C.push(deco(mk(st.min.x, 0.01, st.min.z, st.max.x, 0.05, st.min.z + w, 'trim', t)));
    C.push(deco(mk(st.min.x, 0.01, st.max.z - w, st.max.x, 0.05, st.max.z, 'trim', t)));
    C.push(deco(mk(st.min.x, 0.01, st.min.z + w, st.min.x + w, 0.05, st.max.z - w, 'trim', t)));
    C.push(deco(mk(st.max.x - w, 0.01, st.min.z + w, st.max.x, 0.05, st.max.z - w, 'trim', t)));
    light(0, 3, (st.min.z + st.max.z) / 2, 0xff6a5a, 8, 0.5);
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
    // the Tower: a team-coloured column from the yard's floor to the deck
    T.push(mk(tp.x - 1, 0, -1, tp.x + 1, U, 1, tmat, { trim: tc }));
    towers.push({ team, pos: tp, radius: 1.5, height: 4 });
    homes.push(v3(s * 41.5, 0.9, 0));
    for (const x of [50, 54])
      for (const z of [-4.5, -1.5, 1.5, 4.5])
        spawns.push({ pos: v3(s * x, 0, z), yawDeg: team === 0 ? -90 : 90, team });
    // team colour: over each exit (outside) and on the room's back wall
    for (const n of SIGNS)
      T.push(
        deco(mk(s * (OX - 0.1), 3.25, n * 11.2, s * OX, 3.45, n * 14.8, 'trim', { color: tc })),
      );
    T.push(deco(mk(s * (SP.x1 - 0.1), 1, -6, s * SP.x1, 4.5, 6, tmat)));
    light(s * 52, 4, 0, tc, 11, 0.9);
    light(s * 52, 3.5, 12.5, tc, 6, 0.5);
    light(s * 52, 3.5, -12.5, tc, 6, 0.5);
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
    boundsMin: v3(-58, -2, -OZ - 0.6),
    boundsMax: v3(58, O.dome + 1, OZ + 0.6),
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
      { name: 'Cyan spawn', pos: v3(-52, 0, 0), yawDeg: -90 },
      { name: 'Orange spawn', pos: v3(52, 0, 0), yawDeg: 90 },
      { name: 'The Sun', pos: v3(0, S, 2), yawDeg: 180 },
      { name: 'Sun gate (spiral)', pos: v3(0, 0, 14), yawDeg: 0 },
      { name: 'A site (north gallery)', pos: v3(0, 0, -38), yawDeg: 180 },
      { name: 'B site (south gallery)', pos: v3(0, 0, 38), yawDeg: 0 },
      { name: 'Ring, north', pos: v3(0, R, -38), yawDeg: 180 },
      { name: 'Ring, east', pos: v3(40, R, 0), yawDeg: 90 },
      { name: 'West yard', pos: v3(-37.5, 0, 8), yawDeg: -90 },
      { name: 'The Well', pos: v3(-22, 0, 0), yawDeg: -90 },
      { name: 'Mercury dock', pos: v3(-4.5, R, -33), yawDeg: 180 },
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
        // a banded giant hanging over the dome, a pale moon, a far red one
        { dir: v3(0.35, 0.8, -0.49), sizeDeg: 20, color: 0x9fb2e6 },
        { dir: v3(-0.62, 0.6, 0.5), sizeDeg: 3.5, color: 0xe6e0d0 },
        { dir: v3(0.8, 0.35, 0.49), sizeDeg: 1.5, color: 0xd98a6a },
      ],
    },
  };
};

/**
 * Bot waypoints (static routes only: none is on or over a planet's path at the Ring or the
 * Sun's edge). Authored in the south-east quarter and mirrored: a name gets 'N'/'S' when it is
 * mirrored north ↔ south and 'E'/'W' when mirrored east ↔ west ('galRampTopSE'). Nodes on
 * x = 0 or z = 0 have no copy there; the Sun's spiral is mirrored east ↔ west only.
 */
const waypoints = (): WaypointDef[] => {
  const R = ORRERY.ring;
  const S = ORRERY.sun;
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
  /** link two bases in every mirrored copy (`south`: only the south copies) */
  const link = (a: string, b: string, south = false) => {
    for (const n of south ? [1 as Sign] : SIGNS)
      for (const s of SIGNS) {
        const i = idx(nameOf(a, s, n));
        const j = idx(nameOf(b, s, n));
        if (i === j) continue;
        if (!wps[i].links.includes(j)) wps[i].links.push(j);
        if (!wps[j].links.includes(i)) wps[j].links.push(i);
      }
  };
  const chain = (...names: string[]) => {
    for (let i = 1; i < names.length; i++) link(names[i - 1], names[i]);
  };

  // spawn room, vestibules, yard, Tower
  add('spawn', 50, 0, 0);
  add('room', 55, 0, 6.5);
  add('vest', 55, 0, 12.5);
  add('vestOut', 48.5, 0, 12.5);
  add('yardV', 43.5, 0, 13);
  add('tower', 41.5, 0, 0);
  add('yard', 37.5, 0, 8);
  add('yardEnd', 36.5, 0, 24);
  add('rampMid', 43.5, 3, 23);
  add('rampTop', 43.5, R, 33);
  // the Well
  add('colo', 29, 0, 4);
  add('well', 22, 0, 0);
  add('wellMid', 21, 0, 11);
  add('gearOut', 21, 0, 20);
  add('corner', 15.5, 0, 10.5);
  add('field', 6, 0, 20);
  add('siteGate', 0, 0, 27);
  add('archWell', 17.5, 0, 28);
  // galleries and sites ('siteS' = B, 'siteN' = A)
  add('arch', 16.25, 0, 34);
  add('gal', 21, 0, 39);
  add('galEnd', 38, 0, 37);
  add('galMid', 13.5, 0, 39.5);
  add('site', 0, 0, 39);
  add('galRampFoot', 28, 0, 43.75);
  add('galRampTop', 10, R, 43.75);
  // the Ring
  add('ringSite', 0, R, 38);
  add('ringS1', 8, R, 37);
  add('ringS2', 22, R, 39.5);
  add('ringCorner', 37, R, 36);
  add('ringYard2', 38.8, R, 25);
  add('ringYard1', 38.8, R, 12);
  add('ringYard0', 40, R, 0);
  // the Sun: the gate (south only), the spiral (east / west), the top
  add('gate', 0, 0, 14, { z: false });
  add('sr0', 0, 0, 11, { z: false });
  add('sr1', 5.25, 1.8, 10.5, { z: false });
  add('srL', 10.5, ORRERY.spiralLanding, 10.5, { z: false });
  add('sr2', 10.5, 7.8, 0);
  add('srTop', 10.5, S, -10.5, { z: false });
  add('sunSide', 5, S, 0);
  add('sunN', 0, S, -6, { z: false });
  add('sunC', 0, S, 2, { z: false });

  chain('spawn', 'room', 'vest', 'vestOut', 'yardV', 'yard', 'tower');
  chain('yardV', 'rampMid', 'rampTop', 'ringCorner');
  chain('yard', 'colo', 'well');
  chain('yard', 'yardEnd', 'galEnd', 'gal', 'arch', 'archWell', 'gearOut', 'wellMid', 'colo');
  chain('wellMid', 'corner', 'field', 'siteGate', 'site', 'galMid', 'arch');
  chain('gal', 'galRampFoot', 'galRampTop', 'ringS1', 'ringSite');
  chain('ringS1', 'ringS2', 'ringCorner', 'ringYard2', 'ringYard1', 'ringYard0');
  link('field', 'gate', true);
  chain('gate', 'sr0', 'sr1', 'srL', 'sr2', 'srTop', 'sunSide', 'sunC', 'sunN');
  return wps;
};
