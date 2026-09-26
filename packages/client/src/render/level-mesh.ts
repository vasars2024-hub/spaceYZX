// Build the static level as a few merged meshes: procedural textures (one mesh per surface
// kind) multiplied by lighting baked into vertex colors — a directional key light, soft ambient
// occlusion, and colored point lights (explicit map lights + every strip light). Walls block
// light, so rooms don't bleed into each other. MeshBasicMaterial = no lighting cost at runtime.
import * as THREE from 'three';
import type { LevelDef, BoxDef, Material, Vec3, LightDef, Level } from '@space-yz/shared';
import {
  qRotate,
  v3,
  normalize,
  dot,
  cross,
  len,
  sub,
  lenSq,
  madd,
  buildLevel,
  lineOfSight,
} from '@space-yz/shared';
import { surfaceTexture, glowTexture, TEX_SCALE, type TexKind } from './textures';
import { buildSky } from './sky';

export const MATERIAL_COLORS: Record<Material, number> = {
  hull: 0x3a4660,
  floor: 0x4b5670,
  plate: 0x4e586c,
  grate: 0x5a6478,
  panel: 0x5d6b88,
  crate: 0x7c6242,
  pillar: 0x4d5a78,
  engine: 0x4f3c50,
  teamA: 0x2a8296,
  teamB: 0x96602a,
  glass: 0xffffff,
  skyglass: 0x9fd0ff,
  trim: 0xffffff,
};

const TEX_OF: Record<Material, TexKind | null> = {
  hull: 'hull',
  floor: 'floor',
  plate: 'plate',
  grate: 'grate',
  panel: 'panel',
  crate: 'crate',
  pillar: 'pillar',
  engine: 'engine',
  teamA: 'team',
  teamB: 'team',
  glass: 'stars',
  skyglass: null,
  trim: null,
};

const LIGHT = normalize(v3(0.35, 1, 0.25));

const hash = (n: number): number => {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967295;
};

const FACES: { n: Vec3; corners: [number, number, number][] }[] = [
  {
    n: v3(1, 0, 0),
    corners: [
      [1, -1, -1],
      [1, 1, -1],
      [1, 1, 1],
      [1, -1, 1],
    ],
  },
  {
    n: v3(-1, 0, 0),
    corners: [
      [-1, -1, 1],
      [-1, 1, 1],
      [-1, 1, -1],
      [-1, -1, -1],
    ],
  },
  {
    n: v3(0, 1, 0),
    corners: [
      [-1, 1, -1],
      [-1, 1, 1],
      [1, 1, 1],
      [1, 1, -1],
    ],
  },
  {
    n: v3(0, -1, 0),
    corners: [
      [-1, -1, 1],
      [-1, -1, -1],
      [1, -1, -1],
      [1, -1, 1],
    ],
  },
  {
    n: v3(0, 0, 1),
    corners: [
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
      [-1, -1, 1],
    ],
  },
  {
    n: v3(0, 0, -1),
    corners: [
      [-1, -1, -1],
      [-1, 1, -1],
      [1, 1, -1],
      [1, -1, -1],
    ],
  },
];

class GeoBuilder {
  pos: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  vert(p: Vec3, c: THREE.Color, u: number, v: number): void {
    this.pos.push(p.x, p.y, p.z);
    this.col.push(c.r, c.g, c.b);
    this.uv.push(u, v);
  }
  quad(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    d: Vec3,
    ca: THREE.Color,
    cb: THREE.Color,
    cc: THREE.Color,
    cd: THREE.Color,
    uvs: [number, number][] = [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ],
  ): void {
    const P = [a, b, c, d];
    const C = [ca, cb, cc, cd];
    for (const i of [0, 1, 2, 0, 2, 3]) this.vert(P[i], C[i], uvs[i][0], uvs[i][1]);
  }
  get empty(): boolean {
    return this.pos.length === 0;
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

const boxCorner = (b: BoxDef, lx: number, ly: number, lz: number): Vec3 => {
  const local = v3(lx * b.h.x, ly * b.h.y, lz * b.h.z);
  const r = b.q ? qRotate(b.q, local) : local;
  return v3(b.c.x + r.x, b.c.y + r.y, b.c.z + r.z);
};

/** Key light + fill + fake ambient occlusion (the part of lighting shared by a whole face). */
const shade = (
  base: THREE.Color,
  n: Vec3,
  variation: number,
  bottom: boolean,
  ambient: number,
): THREE.Color => {
  const diffuse = Math.max(0, dot(n, LIGHT));
  const fill = Math.max(0, -dot(n, LIGHT)) * 0.15;
  const up = n.y > 0.5 ? 0.06 : 0;
  let k = (0.34 + 0.4 * diffuse + fill + up) * ambient;
  k *= 0.94 + variation * 0.12;
  if (bottom) k *= 0.72; // darker toward the bottom of walls
  return base.clone().multiplyScalar(k);
};

// ---------------------------------------------------------------------------------------------
// Point lights

export interface BakeLight {
  pos: Vec3;
  color: THREE.Color;
  radius: number;
  intensity: number;
}

/** Explicit map lights + one light every few meters along each strip light ('trim' box). */
export const collectLights = (def: LevelDef): LightDef[] => {
  const out: LightDef[] = [...(def.lights ?? [])];
  for (const b of def.boxes) {
    if (b.mat !== 'trim' || b.noRender) continue;
    const ext = [b.h.x * 2, b.h.y * 2, b.h.z * 2];
    const longest = Math.max(...ext);
    const color = b.color ?? 0xffffff;
    if (longest < 1.5) {
      out.push({ pos: b.c, color, radius: 2.5, intensity: 0.45 });
      continue;
    }
    const axis = ext.indexOf(longest);
    const n = Math.max(1, Math.round(longest / 5));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      const p = { ...b.c };
      if (axis === 0) p.x += t * longest;
      else if (axis === 1) p.y += t * longest;
      else p.z += t * longest;
      out.push({ pos: p, color, radius: 6.5, intensity: 0.75 });
    }
  }
  return out;
};

/** Spatial hash of lights so each vertex only looks at nearby ones. */
class LightGrid {
  private cells = new Map<string, BakeLight[]>();
  constructor(
    lights: BakeLight[],
    private cell = 8,
  ) {
    for (const l of lights) {
      const r = Math.ceil(l.radius / cell);
      const cx = Math.floor(l.pos.x / cell);
      const cy = Math.floor(l.pos.y / cell);
      const cz = Math.floor(l.pos.z / cell);
      for (let x = cx - r; x <= cx + r; x++)
        for (let y = cy - r; y <= cy + r; y++)
          for (let z = cz - r; z <= cz + r; z++) {
            const k = `${x},${y},${z}`;
            const list = this.cells.get(k) ?? [];
            list.push(l);
            this.cells.set(k, list);
          }
    }
  }
  near(p: Vec3): BakeLight[] {
    return (
      this.cells.get(
        `${Math.floor(p.x / this.cell)},${Math.floor(p.y / this.cell)},${Math.floor(p.z / this.cell)}`,
      ) ?? []
    );
  }
}

/** Light arriving at a surface point (with normal n), walls block it. Cached per position. */
export const makeLightAt = (level: Level, lights: BakeLight[]) => {
  const grid = new LightGrid(lights);
  const cache = new Map<string, THREE.Color>();
  return (p: Vec3, n: Vec3): THREE.Color => {
    const key = `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)},${n.x.toFixed(1)},${n.y.toFixed(1)},${n.z.toFixed(1)}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const out = new THREE.Color(0, 0, 0);
    const from = madd(p, n, 0.12);
    for (const l of grid.near(p)) {
      const d = sub(l.pos, p);
      const dist = len(d);
      if (dist > l.radius) continue;
      const ndl = dist < 1e-3 ? 1 : dot(n, d) / dist;
      if (ndl < -0.05) continue; // facing away
      const att = (1 - dist / l.radius) ** 2;
      const w = att * l.intensity * (0.25 + 0.75 * Math.max(0, ndl));
      if (w < 0.01) continue;
      if (dist > 1.2 && !lineOfSight(level, from, l.pos)) continue;
      out.r += l.color.r * w;
      out.g += l.color.g * w;
      out.b += l.color.b * w;
    }
    cache.set(key, out);
    return out;
  };
};

// ---------------------------------------------------------------------------------------------

export interface LevelMeshes {
  group: THREE.Group;
  dispose(): void;
}

export interface LevelMeshOptions {
  brightness?: number;
  /** zero-G dust motes */
  dust?: boolean;
  /** light glows and light shafts */
  atmosphere?: boolean;
}

export const buildLevelMeshes = (def: LevelDef, opts: LevelMeshOptions = {}): LevelMeshes => {
  const brightness = opts.brightness ?? 1;
  const ambient = (def.ambient ?? 1) * brightness;
  const builders = new Map<TexKind | 'none', GeoBuilder>();
  const builder = (k: TexKind | 'none') => {
    let b = builders.get(k);
    if (!b) builders.set(k, (b = new GeoBuilder()));
    return b;
  };
  const trims = new GeoBuilder();
  const glassGeo = new GeoBuilder();
  const level = buildLevel(def);
  const lightDefs = collectLights(def);
  const lightAt = makeLightAt(
    level,
    lightDefs.map((l) => ({
      pos: l.pos,
      color: new THREE.Color(l.color),
      radius: l.radius,
      intensity: l.intensity,
    })),
  );
  const tintNeg = def.sideTint ? new THREE.Color(def.sideTint.neg) : null;
  const tintPos = def.sideTint ? new THREE.Color(def.sideTint.pos) : null;

  def.boxes.forEach((b, bi) => {
    if (b.noRender) return;
    const mat = b.mat ?? 'hull';
    const base = new THREE.Color(b.color ?? MATERIAL_COLORS[mat]);
    if (mat === 'skyglass') {
      // see-through glass to space: one flat tint, blended over the sky (drawn after the level)
      const c = base.clone().multiplyScalar(brightness);
      for (const f of FACES) {
        const pts = f.corners.map(([x, y, z]) => boxCorner(b, x, y, z));
        glassGeo.quad(pts[0], pts[1], pts[2], pts[3], c, c, c, c);
      }
      return;
    }
    if (def.sideTint && mat !== 'trim' && mat !== 'teamA' && mat !== 'teamB' && mat !== 'glass') {
      // fade from neutral in the middle to the team color on each half
      const k = Math.min(1, Math.abs(b.c.x) / 30) * def.sideTint.amount;
      if (k > 0) base.lerp(b.c.x < 0 ? tintNeg! : tintPos!, k);
    }
    const isTrim = mat === 'trim';
    const tex = TEX_OF[mat];
    FACES.forEach((f, fi) => {
      const n = b.q ? qRotate(b.q, f.n) : f.n;
      const pts = f.corners.map(([x, y, z]) => boxCorner(b, x, y, z));
      if (isTrim) {
        const c = base.clone().multiplyScalar(brightness);
        trims.quad(pts[0], pts[1], pts[2], pts[3], c, c, c, c);
        return;
      }
      if (mat === 'glass') {
        // windows: unlit starfield
        const c = base.clone().multiplyScalar(0.9 * brightness);
        builder('stars').quad(pts[0], pts[1], pts[2], pts[3], c, c, c, c, faceUvs(pts, n, 'stars'));
        return;
      }
      const variation = hash(bi * 7 + fi);
      const vertical = Math.abs(n.y) < 0.5;
      const cols = f.corners.map(([, y]) => shade(base, n, variation, vertical && y < 0, ambient));
      tiledQuad(builder(tex ?? 'none'), pts, cols, n, bi * 31 + fi, tex, base, lightAt, brightness);
    });
    if (b.trim !== undefined)
      addTrims(trims, b, new THREE.Color(b.trim).multiplyScalar(brightness));
  });

  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  for (const [k, gb] of builders) {
    if (gb.empty) continue;
    const geo = gb.build();
    const map = k === 'none' ? null : surfaceTexture(k);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, map });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    disposables.push(geo, mat);
  }
  if (!trims.empty) {
    const trimGeo = trims.build();
    const trimMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
    const trimMesh = new THREE.Mesh(trimGeo, trimMat);
    trimMesh.matrixAutoUpdate = false;
    group.add(trimMesh);
    disposables.push(trimGeo, trimMat);
  }

  if (!glassGeo.empty) {
    const geo = glassGeo.build();
    // front faces only: looking through a glass slab tints once, not twice
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 1;
    group.add(mesh);
    disposables.push(geo, mat);
  }
  // space outside the ship: stars + moons (2 draws; shown in every effects level, it's scenery
  // players look at through the glass, not decoration)
  if (def.sky) {
    const sky = buildSky(def, def.sky);
    group.add(sky.group);
    disposables.push(sky);
  }

  const extras = buildExtras(def, opts.dust ?? true);
  group.add(extras.group);
  disposables.push(extras);
  if (opts.atmosphere ?? true) {
    const atmo = buildAtmosphere(def, lightDefs, level);
    group.add(atmo.group);
    disposables.push(atmo);
  }

  return {
    group,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
};

/** World-aligned UVs so textures line up across neighboring boxes (crates: one per face). */
const faceUvs = (pts: Vec3[], n: Vec3, kind: TexKind | null): [number, number][] => {
  const scale = kind ? TEX_SCALE[kind] : null;
  if (scale === null) {
    return [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ];
  }
  return pts.map((p) => worldUv(p, n, scale));
};

const worldUv = (p: Vec3, n: Vec3, scale: number): [number, number] => {
  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  if (ay >= ax && ay >= az) return [p.x / scale, p.z / scale];
  if (ax >= az) return [p.z / scale, p.y / scale];
  return [p.x / scale, p.y / scale];
};

const TILE = 2.5;

/**
 * Split a face into ~2.5 m panels (gives lighting per-vertex detail and a subtle checker
 * tint, which makes speed readable) and bake point lights at every vertex.
 */
const tiledQuad = (
  g: GeoBuilder,
  pts: Vec3[],
  cols: THREE.Color[],
  n: Vec3,
  seed: number,
  kind: TexKind | null,
  base: THREE.Color,
  lightAt: (p: Vec3, n: Vec3) => THREE.Color,
  brightness: number,
): void => {
  const [p0, p1, , p3] = pts;
  const l1 = len(sub(p1, p0));
  const l2 = len(sub(p3, p0));
  const nu = Math.min(48, Math.max(1, Math.round(l1 / TILE)));
  const nv = Math.min(48, Math.max(1, Math.round(l2 / TILE)));
  const faceUv = kind !== null && TEX_SCALE[kind] === null;
  const scale = kind ? (TEX_SCALE[kind] ?? 1) : 1;
  const at = (u: number, v: number): Vec3 => {
    const a = lerp3(pts[0], pts[1], u);
    const b = lerp3(pts[3], pts[2], u);
    return lerp3(a, b, v);
  };
  const colAt = (p: Vec3, u: number, v: number, tint: number): THREE.Color => {
    const a = cols[0].clone().lerp(cols[1], u);
    const b = cols[3].clone().lerp(cols[2], u);
    const c = a.lerp(b, v).multiplyScalar(tint);
    const L = lightAt(p, n);
    // lights tint the surface color, plus a little of their own color (colored glow)
    c.r += (base.r * 1.1 + 0.12) * L.r * brightness;
    c.g += (base.g * 1.1 + 0.12) * L.g * brightness;
    c.b += (base.b * 1.1 + 0.12) * L.b * brightness;
    return c;
  };
  const uvAt = (p: Vec3, u: number, v: number): [number, number] =>
    faceUv
      ? [u * Math.max(1, Math.round(l1 / 3)), v * Math.max(1, Math.round(l2 / 3))]
      : worldUv(p, n, scale);
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const u0 = i / nu,
        u1 = (i + 1) / nu,
        v0 = j / nv,
        v1 = (j + 1) / nv;
      const tint =
        ((i + j) % 2 === 0 ? 1.02 : 0.98) * (0.985 + hash(seed * 977 + i * 131 + j) * 0.03);
      const q = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
      const uvw: [number, number][] = [
        [u0, v0],
        [u1, v0],
        [u1, v1],
        [u0, v1],
      ];
      g.quad(
        q[0],
        q[1],
        q[2],
        q[3],
        colAt(q[0], u0, v0, tint),
        colAt(q[1], u1, v0, tint),
        colAt(q[2], u1, v1, tint),
        colAt(q[3], u0, v1, tint),
        q.map((p, k) => uvAt(p, uvw[k][0], uvw[k][1])),
      );
    }
};

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 =>
  v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

/** Glowing halos at every light, and soft light shafts under ceiling lights. */
const buildAtmosphere = (
  def: LevelDef,
  lights: LightDef[],
  level: Level,
): { group: THREE.Group; dispose(): void } => {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const glow = glowTexture();
  if (!glow) return { group, dispose: () => {} };
  disposables.push(glow);
  // halos: one sprite per light, sized by its strength, grouped by color
  const byColor = new Map<number, LightDef[]>();
  for (const l of lights) {
    const list = byColor.get(l.color) ?? [];
    list.push(l);
    byColor.set(l.color, list);
  }
  for (const [color, list] of byColor) {
    const mat = new THREE.SpriteMaterial({
      map: glow,
      color,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    disposables.push(mat);
    for (const l of list) {
      const s = new THREE.Sprite(mat);
      s.position.set(l.pos.x, l.pos.y, l.pos.z);
      const size = Math.min(4, 0.6 + l.intensity * l.radius * 0.18);
      s.scale.set(size, size, 1);
      group.add(s);
    }
  }
  // light shafts: open cones from the light down to whatever is below
  const shafts = (def.lights ?? []).filter((l) => l.shaft);
  if (shafts.length) {
    for (const l of shafts) {
      const hit = level ? raycastDown(level, l.pos) : 8;
      const h = Math.max(1, hit);
      const geo = new THREE.CylinderGeometry(0.4, Math.min(4.5, 0.4 + h * 0.35), h, 20, 1, true);
      geo.translate(0, -h / 2, 0);
      const mat = new THREE.MeshBasicMaterial({
        color: l.color,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(l.pos.x, l.pos.y, l.pos.z);
      group.add(m);
      disposables.push(geo, mat);
    }
  }
  return { group, dispose: () => disposables.forEach((d) => d.dispose()) };
};

const raycastDown = (level: Level, from: Vec3): number => {
  for (let d = 0.5; d < 30; d += 0.5)
    if (!lineOfSight(level, from, v3(from.x, from.y - d, from.z))) return d - 0.25;
  return 30;
};

/** Thin glowing strips along the top (and for tall boxes, bottom) edges of a box. */
const addTrims = (g: GeoBuilder, b: BoxDef, color: THREE.Color): void => {
  const w = 0.07;
  const edges: [number, number, number, number, number, number][] = [
    // along x at top front/back
    [-1, 1, -1, 1, 1, -1],
    [-1, 1, 1, 1, 1, 1],
    [-1, 1, -1, -1, 1, 1],
    [1, 1, -1, 1, 1, 1],
  ];
  const tall = b.h.y > 1.5;
  if (tall) {
    edges.push(
      [-1, -1, -1, 1, -1, -1],
      [-1, -1, 1, 1, -1, 1],
      [-1, -1, -1, -1, -1, 1],
      [1, -1, -1, 1, -1, 1],
    );
  }
  for (const [x0, y0, z0, x1, y1, z1] of edges) {
    const a = boxCorner(b, x0, y0, z0);
    const c = boxCorner(b, x1, y1, z1);
    const dir = sub(c, a);
    if (lenSq(dir) < 1e-6) continue;
    // the strip lies on the side faces just below/above the edge
    const upL = b.q ? qRotate(b.q, v3(0, y0 > 0 ? -1 : 1, 0)) : v3(0, y0 > 0 ? -1 : 1, 0);
    const out = normalize(cross(dir, upL));
    const offs = [out, v3(-out.x, -out.y, -out.z)];
    for (const o of offs) {
      const e = 0.012;
      const p0 = v3(a.x + o.x * e, a.y + o.y * e, a.z + o.z * e);
      const p1 = v3(c.x + o.x * e, c.y + o.y * e, c.z + o.z * e);
      const p2 = v3(p1.x + upL.x * w, p1.y + upL.y * w, p1.z + upL.z * w);
      const p3 = v3(p0.x + upL.x * w, p0.y + upL.y * w, p0.z + upL.z * w);
      if (len(dir) > 0) g.quad(p0, p1, p2, p3, color, color, color, color);
      g.quad(p3, p2, p1, p0, color, color, color, color);
    }
  }
};

/** Rails, gravity-zone hints, launch pads, portals. */
const buildExtras = (def: LevelDef, dust: boolean): { group: THREE.Group; dispose(): void } => {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];

  // zip-rails: glowing tubes
  const railMat = new THREE.MeshBasicMaterial({ color: 0x3dff9a });
  disposables.push(railMat);
  for (const r of def.rails) {
    const curve = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1];
      const b = r.points[i];
      curve.add(
        new THREE.LineCurve3(new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)),
      );
    }
    const geo = new THREE.TubeGeometry(curve, Math.max(2, r.points.length * 8), 0.07, 6, false);
    disposables.push(geo);
    group.add(new THREE.Mesh(geo, railMat));
  }

  // gravity zones: faint edges + floating chevrons pointing "down"
  const chevronGeo = new THREE.ConeGeometry(0.12, 0.35, 4);
  chevronGeo.rotateX(Math.PI); // point along -Y by default
  disposables.push(chevronGeo);
  for (const z of def.zones) {
    const g = z.gravity;
    const zeroG = lenSq(g) < 1e-6;
    const isDefault =
      !zeroG &&
      g.x === def.defaultGravity.x &&
      g.y === def.defaultGravity.y &&
      g.z === def.defaultGravity.z;
    if (isDefault) continue;
    const color = zeroG ? 0xa46bff : 0xff8a1f;
    const size = new THREE.Vector3(z.max.x - z.min.x, z.max.y - z.min.y, z.max.z - z.min.z);
    const center = new THREE.Vector3(
      (z.max.x + z.min.x) / 2,
      (z.max.y + z.min.y) / 2,
      (z.max.z + z.min.z) / 2,
    );
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z));
    const edgeMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 });
    disposables.push(edges, edgeMat);
    const lines = new THREE.LineSegments(edges, edgeMat);
    lines.position.copy(center);
    group.add(lines);

    if (zeroG && dust) {
      // drifting dust motes
      const count = Math.min(400, Math.floor((size.x * size.y * size.z) / 40));
      const pts = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pts[i * 3] = z.min.x + hash(i * 3 + 1) * size.x;
        pts[i * 3 + 1] = z.min.y + hash(i * 3 + 2) * size.y;
        pts[i * 3 + 2] = z.min.z + hash(i * 3 + 3) * size.z;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xc9b3ff,
        size: 0.08,
        transparent: true,
        opacity: 0.6,
      });
      disposables.push(geo, mat);
      const motes = new THREE.Points(geo, mat);
      motes.userData.spin = true;
      group.add(motes);
    } else if (!zeroG) {
      const dir = new THREE.Vector3(g.x, g.y, g.z).normalize();
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      });
      disposables.push(mat);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      const spacing = 5;
      const inst: THREE.Matrix4[] = [];
      for (let x = z.min.x + 2; x < z.max.x - 1; x += spacing)
        for (let y = z.min.y + 2; y < z.max.y - 1; y += spacing)
          for (let zz = z.min.z + 2; zz < z.max.z - 1; zz += spacing)
            inst.push(
              new THREE.Matrix4().compose(
                new THREE.Vector3(x, y, zz),
                q,
                new THREE.Vector3(1, 1, 1),
              ),
            );
      const mesh = new THREE.InstancedMesh(chevronGeo, mat, Math.max(1, inst.length));
      inst.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.count = inst.length;
      group.add(mesh);
    }
  }
  // launch pads: chevrons floating up along the throw
  const padMat = new THREE.MeshBasicMaterial({
    color: 0xffb347,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  disposables.push(padMat);
  for (const pad of def.launchPads ?? []) {
    const dir = new THREE.Vector3(pad.vel.x, pad.vel.y, pad.vel.z).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(chevronGeo, padMat);
      m.position.set(
        (pad.min.x + pad.max.x) / 2 + dir.x * (0.5 + i * 0.6),
        pad.min.y + 0.3 + dir.y * (0.3 + i * 0.6),
        (pad.min.z + pad.max.z) / 2 + dir.z * (0.5 + i * 0.6),
      );
      m.quaternion.copy(q);
      m.scale.setScalar(2.2);
      group.add(m);
    }
  }

  // portals: a glowing disc in a spinning ring, facing along the portal's thin axis
  const ringGeo = new THREE.TorusGeometry(1.9, 0.08, 6, 40);
  const discGeo = new THREE.CircleGeometry(1.85, 40);
  disposables.push(ringGeo, discGeo);
  for (const pt of def.portals ?? []) {
    const ringMat = new THREE.MeshBasicMaterial({ color: pt.color });
    const discMat = new THREE.MeshBasicMaterial({
      color: pt.color,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    disposables.push(ringMat, discMat);
    const g = new THREE.Group();
    g.position.set(
      (pt.min.x + pt.max.x) / 2,
      Math.min(pt.max.y, pt.min.y + 2.1),
      (pt.min.z + pt.max.z) / 2,
    );
    // the disc's normal is local +Z: turn it toward the thin axis (x or z)
    if (pt.max.x - pt.min.x < pt.max.z - pt.min.z) g.rotation.y = Math.PI / 2;
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.userData.portalSpin = true;
    g.add(ring, new THREE.Mesh(discGeo, discMat));
    group.add(g);
  }
  return { group, dispose: () => disposables.forEach((d) => d.dispose()) };
};
