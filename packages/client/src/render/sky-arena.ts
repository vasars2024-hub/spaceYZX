// The sky duel overtime's look (level/sky-arena.ts in shared): the floating platforms, a bright
// sky, a sea of clouds below and a few big clouds around. Only drawn while the camera is up
// there; then the scene's fog and background turn sky-blue and the space sky (stars, moons) is
// hidden, and everything goes back to the ship look when you leave. Cheap on purpose (weak
// laptops): no lights, no shadows; the arena is one merged vertex-coloured mesh, the sky a
// vertex-coloured dome, the cloud sea one textured plane, the clouds a handful of sprites
// (fewer with decoration off). Two small canvas textures in total.
import * as THREE from 'three';
import type { LevelDef, SkyArenaDef } from '@space-yz/shared';
import { inSkyZone } from '@space-yz/shared';
import { SPACE_SKY_NAME } from './sky';

const SKY_TOP = new THREE.Color(0x2f7fdc);
const SKY_HORIZON = new THREE.Color(0xc4e2ff);
const SKY_BELOW = new THREE.Color(0xe8f3ff);
const FOG = { color: 0xc4e2ff, near: 90, far: 520 };
const DOME_R = 520; // inside the camera's 600 m far plane

/** Deterministic 0..1 noise (the same clouds every time). */
const hash = (n: number): number => {
  let x = Math.imul(n ^ 0x5bd1e995, 0x27d4eb2d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967295;
};

const MAT_COLOR: Record<string, number> = {
  plate: 0xdfe7f0,
  grate: 0xc3cfdc,
  crate: 0xe9b066,
  pillar: 0x9db0c6,
};

const canvasTexture = (size: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

/** A soft puff: a few overlapping radial blobs fading out at the edges. */
const puffTexture = () =>
  canvasTexture(128, (g) => {
    for (let i = 0; i < 7; i++) {
      const x = 64 + (hash(i * 3 + 1) - 0.5) * 50;
      const y = 70 + (hash(i * 3 + 2) - 0.5) * 26;
      const r = 26 + hash(i * 3 + 3) * 22;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.9)');
      grd.addColorStop(0.6, 'rgba(248,251,255,0.55)');
      grd.addColorStop(1, 'rgba(240,247,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
    }
  });

/** The cloud sea: white with soft blue-grey hollows (tiles seamlessly). */
const seaTexture = () =>
  canvasTexture(256, (g) => {
    g.fillStyle = '#f4f8ff';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 40; i++) {
      const x = hash(i * 5 + 11) * 256;
      const y = hash(i * 5 + 12) * 256;
      const r = 14 + hash(i * 5 + 13) * 34;
      // draw each hollow wrapped around the edges so the texture tiles
      for (const ox of [-256, 0, 256])
        for (const oy of [-256, 0, 256]) {
          const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          grd.addColorStop(0, 'rgba(176,198,228,0.45)');
          grd.addColorStop(1, 'rgba(176,198,228,0)');
          g.fillStyle = grd;
          g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
        }
    }
  });

/** One merged, vertex-coloured mesh for all the arena's boxes (+ team stripes). */
const arenaMesh = (a: SkyArenaDef, teamHex: readonly [number, number]): THREE.Mesh => {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const addBox = (
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    hex: number,
    flat = false,
  ) => {
    const g = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2).toNonIndexed();
    g.translate(cx, cy, cz);
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      // cheap shading: lit tops, mid sides (a little lighter toward the "sun"), dark bottoms
      const ny = n.getY(i);
      const k = flat
        ? 1
        : ny > 0.5
          ? 1
          : ny < -0.5
            ? 0.42
            : 0.7 + 0.1 * n.getX(i) + 0.06 * n.getZ(i);
      c.setHex(hex).multiplyScalar(k);
      col.push(c.r, c.g, c.b);
    }
    g.dispose();
  };
  for (const b of a.boxes)
    addBox(b.c.x, b.c.y, b.c.z, b.h.x, b.h.y, b.h.z, MAT_COLOR[b.mat ?? 'plate'] ?? 0xdfe7f0);
  // the main platform (the first box): a darker keel underneath and team-coloured stripes
  // along each end (team 0 starts at -x)
  const m = a.boxes[0];
  addBox(m.c.x, m.c.y - m.h.y - 0.9, m.c.z, m.h.x * 0.7, 0.9, m.h.z * 0.6, 0x6d7d92);
  for (const side of [-1, 1] as const)
    addBox(
      m.c.x + side * (m.h.x - 0.35),
      m.c.y + m.h.y + 0.012,
      m.c.z,
      0.18,
      0.012,
      m.h.z - 0.3,
      teamHex[side < 0 ? 0 : 1],
      true,
    );
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true }));
  mesh.matrixAutoUpdate = false;
  return mesh;
};

const skyDome = (): THREE.Mesh => {
  const g = new THREE.SphereGeometry(DOME_R, 24, 12);
  const p = g.getAttribute('position');
  const cols = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / DOME_R;
    if (y >= 0) c.copy(SKY_HORIZON).lerp(SKY_TOP, Math.pow(y, 0.6));
    else c.copy(SKY_HORIZON).lerp(SKY_BELOW, Math.min(1, -y * 4));
    cols.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const mesh = new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    }),
  );
  // drawn first, behind everything (it follows the camera)
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
};

export class SkyArenaView {
  readonly group = new THREE.Group();
  private dome: THREE.Mesh | null = null;
  private clouds = new THREE.Group();
  private on = false;
  private saved: { bg: THREE.Color | THREE.Texture | null; fog: [number, number, number] } | null =
    null;
  private disposables: { dispose(): void }[] = [];

  constructor(
    private def: LevelDef,
    teamHex: readonly [number, number],
    decoration: boolean,
  ) {
    this.group.visible = false;
    const a = def.skyArena;
    if (!a) return;
    const arena = arenaMesh(a, teamHex);
    this.dome = skyDome();
    // the cloud sea below: hides the ship far underneath
    const seaTex = seaTexture();
    seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping;
    seaTex.repeat.set(7, 7);
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400),
      new THREE.MeshBasicMaterial({ map: seaTex }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(a.center.x, a.center.y - 48, a.center.z);
    // big soft clouds around (and some under) the arena, drifting slowly
    const puff = puffTexture();
    const puffMat = new THREE.SpriteMaterial({ map: puff, depthWrite: false, transparent: true });
    const n = decoration ? 30 : 14;
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(puffMat);
      const near = i % 5 === 0; // every fifth cloud hangs just under the arena
      const ang = hash(i * 7 + 1) * Math.PI * 2;
      const dist = near ? 35 + hash(i * 7 + 2) * 40 : 90 + hash(i * 7 + 2) * 300;
      const y = near ? -18 - hash(i * 7 + 3) * 18 : -40 + hash(i * 7 + 3) * 75;
      const size = near ? 30 + hash(i * 7 + 4) * 25 : 45 + hash(i * 7 + 4) * 80;
      s.position.set(Math.cos(ang) * dist, y, Math.sin(ang) * dist);
      s.scale.set(size, size * 0.55, 1);
      this.clouds.add(s);
    }
    this.clouds.position.set(a.center.x, a.center.y, a.center.z);
    this.group.add(this.dome, arena, sea, this.clouds);
    this.disposables.push(
      arena.geometry,
      arena.material as THREE.Material,
      this.dome.geometry,
      this.dome.material as THREE.Material,
      sea.geometry,
      sea.material as THREE.Material,
      seaTex,
      puff,
      puffMat,
    );
  }

  /** Call every frame with the camera: switches the sky look on/off as it enters/leaves. */
  update(scene: THREE.Scene, eye: THREE.Vector3, time: number): void {
    const on = !!this.dome && inSkyZone(this.def, eye);
    if (on !== this.on) {
      this.on = on;
      this.group.visible = on;
      const space = scene.getObjectByName(SPACE_SKY_NAME);
      if (space) space.visible = !on;
      const fog = scene.fog instanceof THREE.Fog ? scene.fog : null;
      if (on) {
        this.saved = {
          bg: scene.background as THREE.Color | THREE.Texture | null,
          fog: fog ? [fog.color.getHex(), fog.near, fog.far] : [FOG.color, FOG.near, FOG.far],
        };
        scene.background = SKY_HORIZON.clone();
        if (fog) {
          fog.color.setHex(FOG.color);
          fog.near = FOG.near;
          fog.far = FOG.far;
        }
      } else if (this.saved) {
        scene.background = this.saved.bg;
        if (fog) {
          fog.color.setHex(this.saved.fog[0]);
          fog.near = this.saved.fog[1];
          fog.far = this.saved.fog[2];
        }
        this.saved = null;
      }
    }
    if (!on) return;
    this.dome!.position.copy(eye);
    this.clouds.rotation.y = time * 0.006;
  }

  dispose(scene: THREE.Scene): void {
    if (this.on) this.update(scene, new THREE.Vector3(0, -1e9, 0), 0);
    this.group.removeFromParent();
    this.disposables.forEach((d) => d.dispose());
  }
}
