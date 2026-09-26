// Procedural surface textures, drawn once on canvases at load (nothing to download).
// They are mostly grey detail (seams, bolts, grating, grime) that multiplies the level's
// baked vertex colors, so one texture serves every tint of a material.
import * as THREE from 'three';

export type TexKind =
  'hull' | 'floor' | 'plate' | 'grate' | 'panel' | 'crate' | 'pillar' | 'engine' | 'team' | 'stars';

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

const bolt = (g: Ctx, x: number, y: number, r = 2.5) => {
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.beginPath();
  g.arc(x + 0.8, y + 0.8, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.arc(x, y, r * 0.7, 0, Math.PI * 2);
  g.fill();
};

const draw: Record<TexKind, (g: Ctx, r: () => number) => void> = {
  // big wall plates with seams, bolts and the odd vent slit
  hull: (g, r) => {
    grime(g, r, 0.82, 0.06);
    const s = SIZE / 2;
    for (let i = 0; i <= 2; i++) {
      seam(g, 0, i * s, SIZE, i * s, 3);
      seam(g, i * s, 0, i * s, SIZE, 3);
    }
    for (let x = 0; x < 2; x++)
      for (let y = 0; y < 2; y++) {
        for (const [bx, by] of [
          [10, 10],
          [s - 10, 10],
          [10, s - 10],
          [s - 10, s - 10],
        ])
          bolt(g, x * s + bx, y * s + by);
      }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 5; i++) g.fillRect(s + 30, 40 + i * 9, 60, 4);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(20, s + 20, s - 40, 18);
  },
  // diamond plate / grating
  floor: (g, r) => {
    grime(g, r, 0.8, 0.05);
    const step = 16;
    for (let y = 0; y < SIZE; y += step)
      for (let x = 0; x < SIZE; x += step) {
        const ox = (y / step) % 2 === 0 ? 0 : step / 2;
        g.save();
        g.translate(x + ox + step / 2, y + step / 2);
        g.rotate((((x / step + y / step) % 2 === 0 ? 1 : -1) * Math.PI) / 4);
        g.fillStyle = 'rgba(255,255,255,0.13)';
        g.fillRect(-5, -1.5, 10, 3);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(-5, 1.5, 10, 1);
        g.restore();
      }
    seam(g, 0, 0, SIZE, 0, 3);
    seam(g, 0, 0, 0, SIZE, 3);
    seam(g, 0, SIZE / 2, SIZE, SIZE / 2, 2);
  },
  // deck plating: big welded plates, alternating slightly in tone, bolts along the seams
  plate: (g, r) => {
    grime(g, r, 0.8, 0.04);
    const s = SIZE / 2;
    for (let x = 0; x < 2; x++)
      for (let y = 0; y < 2; y++) {
        g.fillStyle = (x + y) % 2 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
        g.fillRect(x * s, y * s, s, s);
        for (let i = 12; i < s; i += 29) {
          bolt(g, x * s + i, y * s + 7, 1.8);
          bolt(g, x * s + 7, y * s + i, 1.8);
        }
      }
    seam(g, 0, 0, SIZE, 0, 3);
    seam(g, 0, 0, 0, SIZE, 3);
    seam(g, 0, s, SIZE, s, 2);
    seam(g, s, 0, s, SIZE, 2);
    // a worn walking line down the middle of each plate
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(s / 2 - 10, 0, 20, SIZE);
    g.fillRect(s + s / 2 - 10, 0, 20, SIZE);
  },
  // open grating: bright bars over a dark gap (catwalks, gantries)
  grate: (g, r) => {
    grime(g, r, 0.35, 0.05);
    const step = 16;
    for (let x = 0; x < SIZE; x += step) {
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(x, 0, 4, SIZE);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(x + 4, 0, 1, SIZE);
    }
    for (let y = 0; y < SIZE; y += step * 4) {
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(0, y, SIZE, 6);
    }
    seam(g, 0, 0, SIZE, 0, 3);
  },
  // lighter wall panel with an inset and horizontal ribs
  panel: (g, r) => {
    grime(g, r, 0.86, 0.04);
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    g.lineWidth = 3;
    g.strokeRect(14, 14, SIZE - 28, SIZE - 28);
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.lineWidth = 1;
    g.strokeRect(17, 17, SIZE - 34, SIZE - 34);
    for (let y = 40; y < SIZE - 30; y += 22) {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(28, y, SIZE - 56, 5);
    }
    seam(g, 0, 0, SIZE, 0, 3);
    seam(g, 0, 0, 0, SIZE, 3);
  },
  // cargo crate: frame, cross brace, stencil block and a hazard stripe
  crate: (g, r) => {
    grime(g, r, 0.82, 0.08);
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 16;
    g.strokeRect(8, 8, SIZE - 16, SIZE - 16);
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 2;
    g.strokeRect(17, 17, SIZE - 34, SIZE - 34);
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(24, 24);
    g.lineTo(SIZE - 24, SIZE - 24);
    g.stroke();
    // hazard stripe band
    g.save();
    g.beginPath();
    g.rect(24, SIZE - 58, SIZE - 48, 22);
    g.clip();
    for (let x = 0; x < SIZE + 40; x += 22) {
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.beginPath();
      g.moveTo(x, SIZE - 58);
      g.lineTo(x + 11, SIZE - 58);
      g.lineTo(x - 11, SIZE - 36);
      g.lineTo(x - 22, SIZE - 36);
      g.fill();
    }
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.2)';
    g.fillRect(40, 44, 70, 12);
    g.fillRect(40, 62, 40, 8);
    for (const [x, y] of [
      [20, 20],
      [SIZE - 20, 20],
      [20, SIZE - 20],
      [SIZE - 20, SIZE - 20],
    ])
      bolt(g, x, y, 3.5);
  },
  // vertical ribs
  pillar: (g, r) => {
    grime(g, r, 0.8, 0.05);
    for (let x = 0; x < SIZE; x += 32) {
      g.fillStyle = 'rgba(255,255,255,0.14)';
      g.fillRect(x + 4, 0, 6, SIZE);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(x + 10, 0, 3, SIZE);
    }
    seam(g, 0, SIZE / 2, SIZE, SIZE / 2, 3);
    for (let x = 16; x < SIZE; x += 32) bolt(g, x, SIZE / 2 - 8, 2);
  },
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
};

/** Meters per texture repeat (null = one texture per box face, e.g. crates). */
export const TEX_SCALE: Record<TexKind, number | null> = {
  hull: 5,
  floor: 2.5,
  plate: 4,
  grate: 2,
  panel: 3,
  crate: null,
  pillar: 2.5,
  engine: 4,
  team: 4,
  stars: 12,
};

const cache = new Map<TexKind, THREE.Texture | null>();

/** Contrast of the fine detail (0..1); textures made after a change use it (next level load). */
let detail = 1;
export const setTextureDetail = (d: number): void => {
  const v = Math.min(1, Math.max(0, d));
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
  // the starfield stays crisp (windows), everything else follows the Effects setting
  if (kind !== 'stars') calm(g, detail);
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
