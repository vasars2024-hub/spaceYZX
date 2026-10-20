// The special canvas textures, drawn once at load (nothing to download): engine-room plates,
// team chevrons, the starfield in windows and the red-zone hatching. The ordinary level surfaces
// (concrete, rock, plaster, steel…) live in render/surfaces.ts.
// They are mostly grey detail that multiplies the level's baked vertex colors, so one texture
// serves every tint of a material.
import * as THREE from 'three';
import { surfaceDetail } from './surfaces';

export type TexKind = 'engine' | 'team' | 'stars' | 'hazard';

const SIZE = 256;

/** Small deterministic PRNG so textures look the same on every PC. */
const rng = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
};

type Ctx = CanvasRenderingContext2D;

const grey = (v: number, a = 1) => {
  const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgba(${c},${c},${c},${a})`;
};

/** Fine noise + soft grime blotches (so surfaces don't look plastic). */
const grime = (g: Ctx, r: () => number, base: number, amount: number) => {
  g.fillStyle = grey(base);
  g.fillRect(0, 0, SIZE, SIZE);
  const img = g.getImageData(0, 0, SIZE, SIZE);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amount * 255;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 14; i++) {
    const x = r() * SIZE;
    const y = r() * SIZE;
    const rad = 20 + r() * 60;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(0,0,0,${0.05 + r() * 0.07})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
};

/** A recessed seam line with a highlight edge (reads as a panel join). */
const seam = (g: Ctx, x0: number, y0: number, x1: number, y1: number, w = 2) => {
  g.lineWidth = w;
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  const dx = y1 - y0 === 0 ? 0 : 1;
  const dy = x1 - x0 === 0 ? 0 : 1;
  g.moveTo(x0 + dx * w, y0 + dy * w);
  g.lineTo(x1 + dx * w, y1 + dy * w);
  g.stroke();
};

const draw: Record<TexKind, (g: Ctx, r: () => number) => void> = {
  // engine room: heat-stained plates with vent grilles
  engine: (g, r) => {
    grime(g, r, 0.75, 0.09);
    for (let i = 0; i < 3; i++) {
      const y = 30 + i * 80;
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(30, y, SIZE - 60, 34);
      for (let x = 36; x < SIZE - 36; x += 10) {
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(x, y + 4, 4, 26);
      }
    }
    seam(g, 0, 0, SIZE, 0, 3);
    seam(g, SIZE / 2, 0, SIZE / 2, SIZE, 2);
  },
  // team walls: big chevrons
  team: (g, r) => {
    grime(g, r, 0.8, 0.05);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    for (let i = 0; i < 3; i++) {
      const y = 40 + i * 70;
      g.beginPath();
      g.moveTo(40, y);
      g.lineTo(SIZE / 2, y + 40);
      g.lineTo(SIZE - 40, y);
      g.lineTo(SIZE - 40, y + 20);
      g.lineTo(SIZE / 2, y + 60);
      g.lineTo(40, y + 20);
      g.fill();
    }
    seam(g, 0, 0, SIZE, 0, 3);
  },
  // windows: a starfield with a faint nebula
  stars: (g, r) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 3; i++) {
      const x = r() * SIZE;
      const y = r() * SIZE;
      const rad = 60 + r() * 80;
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, `rgba(${80 + r() * 80},${60 + r() * 60},${140 + r() * 100},0.35)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, SIZE, SIZE);
    }
    for (let i = 0; i < 220; i++) {
      const b = r();
      g.fillStyle = `rgba(255,255,255,${0.3 + b * 0.7})`;
      const s = b > 0.96 ? 2 : 1;
      g.fillRect(r() * SIZE, r() * SIZE, s, s);
    }
  },
  // red zones: bold diagonal hatching (the red comes from the vertex colour; the dark stripes
  // make it read as a hazard without relying on colour alone). Tiles seamlessly.
  hazard: (g) => {
    g.fillStyle = grey(1);
    g.fillRect(0, 0, SIZE, SIZE);
    g.fillStyle = grey(0.13);
    const w = SIZE / 4;
    for (let k = -2; k < 4; k++) {
      const x = k * SIZE * 0.5;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + w, 0);
      g.lineTo(x + w + SIZE, SIZE);
      g.lineTo(x + SIZE, SIZE);
      g.fill();
    }
  },
};

/** Meters per texture repeat. */
export const TEX_SCALE: Record<TexKind, number> = {
  engine: 4,
  team: 4,
  stars: 12,
  hazard: 2.4,
};

const cache = new Map<TexKind, THREE.Texture | null>();

/** Contrast of the fine detail (0..1); textures made after a change use it (next level load). */
let detail = 1;
export const setTextureDetail = (d: number): void => {
  const v = Math.min(1, Math.max(0, d));
  surfaceDetail.value = v; // (the level surfaces follow at once, in their shader)
  if (v === detail) return;
  detail = v;
  for (const t of cache.values()) t?.dispose();
  cache.clear();
};

/** Pulls every pixel toward the texture's average grey: same shapes, much less busy. */
const calm = (g: Ctx, k: number) => {
  if (k >= 1) return;
  const img = g.getImageData(0, 0, SIZE, SIZE);
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
  const mean = sum / (d.length * 0.75);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = mean + (d[i] - mean) * k;
    d[i + 1] = mean + (d[i + 1] - mean) * k;
    d[i + 2] = mean + (d[i + 2] - mean) * k;
  }
  g.putImageData(img, 0, 0);
};

/** The texture for a surface kind (null when there is no DOM, e.g. in tests). */
export const surfaceTexture = (kind: TexKind): THREE.Texture | null => {
  if (cache.has(kind)) return cache.get(kind)!;
  if (typeof document === 'undefined') {
    cache.set(kind, null);
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) {
    cache.set(kind, null);
    return null;
  }
  draw[kind](g, rng(kind.length * 7919 + kind.charCodeAt(0)));
  // the starfield (windows) and hazard hatching stay crisp, the rest follows the Effects setting
  if (kind !== 'stars' && kind !== 'hazard') calm(g, detail);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(kind, tex);
  return tex;
};

/** Soft round glow for light halos. */
export const glowTexture = (): THREE.Texture | null => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
};
