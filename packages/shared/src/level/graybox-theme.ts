// The look of a graybox map (GrayboxLayout.theme, level/graybox.ts): which materials and colours
// its walls, floors, ramps, trims, door frames and props get, and its sky, fog and light. One
// palette per theme. The builder picks from the lists per AREA (a hash of the area's legend
// character), so every room of a map gets its own tone while the whole map keeps one style —
// like a CS map, where you know where you are from the colour of the walls.
//
// Walls are never the plain dark 'hull' on a themed map: they use 'sand' (plaster, sandstone),
// 'rock', 'panel', 'plate' or 'wood' with colours (the renderer textures those materials).
// Unthemed layouts keep the original graybox look.
import { v3 } from '../math/vec3';
import type { LightDef, Material, OutdoorSkyDef } from './types';
import type { GrayboxTheme } from './graybox';

export interface GrayboxPalette {
  /** walls: the lower part (up to about door height) and the upper part, picked per area */
  wall: { mat: Material; lower: number[]; upper: number[] };
  /** the strip between a wall's lower and upper part */
  trim: { mat: Material; colors: number[] };
  /** floors of rooms and corridors (per area); `alt` for low floors (tunnels, basins) */
  floor: { mat: Material; colors: number[]; alt: number[] };
  /** ramps and stairs */
  ramp: { mat: Material; colors: number[] };
  /** bomb site floors */
  site: { mat: Material; color: number };
  /** shallow water (areas named Water / Canal / Sea / Boat): a walkable floor that looks like water */
  water?: { mat: Material; color: number };
  /** door frames: strips on both sides of every doorway between two areas */
  door: { mat: Material; colors: number[] };
  /** props and automatic cover */
  crate: { mat: Material; colors: number[] };
  pillar: { mat: Material; colors: number[] };
  car: number[];
  barrel: number[];
  /** painted signs ("A →", "MID") */
  sign: number;
  /** open sky (outdoor themes) */
  outdoor?: OutdoorSkyDef;
  fog?: { color: number; near: number; far: number };
  ambient: number;
  /** indoor themes: a light over every area (colour, strength) */
  light?: { color: number; intensity: number };
}

export const GRAYBOX_THEMES: Record<GrayboxTheme, GrayboxPalette> = {
  // sandstone and plaster, blue doors, bright sun (Dust 2, Mirage)
  desert: {
    wall: {
      mat: 'sand',
      lower: [0xd8b98a, 0xcfae7c, 0xe2c99f, 0xc9a273, 0xe6d5b0],
      upper: [0xe8d8b6, 0xdcc49a, 0xeee2c6, 0xd6bb8e, 0xf0e6cf],
    },
    trim: { mat: 'sand', colors: [0xb08a5c, 0xa47e52] },
    floor: { mat: 'sand', colors: [0xc9a46c, 0xbf9a63, 0xd1ae78, 0xb89160], alt: [0xa98a5e] },
    ramp: { mat: 'rock', colors: [0xb59a76, 0xa88e6c] },
    site: { mat: 'plate', color: 0xb8a07a },
    door: { mat: 'wood', colors: [0x2f6fb0, 0x2a5f96, 0x3a7fc0] },
    crate: { mat: 'crate', colors: [0x9a7448, 0x8a6a42, 0xa57d4f] },
    pillar: { mat: 'sand', colors: [0xcaa877, 0xbfa070] },
    car: [0xd9d2c4, 0x7d2f2a, 0x4f6a7a],
    barrel: [0x3f6f9f, 0x8f3f2f],
    sign: 0x2a2a2a,
    outdoor: {
      top: 0x4f8fd6,
      horizon: 0xdfe8ee,
      ground: 0xc8a878,
      sun: { dir: v3(0.45, 0.8, 0.35), color: 0xfff6dc, sizeDeg: 4 },
      sunLight: 0xfff0d6,
    },
    fog: { color: 0xdfe8ee, near: 90, far: 420 },
    ambient: 1.1,
  },
  // terracotta, ochre plaster, cobbles (Inferno)
  italian: {
    wall: {
      mat: 'sand',
      lower: [0xd9a55a, 0xc0643c, 0xe0c08a, 0xb8754a, 0xd6b47a],
      upper: [0xe6bd78, 0xcc7a52, 0xead2a4, 0xc98a5e, 0xe2c792],
    },
    trim: { mat: 'rock', colors: [0x9a8a78, 0x8a7a6a] },
    floor: { mat: 'rock', colors: [0x8f857a, 0x9a8f80, 0x857a6c], alt: [0x7a6f62] },
    ramp: { mat: 'rock', colors: [0x9a8a78] },
    site: { mat: 'rock', color: 0xa39686 },
    door: { mat: 'wood', colors: [0x4f7a4a, 0x6a4a2f, 0x3f6a5a] },
    crate: { mat: 'crate', colors: [0x8a6a42, 0x9a7448] },
    pillar: { mat: 'rock', colors: [0xb0a08a, 0xa39480] },
    car: [0x8a2f2a, 0xd8cfb8, 0x2f4f6a],
    barrel: [0x6a4a2f, 0x8a5a3a],
    sign: 0xf4ecd8,
    outdoor: {
      top: 0x5a8fd0,
      horizon: 0xf0dcc0,
      ground: 0x9a8a70,
      sun: { dir: v3(-0.5, 0.65, 0.4), color: 0xffe8c0, sizeDeg: 4 },
      sunLight: 0xffe2b8,
    },
    fog: { color: 0xf0dcc0, near: 80, far: 380 },
    ambient: 1.05,
  },
  // concrete, painted steel, warehouse light (Nuke, Train, Cache)
  industrial: {
    wall: {
      mat: 'panel',
      lower: [0x9a9a94, 0x7f8a8f, 0xa7865a, 0x8a9a8a, 0x9f8f80],
      upper: [0xb4b4ae, 0x9aa6aa, 0xc0a074, 0xa6b4a4, 0xb6a898],
    },
    trim: { mat: 'plate', colors: [0xe0b030, 0x3f6f8f] },
    floor: { mat: 'plate', colors: [0x6f6f6a, 0x7a7a74, 0x66706f, 0x7f7468], alt: [0x5a5f60] },
    ramp: { mat: 'grate', colors: [0x7a7f80, 0x6f7478] },
    site: { mat: 'plate', color: 0x8a8070 },
    door: { mat: 'plate', colors: [0xe0b030, 0x3f7fa8, 0xc0503a] },
    crate: { mat: 'crate', colors: [0x6f7f4a, 0x8a6a42, 0x4f6f8f] },
    pillar: { mat: 'pillar', colors: [0x9a9a94, 0x8a8a84] },
    car: [0xe0b030, 0x3f6f8f, 0x8a3a2a],
    barrel: [0xc0503a, 0x3f7fa8, 0xe0b030],
    sign: 0xf2f2ea,
    fog: { color: 0x3a3f44, near: 60, far: 260 },
    ambient: 0.9,
    light: { color: 0xfff2dc, intensity: 0.9 },
  },
  // mossy stone ruins, green light (Ancient)
  jungle: {
    wall: {
      mat: 'rock',
      lower: [0x7f8f6a, 0x6f7f5f, 0x8a8a72, 0x75856a, 0x8f9a7a],
      upper: [0x9a9a80, 0x8a9478, 0xa4a48a, 0x909a80, 0xaab08f],
    },
    trim: { mat: 'leaf', colors: [0x4f7a3a, 0x5a8a42] },
    floor: { mat: 'rock', colors: [0x7a7360, 0x857c66, 0x6f6a58], alt: [0x5f6a50] },
    ramp: { mat: 'rock', colors: [0x857c66, 0x7a7360] },
    site: { mat: 'rock', color: 0x9a8f70 },
    water: { mat: 'plate', color: 0x3f7f78 },
    door: { mat: 'rock', colors: [0xc7a64a, 0xb08f40] },
    crate: { mat: 'crate', colors: [0x6a5a3a, 0x7a6a42] },
    pillar: { mat: 'rock', colors: [0x9a9a80, 0x8a8a72] },
    car: [0x5a6a3a, 0x6a5a3a],
    barrel: [0x6a5a3a, 0x5a6a3a],
    sign: 0xe8e0c0,
    outdoor: {
      top: 0x6f9fc0,
      horizon: 0xc8dcc0,
      ground: 0x5f7a4a,
      sun: { dir: v3(0.3, 0.75, -0.55), color: 0xfff6d0, sizeDeg: 4 },
      sunLight: 0xf0ffd8,
    },
    fog: { color: 0xb8d0b0, near: 50, far: 260 },
    ambient: 1,
  },
  // limestone, blue water, gold accents (Anubis)
  egypt: {
    wall: {
      mat: 'sand',
      lower: [0xe0cfa4, 0xd4bf8e, 0xe6d8b4, 0xcbb284, 0xdac69a],
      upper: [0xece0c0, 0xe2d2a8, 0xf0e6cc, 0xd8c49a, 0xe8dab4],
    },
    trim: { mat: 'plate', colors: [0xd4a83a, 0x2a6fb8] },
    floor: { mat: 'sand', colors: [0xd9c59a, 0xcfb98c, 0xe0cea6], alt: [0xb8a47c] },
    ramp: { mat: 'rock', colors: [0xcdbb92, 0xc4b088] },
    site: { mat: 'plate', color: 0xcbb88d },
    water: { mat: 'plate', color: 0x2f8fb8 },
    door: { mat: 'plate', colors: [0x2a6fb8, 0xd4a83a] },
    crate: { mat: 'crate', colors: [0x9a7a4a, 0x8a6a42] },
    pillar: { mat: 'sand', colors: [0xe6d8b0, 0xd8c69c] },
    car: [0xd8cfb8, 0x2a6fb8],
    barrel: [0x2a6fb8, 0xd4a83a],
    sign: 0x2a3f6a,
    outdoor: {
      top: 0x3f86d8,
      horizon: 0xe8e4d8,
      ground: 0xd0bb8c,
      sun: { dir: v3(-0.35, 0.85, -0.4), color: 0xfff8e0, sizeDeg: 4 },
      sunLight: 0xfff4dc,
    },
    fog: { color: 0xe8e4d8, near: 90, far: 420 },
    ambient: 1.1,
  },
  // red rock and sand under open sky (Canyon Relay)
  canyon: {
    wall: {
      mat: 'rock',
      lower: [0xa8553a, 0xb96a45, 0x9a4f38, 0xb4603f, 0xa26044],
      upper: [0xc47a52, 0xcf8a5e, 0xb8704c, 0xd09468, 0xbf7e5a],
    },
    trim: { mat: 'rock', colors: [0x8a4030, 0x7a3a2c] },
    floor: { mat: 'sand', colors: [0xc98a5a, 0xd09464, 0xc08050], alt: [0xa8704a] },
    ramp: { mat: 'rock', colors: [0xb87a54, 0xad7250] },
    site: { mat: 'sand', color: 0xd8a070 },
    door: { mat: 'wood', colors: [0x8a6040, 0x7a5236] },
    crate: { mat: 'crate', colors: [0x8a6a42, 0x9a7448] },
    pillar: { mat: 'rock', colors: [0xb4603f, 0xa8553a] },
    car: [0x8a6040, 0x6a6a6a],
    barrel: [0x8a3a2a, 0x6a6a6a],
    sign: 0xf4ead8,
    outdoor: {
      top: 0x8ec6e8,
      horizon: 0xf2a65a,
      ground: 0xc98a55,
      sun: { dir: v3(-0.85, 0.1, 0.3), color: 0xfff1c9, sizeDeg: 5 },
      sunLight: 0xffd9a8,
    },
    fog: { color: 0xf2a65a, near: 70, far: 300 },
    ambient: 1.12,
  },
  // light hull panels, signage stripes (Antipode)
  station: {
    wall: {
      mat: 'panel',
      lower: [0xc8ced6, 0xaeb8c4, 0xbcc6cc, 0xb4bcc8, 0xc4ccd2],
      upper: [0xdde2e8, 0xc8d0da, 0xd6dce2, 0xccd4de, 0xe2e6ec],
    },
    trim: { mat: 'trim', colors: [0x3fc6d8, 0xf0a040] },
    floor: { mat: 'plate', colors: [0x8a96a3, 0x7f8c99, 0x95a0ab], alt: [0x6f7a86] },
    ramp: { mat: 'grate', colors: [0x8a96a3] },
    site: { mat: 'plate', color: 0xa0909a },
    door: { mat: 'plate', colors: [0x3fc6d8, 0xf0a040] },
    crate: { mat: 'crate', colors: [0x5f7f9f, 0x7f8f9f] },
    pillar: { mat: 'pillar', colors: [0xb4bcc8, 0xa8b0bc] },
    car: [0x8a96a3, 0x3fc6d8],
    barrel: [0xf0a040, 0x3fc6d8],
    sign: 0x1f3f5f,
    fog: { color: 0x1a2430, near: 70, far: 300 },
    ambient: 0.95,
    light: { color: 0xe8f4ff, intensity: 1 },
  },
  // neon street, asphalt, shop fronts (the Shibuya mega map)
  city: {
    wall: {
      mat: 'panel',
      lower: [0x6a6f7a, 0x8a5a6a, 0x5a7a8a, 0x8a7a5a, 0x7a6a8a, 0x9a9aa0],
      upper: [0x8a8f9a, 0xa07a8a, 0x7a9aaa, 0xaa9a7a, 0x9a8aaa, 0xb4b4ba],
    },
    trim: { mat: 'trim', colors: [0xff3fa0, 0x3fe0ff, 0xffd040, 0x7fff6a] },
    floor: { mat: 'plate', colors: [0x45484e, 0x4f5258, 0x9a9a96, 0x55585e], alt: [0x3c3f45] },
    ramp: { mat: 'plate', colors: [0x6a6d72] },
    site: { mat: 'plate', color: 0x6a5a62 },
    door: { mat: 'trim', colors: [0xff3fa0, 0x3fe0ff, 0xffd040] },
    crate: { mat: 'crate', colors: [0x6a6f7a, 0x8a6a42] },
    pillar: { mat: 'pillar', colors: [0x8a8f9a, 0x7a7f8a] },
    car: [0xd8d8d8, 0x2a2a30, 0xc03a3a, 0x3a5aa0, 0xe0c040],
    barrel: [0x3a8a4a, 0xc03a3a],
    sign: 0xffffff,
    outdoor: {
      top: 0x0e1430,
      horizon: 0x3a3060,
      ground: 0x1a1a24,
      sunLight: 0x9aa8ff,
      stars: true,
    },
    fog: { color: 0x2a2648, near: 80, far: 420 },
    ambient: 0.85,
    light: { color: 0xffd8f0, intensity: 0.8 },
  },
};

/** Deterministic 0..1 from a string (which colour of a list an area gets). */
export const hashOf = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};

/** Pick one colour of a list for a key (an area's character, a prop's position…). */
export const pick = (list: number[], key: string): number =>
  list[Math.floor(hashOf(key) * list.length) % list.length];

/** A colour made lighter (f > 1) or darker (f < 1). */
export const shade = (color: number, f: number): number => {
  const ch = (k: number) => Math.max(0, Math.min(255, Math.round(((color >> k) & 255) * f)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** Blend two colours (t = 0: a, 1: b). */
export const mix = (a: number, b: number, t: number): number => {
  const ch = (k: number) => Math.round(((a >> k) & 255) * (1 - t) + ((b >> k) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** Lights for an indoor theme: one over each area's middle (at most `max`). */
export const themeLights = (
  pal: GrayboxPalette,
  spots: { x: number; y: number; z: number; size: number }[],
  max = 64,
): LightDef[] => {
  if (!pal.light) return [];
  // (the biggest areas first when there are more than `max`)
  const ordered = [...spots].sort((a, b) => b.size - a.size || a.x - b.x || a.z - b.z);
  return ordered.slice(0, max).map((p) => ({
    pos: v3(p.x, p.y, p.z),
    color: pal.light!.color,
    radius: Math.max(10, Math.min(40, p.size)),
    intensity: pal.light!.intensity,
  }));
};
