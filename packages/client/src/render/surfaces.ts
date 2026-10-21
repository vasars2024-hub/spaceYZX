// Real-looking level surfaces (plaster, sandstone, rock strata, concrete, planks, steel panels…),
// all generated in code when the first level loads: nothing is downloaded, and every PC draws
// exactly the same pixels (our own seeded noise, no Math.random).
//
// How it works, in short:
// - Each surface kind is a small function that says how bright a point of the texture is
//   (around 1 = the box's own colour, darker in seams and cracks, lighter on rivets and
//   ridges). It is mostly grey, so the per-box `color` the map picks still tints it: one sandstone
//   texture serves a red, an ochre and a white sandstone wall.
// - All kinds are stacked into ONE texture array, so the whole textured level is drawn in a single
//   draw call (each vertex says which layer it uses).
// - The texture repeats every few metres in world space (no stretching on 30 m walls or 300 m
//   floors). To hide the repeat on big surfaces, a second, very large "macro" noise adds soft
//   lighter/darker patches over tens of metres, and natural surfaces (sand, rock) blend in a
//   second, differently scaled copy of themselves.
// - Low quality presets skip the macro / blend lookups and use smaller textures (one texture
//   lookup per pixel, like before).
import * as THREE from 'three';

/** The textured surface kinds (layers of the texture array). */
export const SURFACES = [
  'plain', // flat colour (paper, leaves, water)
  'hull', // light industrial steel panels with rivets
  'panel', // painted plaster wall with faint blocks and grime
  'sandstone', // sandstone block wall
  'sandFloor', // sand ground with wind ripples
  'strata', // layered rock cliff
  'rockGround', // cracked rock ground
  'paving', // cobblestone paving
  'tiles', // concrete wall tiles
  'concrete', // concrete floor slabs with saw-cut seams
  'wood', // wooden planks
  'crate', // wooden crate face (frame + brace), one per box face
  'pillar', // cast concrete column (formwork lines, tie holes)
  'grate', // metal floor grating
] as const;
export type Surface = (typeof SURFACES)[number];

export interface SurfaceSpec {
  /** metres per texture repeat; null = the texture fits each box face (crates) */
  scale: number | null;
  /**
   * 0..1: how much of a second, differently scaled copy is blended in (hides the repeat on
   * natural surfaces; 0 for anything with straight seams, which would show double lines)
   */
  blend: number;
  /** average brightness after normalising (1 = the box's colour; grating is darker: holes) */
  mean: number;
}

export const SURFACE_SPEC: Record<Surface, SurfaceSpec> = {
  plain: { scale: 8, blend: 0, mean: 1 },
  hull: { scale: 6, blend: 0, mean: 1 },
  panel: { scale: 6, blend: 0, mean: 1 },
  sandstone: { scale: 6, blend: 0, mean: 1 },
  sandFloor: { scale: 10, blend: 1, mean: 1 },
  strata: { scale: 16, blend: 0.6, mean: 1 },
  rockGround: { scale: 10, blend: 1, mean: 1 },
  paving: { scale: 4, blend: 0, mean: 1 },
  tiles: { scale: 4, blend: 0, mean: 1 },
  concrete: { scale: 8, blend: 0, mean: 1 },
  wood: { scale: 4, blend: 0, mean: 1 },
  crate: { scale: null, blend: 0, mean: 1 },
  pillar: { scale: 4, blend: 0, mean: 1 },
  grate: { scale: 2, blend: 0, mean: 0.8 },
};

/** Metres per repeat of the large soft "macro" patches. */
export const MACRO_SCALE = 56;

export const surfaceLayer = (s: Surface): number => SURFACES.indexOf(s);

// ---------------------------------------------------------------------------------------------
// Seeded, tileable noise (everything repeats exactly once per texture so the tiles join up)

const ihash = (x: number, y: number, s: number): number => {
  let h =
    Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const wrap = (a: number, p: number): number => ((a % p) + p) % p;
const fade = (t: number): number => t * t * (3 - 2 * t);
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const fract = (x: number): number => x - Math.floor(x);
const dist = (x: number, y: number): number => Math.sqrt(x * x + y * y);

/** Value noise (0..1) repeating once per texture; px × py lattice cells across it. */
const vnoiseSlow = (u: number, v: number, px: number, py: number, s: number): number => {
  const x = u * px;
  const y = v * py;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const x0 = wrap(ix, px);
  const x1 = wrap(ix + 1, px);
  const y0 = wrap(iy, py);
  const y1 = wrap(iy + 1, py);
  const a = ihash(x0, y0, s);
  const b = ihash(x1, y0, s);
  const c = ihash(x0, y1, s);
  const d = ihash(x1, y1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};

// Noise is the slow part of drawing a texture, so while a texture is drawn every noise field it
// asks for is first computed once as a whole image (a tight loop), then read back per texel.
let imgSize = 0;
/** the texel being drawn (its own coordinates read the images directly) */
let curU = -1;
let curV = -1;
let curI = 0;
// (a short list searched in order: much faster than a Map for the handful of fields a texture uses)
const imageKeys: number[] = [];
const imageList: Float32Array[] = [];

/** A value-noise field (one octave) added into `out` with weight `amp`, as a whole image. */
const addNoiseImage = (out: Float32Array, px: number, py: number, s: number, amp: number) => {
  const n = imgSize;
  const lat = new Float32Array(px * py);
  for (let y = 0; y < py; y++) for (let x = 0; x < px; x++) lat[y * px + x] = ihash(x, y, s);
  const x0 = new Int32Array(n);
  const x1 = new Int32Array(n);
  const fx = new Float32Array(n);
  for (let x = 0; x < n; x++) {
    const t = ((x + 0.5) / n) * px;
    const i = Math.floor(t);
    x0[x] = i % px;
    x1[x] = (i + 1) % px;
    fx[x] = fade(t - i);
  }
  for (let y = 0; y < n; y++) {
    const t = ((y + 0.5) / n) * py;
    const i = Math.floor(t);
    const r0 = (i % py) * px;
    const r1 = ((i + 1) % py) * px;
    const fy = fade(t - i);
    const row = y * n;
    for (let x = 0; x < n; x++) {
      const a = lat[r0 + x0[x]];
      const b = lat[r0 + x1[x]];
      const c = lat[r1 + x0[x]];
      const d = lat[r1 + x1[x]];
      const f = fx[x];
      out[row + x] += amp * (a + (b - a) * f + (c - a) * fy + (a - b - c + d) * f * fy);
    }
  }
};

const fbmImage = (px: number, py: number, octaves: number, s: number): Float32Array => {
  const key = ((px * 4099 + py) * 16 + octaves) * 65537 + s;
  for (let i = 0; i < imageKeys.length; i++) if (imageKeys[i] === key) return imageList[i];
  const img = new Float32Array(imgSize * imgSize);
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) norm += 0.5 ** (i + 1);
  for (let i = 0; i < octaves; i++) {
    addNoiseImage(img, px << i, py << i, s + i * 101, amp / norm);
    amp *= 0.5;
  }
  imageKeys.push(key);
  imageList.push(img);
  return img;
};

/** Read an image at (u, v) (wrapping, smooth between texels). */
const sample = (img: Float32Array, u: number, v: number): number => {
  if (u === curU && v === curV) return img[curI];
  const n = imgSize;
  const x = u * n - 0.5;
  const y = v * n - 0.5;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const xa = wrap(ix, n);
  const xb = (xa + 1) % n;
  const ya = wrap(iy, n) * n;
  const yb = ((wrap(iy, n) + 1) % n) * n;
  const a = img[ya + xa];
  const b = img[ya + xb];
  const c = img[yb + xa];
  const d = img[yb + xb];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};

/** Fractal noise (0..1): octaves of value noise, each twice as fine. Tiles once per texture. */
export const fbm = (
  u: number,
  v: number,
  px: number,
  py: number,
  octaves: number,
  s: number,
): number => {
  if (imgSize > 0) return sample(fbmImage(px, py, octaves, s), u, v);
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoiseSlow(u, v, px << i, py << i, s + i * 101);
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
};

/** One octave of value noise (0..1). */
export const vnoise = (u: number, v: number, px: number, py: number, s: number): number =>
  fbm(u, v, px, py, 1, s);

/** Cell noise result (reused object: no garbage in the pixel loops). */
const cell = { f1: 0, f2: 0, id: 0 };
const cellKeys: number[] = [];
const cellList: Float32Array[] = [];
/**
 * Tileable cell (Worley) noise: distance to the nearest (f1) and second nearest (f2) jittered
 * point, in cell units, and a random id of the nearest cell. f2 - f1 small = near a cell edge.
 */
const worley = (u: number, v: number, cx: number, cy: number, s: number, jitter = 1) => {
  const key = ((cx * 4099 + cy) * 65537 + s) * 8 + Math.round(jitter * 4);
  let tab: Float32Array | null = null;
  for (let i = 0; i < cellKeys.length; i++) if (cellKeys[i] === key) tab = cellList[i];
  if (!tab) {
    tab = new Float32Array(cx * cy * 3);
    for (let y = 0; y < cy; y++)
      for (let x = 0; x < cx; x++) {
        const i = (y * cx + x) * 3;
        tab[i] = 0.5 + (ihash(x, y, s) - 0.5) * jitter;
        tab[i + 1] = 0.5 + (ihash(x, y, s + 1) - 0.5) * jitter;
        tab[i + 2] = ihash(x, y, s + 2);
      }
    cellKeys.push(key);
    cellList.push(tab);
  }
  const x = u * cx;
  const y = v * cy;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const wx = wrap(ix, cx);
  const wy = wrap(iy, cy);
  let f1 = 81;
  let f2 = 81;
  let id = 0;
  for (let dy = -1; dy <= 1; dy++) {
    const ry = wy + dy;
    const row = (ry < 0 ? ry + cy : ry >= cy ? ry - cy : ry) * cx;
    const oy = y - iy - dy;
    for (let dx = -1; dx <= 1; dx++) {
      const rx = wx + dx;
      const i = (row + (rx < 0 ? rx + cx : rx >= cx ? rx - cx : rx)) * 3;
      const ddx = x - ix - dx - tab[i];
      const ddy = oy - tab[i + 1];
      const d = ddx * ddx + ddy * ddy;
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = tab[i + 2];
      } else if (d < f2) f2 = d;
    }
  }
  cell.f1 = Math.sqrt(f1);
  cell.f2 = Math.sqrt(f2);
  cell.id = id;
  return cell;
};

// ---------------------------------------------------------------------------------------------
// The surfaces. Each draws one texel: u, v in 0..1 across the texture (v = up on walls), `px` =
// metres per texel (for soft, alias-free edges), writes brightness (r, g, b) into `o`.

type Px = (u: number, v: number, o: number[], px: number) => void;

/** 0 inside a line `w` metres wide (distance d from its middle), 1 outside, soft edge. */
const line = (d: number, w: number, px: number): number => smooth(w * 0.5 - px, w * 0.5 + px, d);
const set = (o: number[], t: number, r = 1, g = 1, b = 1): void => {
  o[0] = t * r;
  o[1] = t * g;
  o[2] = t * b;
};

/** Running brick bond: which block, where inside it (metres), distance to its edge. */
const brick = { id: 0, bu: 0, bv: 0, edge: 0, row: 0 };
const bricks = (
  mu: number,
  mv: number,
  size: number,
  w: number,
  h: number,
  offset: (row: number) => number,
  s: number,
) => {
  const rows = Math.round(size / h);
  const cols = Math.round(size / w);
  const row = wrap(Math.floor(mv / h), rows);
  const su = wrap(mu + offset(row), size);
  const col = Math.floor(su / w);
  brick.bu = su - col * w;
  brick.bv = wrap(mv, h);
  brick.edge = Math.min(brick.bu, w - brick.bu, brick.bv, h - brick.bv);
  brick.id = ihash(wrap(col, cols), row, s);
  brick.row = row;
  return brick;
};

/** Wood grain along u (boards) with a random phase per board. */
const grain = (u: number, v: number, across: number, id: number, s: number): number => {
  const g = fbm(u + id * 0.37, v, 3, 96, 3, s);
  const rings = Math.sin((across * 30 + g * 7 + id * 11) * Math.PI * 2);
  const fibre = vnoise(u + id * 0.5, v, 48, 512, s + 9) - 0.5;
  return 1 + rings * 0.07 + fibre * 0.1 + (g - 0.5) * 0.12;
};

const kinds = (S: number): Record<Surface, Px> => ({
  plain: (_u, _v, o) => set(o, 1),

  hull: (u, v, o, px) => {
    const W = SURFACE_SPEC.hull.scale!;
    const mu = u * W;
    const mv = v * W;
    // 2 m × 3 m plates
    const pu = wrap(mu, 2);
    const pv = wrap(mv, 3);
    const id = ihash(Math.floor(mu / 2), Math.floor(mv / 3), 11);
    const edge = Math.min(pu, 2 - pu, pv, 3 - pv);
    let t = 0.93 + 0.14 * id;
    t *= 1 + 0.06 * (fbm(u, v, 96, 4, 3, 21) - 0.5); // brushed, vertical
    t *= 1 + 0.16 * (fbm(u, v, 4, 4, 4, 23) - 0.5); // soft wear
    // seam with a lit upper/left lip and a shaded lower/right one
    t *= 0.3 + 0.7 * line(edge, 0.022, px);
    if (edge < 0.05 && edge > 0.011) t *= pu < 0.05 || pv > 2.95 ? 1.14 : 0.86;
    // rivets 7 cm in from every seam, every 25 cm
    const ins = 0.075;
    const au = wrap(pv, 0.25) - 0.125;
    const av = wrap(pu, 0.25) - 0.125;
    const r = Math.min(
      dist(pu - ins, au),
      dist(2 - ins - pu, au),
      dist(pv - ins, av),
      dist(3 - ins - pv, av),
    );
    if (r < 0.03) t *= r < 0.019 ? 1.35 - 0.5 * (r / 0.019) ** 2 : 0.62;
    // a stiffener rib across the middle of each plate
    const rib = Math.abs(pv - 1.5);
    if (rib < 0.06) t *= rib < 0.045 ? 1.07 : 0.8;
    // rust stains running down from the seams
    const rust = smooth(0.6, 0.85, fbm(u, v, 64, 3, 3, 31)) * smooth(1.2, 0, 3 - pv);
    const k = rust * 0.6;
    set(o, t * (1 - 0.15 * k), 0.98 + 0.05 * k, 1 - 0.05 * k, 1.03 - 0.25 * k);
  },

  panel: (u, v, o, px) => {
    const W = SURFACE_SPEC.panel.scale!;
    const b = bricks(u * W, v * W, W, 1.5, 0.75, (row) => (row % 2) * 0.75, 41);
    let t = 1 + 0.035 * (b.id - 0.5);
    t *= 1 - 0.14 * (1 - smooth(0.004, 0.02 + px, b.edge)); // painted-over block joints
    t *= 1 + 0.14 * (fbm(u, v, 10, 10, 5, 43) - 0.5); // plaster
    t *= 1 + 0.07 * (vnoise(u, v, S / 2, S / 2, 45) - 0.5); // fine speckle
    // paint worn off in patches
    const flake = smooth(0.7, 0.73, fbm(u, v, 12, 12, 4, 47));
    t *= 1 - 0.09 * flake;
    // rain / dirt streaks running down
    t *= 1 - 0.12 * smooth(0.55, 0.85, fbm(u, v, 40, 3, 3, 53));
    set(o, t, 1 + 0.03 * flake, 1, 1 - 0.06 * flake);
  },

  sandstone: (u, v, o, px) => {
    const W = SURFACE_SPEC.sandstone.scale!;
    const wu = (fbm(u, v, 24, 24, 2, 61) - 0.5) * 0.05;
    const wv = (fbm(u, v, 24, 24, 2, 63) - 0.5) * 0.05;
    const b = bricks(u * W + wu, v * W + wv, W, 1.5, 0.75, (row) => ihash(row, 0, 65) * 1.5, 67);
    const id = b.id;
    const hue = ihash(Math.floor(id * 1e6), 1, 69) - 0.5;
    let t = 0.93 + 0.14 * id;
    t *= 1 + 0.2 * (fbm(u, v, 6, 6, 4, 77) - 0.5); // weathering across blocks
    t *= 1 + 0.16 * (fbm(u, v, 48, 48, 3, 71) - 0.5); // grain
    t *= 1 + 0.04 * Math.sin((b.bv * 22 + fbm(u, v, 8, 8, 2, 73) * 3) * Math.PI * 2); // bedding
    const pit = worley(u, v, 70, 70, 75);
    if (pit.f1 < 0.14 && pit.id > 0.7) t *= 0.8;
    // weathered, rounded block edges then the mortar joint
    // weathered, rounded block edges: lit on top, shaded underneath, then the joint
    const top = b.bv > 0.375;
    t *= top
      ? 1 + 0.08 * (1 - smooth(0.01, 0.06, b.edge))
      : 0.86 + 0.14 * smooth(0.01, 0.07, b.edge);
    const joint = line(b.edge, 0.02, px);
    t = t * joint + 0.76 * (1 - joint);
    set(o, t, 1 + 0.05 * hue, 1, 1 - 0.07 * hue);
  },

  sandFloor: (u, v, o) => {
    const warp = fbm(u, v, 4, 4, 3, 81);
    const phase = fract(v * 28 + u * 5 + warp * 3.2);
    const prof = phase < 0.72 ? phase / 0.72 : (1 - phase) / 0.28; // gentle back, steep front
    const calm = smooth(0.3, 0.7, fbm(u, v, 3, 3, 2, 83));
    let t = 1 + 0.18 * (prof - 0.5) * calm;
    t *= 1 + 0.14 * (fbm(u, v, 6, 6, 4, 85) - 0.5);
    t *= 1 + 0.12 * (vnoise(u, v, S / 2, S / 2, 87) - 0.5); // grains
    const peb = worley(u, v, 80, 80, 89);
    if (peb.f1 < 0.16 && peb.id > 0.82) t *= peb.id > 0.93 ? 1.25 : 0.72;
    set(o, t);
  },

  strata: (u, v, o) => {
    const h = v + 0.03 * (fbm(u, v, 5, 5, 4, 91) - 0.5) + 0.008 * (fbm(u, v, 32, 32, 3, 93) - 0.5);
    const band = fbm(0.5, h, 1, 18, 3, 95); // thick and thin layers
    const tone = fbm(0.25, h, 1, 7, 2, 97); // colour of the layer group
    let t = 0.66 + 0.68 * band;
    t *= 1 + 0.05 * Math.sin(h * 96 * Math.PI * 2); // fine laminations
    // eroded grooves between layer groups
    const g = fract(h * 6 + 0.5 * fbm(u, 0.3, 4, 1, 2, 99));
    if (g < 0.05) t *= 0.62 + 7.6 * g;
    // mostly vertical cracks, here and there
    const c = worley(u, v, 9, 3, 101, 0.9);
    const where = smooth(0.5, 0.62, fbm(u, v, 6, 6, 2, 105));
    t *= 1 - 0.35 * where * (1 - smooth(0.01, 0.04, c.f2 - c.f1));
    t *= 1 + 0.2 * (fbm(u, v, 40, 40, 3, 103) - 0.5); // rough face
    const hue = tone - 0.5;
    set(o, t, 1 + 0.12 * hue, 1, 1 - 0.16 * hue);
  },

  rockGround: (u, v, o) => {
    const c = worley(u, v, 9, 9, 111, 0.9);
    const where = smooth(0.4, 0.55, fbm(u, v, 5, 5, 2, 117));
    const crack = 1 - where * (1 - smooth(0.01, 0.045, c.f2 - c.f1));
    let t = (0.9 + 0.2 * c.id) * (0.55 + 0.45 * crack);
    t *= 1 + 0.3 * (fbm(u, v, 6, 6, 4, 119) - 0.5);
    t *= 1 + 0.24 * (fbm(u, v, 24, 24, 4, 113) - 0.5);
    const peb = worley(u, v, 64, 64, 115);
    if (peb.f1 < 0.2 && peb.id > 0.75) t *= 1.2 - peb.f1;
    // sand drifted into the cracks
    const dust = (1 - crack) * 0.5;
    set(o, t + dust * 0.3, 1 + 0.03 * dust, 1, 1 - 0.06 * dust);
  },

  paving: (u, v, o) => {
    const c = worley(u, v, 12, 12, 121, 0.75);
    const edge = c.f2 - c.f1;
    const stone = smooth(0.06, 0.13, edge);
    const hue = ihash(Math.floor(c.id * 1e6), 3, 123) - 0.5;
    let t = (0.82 + 0.36 * c.id) * (1.12 - 0.25 * c.f1); // rounded tops
    t *= 1 + 0.14 * (fbm(u, v, 48, 48, 3, 125) - 0.5);
    t = t * stone + (0.42 + 0.2 * vnoise(u, v, 96, 96, 127)) * (1 - stone);
    set(o, t, 1 + 0.06 * hue * stone, 1, 1 - 0.06 * hue * stone);
  },

  tiles: (u, v, o, px) => {
    const W = SURFACE_SPEC.tiles.scale!;
    const b = bricks(u * W, v * W, W, 1, 1, () => 0, 131);
    let t = 0.94 + 0.12 * b.id;
    t *= 1 + 0.12 * (fbm(u, v, 16, 16, 4, 133) - 0.5);
    t *= 1 + 0.06 * (vnoise(u, v, S / 2, S / 2, 135) - 0.5);
    t *= 0.88 + 0.12 * smooth(0.01, 0.04, b.edge);
    t *= 0.5 + 0.5 * line(b.edge, 0.016, px);
    set(o, t);
  },

  concrete: (u, v, o, px) => {
    const W = SURFACE_SPEC.concrete.scale!;
    const mu = wrap(u * W, 4);
    const mv = wrap(v * W, 4);
    const edge = Math.min(mu, 4 - mu, mv, 4 - mv);
    let t = 1 + 0.26 * (fbm(u, v, 8, 8, 5, 141) - 0.5); // mottled pour
    const agg = vnoise(u, v, 320, 320, 143);
    t *= agg > 0.78 ? 0.86 : agg < 0.16 ? 1.1 : 1; // aggregate specks
    t *= 1 - 0.13 * smooth(0.58, 0.75, fbm(u, v, 3, 3, 4, 145)); // old stains
    t *= 1 - 0.06 * (1 - smooth(0.01, 0.09, edge)); // dirt by the seams
    t *= 0.35 + 0.65 * line(edge, 0.014, px); // saw cut
    set(o, t, 1.01, 1, 0.98);
  },

  wood: (u, v, o, px) => {
    const W = SURFACE_SPEC.wood.scale!;
    const b = bricks(u * W, v * W, W, 2, 0.2, (row) => ihash(row, 0, 151) * 2, 153);
    let t = (0.8 + 0.4 * b.id) * grain(u, v, b.bv, b.id, 155);
    // a knot on some boards
    const kx = 0.3 + ihash(Math.floor(b.id * 1e6), 5, 157) * 1.4;
    const kd = dist((b.bu - kx) / 0.045, (b.bv - 0.1) / 0.028);
    if (b.id > 0.55 && kd < 1.6) t *= kd < 1 ? 0.5 + 0.35 * kd : 0.85 + 0.25 * (kd - 1);
    t *= 0.82 + 0.18 * smooth(0.005, 0.016, b.edge);
    t *= 0.35 + 0.65 * line(b.edge, 0.008, px);
    const dark = Math.max(0, 1 - t);
    set(o, t, 1 + 0.04 * dark, 1, 1 - 0.1 * dark);
  },

  crate: (u, v, o, px) => {
    // one face: a frame of boards, a diagonal brace, planks behind (u, v 0..1 across the face)
    const f = 0.12;
    const p = px / 1.5; // (a crate face is about 1.5 m)
    const inFrame = u < f || u > 1 - f || v < f || v > 1 - f;
    const diag = Math.abs(u - v) / Math.SQRT2;
    const inBrace = !inFrame && diag < 0.065;
    let t: number;
    if (inFrame) {
      const vertical = (u < f || u > 1 - f) && v > f && v < 1 - f;
      const id = vertical ? (u < f ? 0.3 : 0.7) : v < f ? 0.5 : 0.9;
      t = (0.96 + 0.2 * id) * grain(vertical ? v : u, vertical ? u : v, 0, id, 161);
      // board outline and the joint between the frame boards
      const e = Math.min(u, 1 - u, v, 1 - v, Math.abs(Math.min(u, 1 - u, v, 1 - v) - f));
      t *= 0.55 + 0.45 * smooth(0.002, 0.012 + p, e);
    } else if (inBrace) {
      t = 1.04 * grain(u + v, u - v, diag, 0.2, 163);
      t *= 0.6 + 0.4 * smooth(0.055, 0.045, diag); // edge
    } else {
      // recessed planks: 5 boards, darker in the frame's and brace's shadow
      const pv = wrap((v - f) / (1 - 2 * f), 1 / 5) * 5;
      const id = ihash(Math.floor(((v - f) / (1 - 2 * f)) * 5), 0, 165);
      t = (0.72 + 0.3 * id) * grain(u, v, pv * 0.2, id, 167);
      t *= 0.45 + 0.55 * smooth(0, 0.08, Math.min(pv, 1 - pv) * 0.25);
      const shadow = Math.min(u - f, 1 - f - u, v - f, 1 - f - v, Math.max(0, diag - 0.065));
      t *= 0.6 + 0.4 * smooth(0, 0.05, shadow);
    }
    // nails at the frame corners and brace ends
    for (const [nx, ny] of [
      [0.06, 0.06],
      [0.94, 0.06],
      [0.06, 0.94],
      [0.94, 0.94],
      [0.19, 0.19],
      [0.81, 0.81],
    ]) {
      const d = dist(u - nx, v - ny);
      if (d < 0.014) t *= d < 0.009 ? 1.4 : 0.5;
    }
    const dark = Math.max(0, 1 - t);
    set(o, t, 1 + 0.04 * dark, 1, 1 - 0.1 * dark);
  },

  pillar: (u, v, o, px) => {
    const W = SURFACE_SPEC.pillar.scale!;
    const mu = u * W;
    const mv = v * W;
    const strip = Math.floor(mu / 0.4);
    let t = 1 + 0.05 * (ihash(wrap(strip, 10), 0, 171) - 0.5); // formwork boards
    t *= 0.9 + 0.1 * line(Math.min(wrap(mu, 0.4), 0.4 - wrap(mu, 0.4)), 0.008, px);
    const lift = wrap(mv, W / 3);
    t *= 0.62 + 0.38 * line(Math.min(lift, W / 3 - lift), 0.014, px); // pour joints
    t *= 1 + 0.18 * (fbm(u, v, 12, 12, 5, 173) - 0.5);
    const hole = dist(wrap(mu, 0.8) - 0.4, wrap(mv, W / 3) - W / 6);
    if (hole < 0.032) t *= hole < 0.02 ? 0.4 : 0.82;
    const bug = worley(u, v, 90, 90, 175);
    if (bug.f1 < 0.1 && bug.id > 0.85) t *= 0.72;
    set(o, t);
  },

  grate: (u, v, o, px) => {
    const W = SURFACE_SPEC.grate.scale!;
    const mu = u * W;
    const mv = v * W;
    const bu = wrap(mu, 0.05);
    const rv = wrap(mv, 0.1);
    const fu = wrap(mu, 1);
    const fv = wrap(mv, 1);
    const frame = Math.min(fu, 1 - fu, fv, 1 - fv) < 0.025;
    const bar = 1 - line(Math.abs(bu - 0.025), 0.012, px);
    const rod = 1 - line(Math.abs(rv - 0.05), 0.007, px);
    const hole = 0.14 + 0.08 * fbm(u, v, 8, 8, 3, 181); // the dark floor below
    let t = hole;
    t = t + (1.05 + 0.25 * (0.5 - Math.abs(bu - 0.025) / 0.012)) * bar * (1 - rod) - hole * bar;
    t = Math.max(t, rod * 1.1);
    if (frame) t = 1.15;
    t *= 1 + 0.2 * (fbm(u, v, 24, 24, 3, 183) - 0.5);
    set(o, t);
  },
});

/** One surface drawn at size × size: RGB brightness per texel, average = the kind's `mean`. */
export const drawSurface = (kind: Surface, size: number): Float32Array => {
  const fn = kinds(size)[kind];
  const spec = SURFACE_SPEC[kind];
  const px = (spec.scale ?? 1.5) / size;
  const out = new Float32Array(size * size * 3);
  const o = [1, 1, 1];
  imgSize = size;
  let sum = 0;
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      curU = u;
      curV = v;
      curI = y * size + x;
      fn(u, v, o, px);
      const i = curI * 3;
      out[i] = o[0];
      out[i + 1] = o[1];
      out[i + 2] = o[2];
      sum += o[0] * 0.3 + o[1] * 0.55 + o[2] * 0.15;
    }
  }
  imgSize = 0;
  curU = curV = -1;
  imageKeys.length = imageList.length = 0;
  const k = sum > 0 ? spec.mean / (sum / (size * size)) : 1;
  for (let i = 0; i < out.length; i++) out[i] *= k;
  return out;
};

/** The large soft patches: R = light/dark, G = where the second copy is blended in. */
export const drawMacro = (size: number): Uint8Array => {
  const out = new Uint8Array(size * size * 4);
  imgSize = size;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      curU = u;
      curV = v;
      curI = y * size + x;
      const i = curI * 4;
      out[i] = Math.round(smooth(0.2, 0.8, fbm(u, v, 4, 4, 5, 901)) * 255);
      out[i + 1] = Math.round(smooth(0.3, 0.7, fbm(u, v, 3, 3, 4, 903)) * 255);
      out[i + 2] = 128;
      out[i + 3] = 255;
    }
  imgSize = 0;
  curU = curV = -1;
  imageKeys.length = imageList.length = 0;
  return out;
};

// ---------------------------------------------------------------------------------------------
// GPU side

/** Texels are stored at half brightness so they can go up to 2× the box's colour. */
const encode = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 127.5)));

interface SurfaceTextures {
  layers: THREE.DataArrayTexture;
  macro: THREE.DataTexture;
  /** layers drawn so far (the rest stay flat until a level uses them) */
  drawn: Set<Surface>;
}
const cache = new Map<number, SurfaceTextures>();

/**
 * The texture array (every surface kind, size × size each) and the macro patches. Drawing a
 * layer takes a tenth of a second or so, so only the layers in `need` are drawn (once per
 * session; a later level that needs more adds them).
 */
export const surfaceTextures = (
  size: number,
  need: Iterable<Surface> = SURFACES,
): SurfaceTextures => {
  let tex = cache.get(size);
  if (!tex) {
    // (flat: every texel 1.0 until its layer is drawn)
    const data = new Uint8Array(size * size * 4 * SURFACES.length).fill(128);
    const layers = new THREE.DataArrayTexture(data, size, size, SURFACES.length);
    layers.format = THREE.RGBAFormat;
    layers.type = THREE.UnsignedByteType;
    layers.wrapS = layers.wrapT = THREE.RepeatWrapping;
    layers.magFilter = THREE.LinearFilter;
    layers.minFilter = THREE.LinearMipmapLinearFilter;
    layers.generateMipmaps = true;
    // (sharp floors at a glancing angle; the small low-quality set skips it: it costs on weak GPUs)
    layers.anisotropy = size >= 512 ? 4 : 1;
    layers.colorSpace = THREE.NoColorSpace; // brightness factors, not colours
    layers.needsUpdate = true;
    const msize = 256;
    const macro = new THREE.DataTexture(drawMacro(msize), msize, msize, THREE.RGBAFormat);
    macro.wrapS = macro.wrapT = THREE.RepeatWrapping;
    macro.magFilter = THREE.LinearFilter;
    macro.minFilter = THREE.LinearMipmapLinearFilter;
    macro.generateMipmaps = true;
    macro.colorSpace = THREE.NoColorSpace;
    macro.needsUpdate = true;
    tex = { layers, macro, drawn: new Set<Surface>(['plain']) };
    cache.set(size, tex);
  }
  const data = tex.layers.image.data as Uint8Array;
  for (const kind of need) {
    if (tex.drawn.has(kind)) continue;
    tex.drawn.add(kind);
    const px = drawSurface(kind, size);
    const base = surfaceLayer(kind) * size * size * 4;
    for (let i = 0, j = 0; i < px.length; i += 3, j += 4) {
      data[base + j] = encode(px[i]);
      data[base + j + 1] = encode(px[i + 1]);
      data[base + j + 2] = encode(px[i + 2]);
    }
    tex.layers.needsUpdate = true;
  }
  return tex;
};

/** How strong the surface detail is (Effects setting; 1 = as drawn). Shared by every level. */
export const surfaceDetail = { value: 1 };

/**
 * The material for all textured level surfaces: the baked vertex light times the surface
 * texture. `rich` adds the macro patches and the anti-repeat blend (2 extra texture lookups).
 */
export const surfaceMaterial = (
  rich: boolean,
  need: Iterable<Surface> = SURFACES,
): THREE.MeshBasicMaterial => {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  // (no DOM = tests on Node: no textures, plain vertex colours)
  if (typeof document === 'undefined') return mat;
  const tex = surfaceTextures(rich ? 512 : 256, need);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.surfTex = { value: tex.layers };
    shader.uniforms.surfMacro = { value: tex.macro };
    shader.uniforms.surfDetail = surfaceDetail;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec4 surf;\nvarying vec4 vSurf;\nvarying vec2 vSurfUv;',
      )
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSurf = surf;\nvSurfUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_pars_fragment>',
        [
          '#include <map_pars_fragment>',
          'uniform sampler2DArray surfTex;',
          'uniform sampler2D surfMacro;',
          'uniform float surfDetail;',
          'varying vec4 vSurf;',
          'varying vec2 vSurfUv;',
        ].join('\n'),
      )
      .replace(
        '#include <map_fragment>',
        [
          'float surfLayer = floor(vSurf.x + 0.5);',
          'vec3 surfT = texture(surfTex, vec3(vSurfUv, surfLayer)).rgb * 2.0;',
          rich
            ? [
                'vec4 surfM = texture(surfMacro, vSurf.yz);',
                // natural surfaces: a second copy at another scale, blended in patches
                'if (vSurf.w > 0.0) {',
                '  vec3 surfT2 = texture(surfTex, vec3(vSurfUv * 0.43 + vec2(0.31, 0.67), surfLayer)).rgb * 2.0;',
                '  surfT = mix(surfT, surfT2, surfM.g * vSurf.w);',
                '}',
                'surfT *= 0.84 + 0.32 * surfM.r;',
              ].join('\n')
            : '',
          'diffuseColor.rgb *= mix(vec3(1.0), surfT, surfDetail);',
        ].join('\n'),
      );
  };
  mat.customProgramCacheKey = () => (rich ? 'surf-rich' : 'surf-basic');
  return mat;
};
