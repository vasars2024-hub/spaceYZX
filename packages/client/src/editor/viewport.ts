// MAP MAKER — the 3D view: the map's pieces drawn as a few instanced meshes (a race map's
// thousands of boxes stay a handful of draw calls), the game's sky, a faint 1 m grid on every
// surface, and the editor's overlays: selection outlines, the placement ghost, gameplay markers
// (start / checkpoints / finish / spawns / portals / launch pads) and moving-block paths.
import * as THREE from 'three';
import type { BoxDef, LevelDef, Material, OutdoorSkyDef, SkyDef } from '@space-yz/shared';
import { MATERIAL_COLORS } from '../render/level-mesh';
import { buildOutdoorSky, buildSky, type SkyMeshes } from '../render/sky';

/** How the map looks around the pieces (from the built-in map, or the custom sky). */
export interface EditorLook {
  outdoor?: OutdoorSkyDef;
  sky?: SkyDef;
  fog?: { color: number; near: number; far: number };
  /** middle of the map (the space sky is centred there) */
  centre: [number, number, number];
}

type LookKind = 'solid' | 'glass' | 'bright' | 'field' | 'cloud' | 'hidden';

const lookOf = (b: BoxDef): LookKind => {
  if (b.noRender) return 'hidden';
  const m: Material = b.mat ?? 'hull';
  if (m === 'glass' || m === 'skyglass') return 'glass';
  if (m === 'trim' || m === 'glow') return 'bright';
  if (m === 'forcefield') return 'field';
  if (m === 'cloud') return 'cloud';
  return 'solid';
};

export const colorOf = (b: BoxDef): number => b.color ?? MATERIAL_COLORS[b.mat ?? 'hull'];

// ---------------------------------------------------------------------------------------------
// geometry: a unit box or prism (-1..1), scaled per instance by the half extents

const prismKey = (b: BoxDef): string =>
  b.prism === undefined ? 'box' : `p${Math.round(Math.max(-1, Math.min(1, b.prism)) * 20)}`;

const geoCache = new Map<string, THREE.BufferGeometry>();

/** The unit shape for a key ('box' or 'p<prism × 20>'). Kept for the editor's lifetime. */
const unitGeometry = (key: string): THREE.BufferGeometry => {
  let g = geoCache.get(key);
  if (g) return g;
  if (key === 'box') g = new THREE.BoxGeometry(2, 2, 2);
  else {
    const r = Number(key.slice(1)) / 20;
    // base corners + a ridge along x at z = r on top
    const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const b0 = P(-1, -1, -1),
      b1 = P(1, -1, -1),
      b2 = P(1, -1, 1),
      b3 = P(-1, -1, 1),
      t0 = P(-1, 1, r),
      t1 = P(1, 1, r);
    const tris: THREE.Vector3[][] = [
      [b0, b1, b2],
      [b0, b2, b3], // bottom (faces down)
      [b3, b2, t1],
      [b3, t1, t0], // +z slope
      [b1, b0, t0],
      [b1, t0, t1], // -z slope
      [b0, b3, t0], // -x end
      [b2, b1, t1], // +x end
    ];
    const pos: number[] = [];
    for (const t of tris) {
      // wind so the normal points out (away from the centre)
      const n = new THREE.Vector3()
        .subVectors(t[1], t[0])
        .cross(new THREE.Vector3().subVectors(t[2], t[0]));
      const c = new THREE.Vector3()
        .add(t[0])
        .add(t[1])
        .add(t[2])
        .multiplyScalar(1 / 3);
      const tt = n.dot(c) < 0 ? [t[0], t[2], t[1]] : t;
      for (const v of tt) pos.push(v.x, v.y, v.z);
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
  }
  geoCache.set(key, g);
  return g;
};

// ---------------------------------------------------------------------------------------------
// materials

/** Lambert with a faint world-space 1 m grid on every face (scale reads at a glance). */
const gridLambert = (opts: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial => {
  const m = new THREE.MeshLambertMaterial(opts);
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vEdWorld;\nvarying vec3 vEdNormal;',
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 edWp = vec4(transformed, 1.0);
        vec3 edN = objectNormal;
        #ifdef USE_INSTANCING
          edWp = instanceMatrix * edWp;
          edN = mat3(instanceMatrix) * edN;
        #endif
        vEdWorld = (modelMatrix * edWp).xyz;
        vEdNormal = normalize(mat3(modelMatrix) * edN);`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vEdWorld;\nvarying vec3 vEdNormal;',
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        vec3 edG = abs(fract(vEdWorld - 0.5) - 0.5) / max(fwidth(vEdWorld), vec3(1e-4));
        edG += step(0.6, abs(vEdNormal)) * 1e6;
        float edLine = 1.0 - min(min(min(edG.x, edG.y), edG.z), 1.0);
        gl_FragColor.rgb *= 1.0 - 0.13 * edLine;`,
      );
  };
  return m;
};

/** Everything of one look (and shape) as one instanced mesh. */
const buildBuckets = (
  boxes: BoxDef[],
  mats: Record<LookKind, THREE.Material>,
  showHidden: boolean,
): THREE.Group => {
  const group = new THREE.Group();
  const groups = new Map<string, BoxDef[]>();
  for (const b of boxes) {
    const look = lookOf(b);
    if (look === 'hidden' && !showHidden) continue;
    const key = `${look}|${prismKey(b)}`;
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(b);
  }
  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  for (const [key, list] of groups) {
    const [look, shape] = key.split('|') as [LookKind, string];
    const mesh = new THREE.InstancedMesh(unitGeometry(shape), mats[look], list.length);
    list.forEach((b, i) => {
      p.set(b.c.x, b.c.y, b.c.z);
      if (b.q) q.set(b.q.x, b.q.y, b.q.z, b.q.w);
      else q.identity();
      s.set(Math.max(1e-3, b.h.x), Math.max(1e-3, b.h.y), Math.max(1e-3, b.h.z));
      mesh.setMatrixAt(i, m4.compose(p, q, s));
      mesh.setColorAt(i, col.setHex(colorOf(b)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    if (look === 'glass' || look === 'field' || look === 'hidden') mesh.renderOrder = 2;
    group.add(mesh);
  }
  // glowing edges (glass panes have them, so you see where the glass is)
  const trimmed = boxes.filter((b) => b.trim !== undefined && !b.noRender);
  if (trimmed.length) {
    const geo = outlineGeometry(trimmed);
    const n = geo.getAttribute('position').count;
    const cols = new Float32Array(n * 3);
    const per = n / trimmed.length;
    trimmed.forEach((b, i) => {
      col.setHex(b.trim!);
      for (let k = 0; k < per; k++) cols.set([col.r, col.g, col.b], (i * per + k) * 3);
    });
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }),
    );
    lines.renderOrder = 2;
    group.add(lines);
  }
  return group;
};

/** Free the instance buffers of a bucket group (the shapes and materials are shared). */
const disposeBuckets = (g: THREE.Group): void => {
  for (const o of g.children) {
    if (o instanceof THREE.InstancedMesh) o.dispose();
    else if (o instanceof THREE.LineSegments) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  }
};

/** Edges of pieces (selection / hover outlines), one line mesh. */
const outlineGeometry = (boxes: BoxDef[]): THREE.BufferGeometry => {
  const pos: number[] = [];
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();
  for (const b of boxes) {
    if (b.q) q.set(b.q.x, b.q.y, b.q.z, b.q.w);
    else q.identity();
    const pr = b.prism === undefined ? null : Math.max(-1, Math.min(1, b.prism));
    const corner = (x: number, y: number, z: number): number[] => {
      const zz = pr !== null && y > 0 ? pr : z;
      v.set(x * b.h.x, y * b.h.y, zz * b.h.z).applyQuaternion(q);
      return [b.c.x + v.x, b.c.y + v.y, b.c.z + v.z];
    };
    const edges: [number, number, number, number, number, number][] = [
      [-1, -1, -1, 1, -1, -1],
      [-1, -1, 1, 1, -1, 1],
      [-1, 1, -1, 1, 1, -1],
      [-1, 1, 1, 1, 1, 1],
      [-1, -1, -1, -1, -1, 1],
      [1, -1, -1, 1, -1, 1],
      [-1, 1, -1, -1, 1, 1],
      [1, 1, -1, 1, 1, 1],
      [-1, -1, -1, -1, 1, -1],
      [1, -1, -1, 1, 1, -1],
      [-1, -1, 1, -1, 1, 1],
      [1, -1, 1, 1, 1, 1],
    ];
    for (const [a, bb, c, d, e, f] of edges) pos.push(...corner(a, bb, c), ...corner(d, e, f));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
};

// ---------------------------------------------------------------------------------------------
// labels

const labelCache = new Map<string, THREE.SpriteMaterial>();

/** A text label sprite (always on top). */
export const labelSprite = (text: string, color = '#ffffff', size = 1.2): THREE.Sprite => {
  const key = `${text}|${color}`;
  let mat = labelCache.get(key);
  if (!mat) {
    const c = document.createElement('canvas');
    const fs = 64;
    const ctx = c.getContext('2d')!;
    ctx.font = `800 ${fs}px Segoe UI, system-ui, sans-serif`;
    const w = Math.ceil(ctx.measureText(text).width) + 28;
    c.width = w;
    c.height = fs + 24;
    const ctx2 = c.getContext('2d')!;
    ctx2.font = `800 ${fs}px Segoe UI, system-ui, sans-serif`;
    ctx2.fillStyle = 'rgba(5,7,13,0.72)';
    ctx2.beginPath();
    ctx2.roundRect(0, 0, c.width, c.height, 18);
    ctx2.fill();
    ctx2.fillStyle = color;
    ctx2.textBaseline = 'middle';
    ctx2.textAlign = 'center';
    ctx2.fillText(text, c.width / 2, c.height / 2 + 3);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, fog: false });
    labelCache.set(key, mat);
  }
  const s = new THREE.Sprite(mat);
  const img = mat.map!.image as HTMLCanvasElement;
  s.scale.set((size * img.width) / img.height, size, 1);
  s.renderOrder = 10;
  return s;
};

// ---------------------------------------------------------------------------------------------

/** A marker drawn for a gameplay object (built by the editor, see markers in editor.ts). */
export interface MarkerSpec {
  /** a translucent volume (gates, portal entries, pads) or a solid thing */
  box: BoxDef;
  color: number;
  /** filled see-through (volumes) or solid */
  kind: 'volume' | 'solid';
  label?: string;
  labelColor?: string;
  /** a line from the box to here (portal exit, pad throw) */
  lineTo?: [number, number, number];
  /** an arrow along this direction from the centre (facing) */
  arrow?: [number, number, number];
}

/** A moving block: its pieces at point 1 and its path. */
export interface MoverSpec {
  boxes: BoxDef[];
  points: [number, number, number][];
  /** the block's own position (point 1) */
  origin: [number, number, number];
  /** position at time t (seconds) */
  posAt: (t: number) => [number, number, number];
  selected: boolean;
}

export class EditorViewport {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private mats: Record<LookKind, THREE.Material>;
  private baseLayer: THREE.Group | null = null;
  private docLayer: THREE.Group | null = null;
  private markerLayer = new THREE.Group();
  private moverLayer = new THREE.Group();
  private movers: { group: THREE.Group; spec: MoverSpec }[] = [];
  private sky: SkyMeshes | null = null;
  private selLines: THREE.LineSegments;
  private hoverLines: THREE.LineSegments;
  private ghost: THREE.Group | null = null;
  private ghostMats: { ok: THREE.Material; bad: THREE.Material; line: THREE.LineBasicMaterial };
  private grid: THREE.GridHelper | null = null;
  private handleLayer = new THREE.Group();
  private handleGeo = {
    ball: new THREE.SphereGeometry(0.45, 16, 12),
    cone: new THREE.ConeGeometry(0.4, 0.9, 12),
  };
  private handleMats = {
    end: new THREE.MeshBasicMaterial({ color: 0x5ff0ff, depthTest: false, transparent: true }),
    up: new THREE.MeshBasicMaterial({ color: 0xff8a1f, depthTest: false, transparent: true }),
    line: new THREE.LineBasicMaterial({ color: 0xff8a1f, depthTest: false, transparent: true }),
  };
  private gridStep = 0;
  /** what each overlay layer made (freed when the layer is rebuilt) */
  private trash: Record<'mover' | 'marker' | 'handle', { dispose(): void }[]> = {
    mover: [],
    marker: [],
    handle: [],
  };

  private empty(layer: 'mover' | 'marker' | 'handle'): void {
    for (const d of this.trash[layer]) d.dispose();
    this.trash[layer] = [];
  }
  private time = 0;
  /** show invisible colliders (noRender boxes) */
  showHidden = false;
  /** animate moving blocks */
  previewMotion = true;

  constructor(private renderer: THREE.WebGLRenderer) {
    this.camera = new THREE.PerspectiveCamera(80, 1, 0.05, 2500);
    this.camera.rotation.order = 'YXZ';
    this.mats = {
      solid: gridLambert({ color: 0xffffff }),
      glass: new THREE.MeshLambertMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      }),
      bright: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      field: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
      cloud: new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.86 }),
      hidden: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        wireframe: false,
      }),
    };
    this.ghostMats = {
      ok: new THREE.MeshBasicMaterial({
        color: 0x5ff0ff,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
      bad: new THREE.MeshBasicMaterial({
        color: 0xff4a5e,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
      line: new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
    };
    // lights: a sun from the same side as the game's baked key light, and a sky/ground fill
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(0.35, 1, 0.25);
    this.scene.add(sun, new THREE.HemisphereLight(0xdfe9ff, 0x4a4036, 1.35));
    this.selLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffd23f, depthTest: false, transparent: true }),
    );
    this.selLines.renderOrder = 8;
    this.selLines.frustumCulled = false;
    this.hoverLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
    );
    this.hoverLines.renderOrder = 7;
    this.hoverLines.frustumCulled = false;
    this.scene.add(
      this.markerLayer,
      this.moverLayer,
      this.selLines,
      this.hoverLines,
      this.handleLayer,
    );
  }

  setLook(look: EditorLook): void {
    this.sky?.dispose();
    if (this.sky) this.scene.remove(this.sky.group);
    this.sky = null;
    const fake = {
      boundsMin: { x: look.centre[0], y: look.centre[1], z: look.centre[2] },
      boundsMax: { x: look.centre[0], y: look.centre[1], z: look.centre[2] },
    } as LevelDef;
    if (look.outdoor) this.sky = buildOutdoorSky(fake, look.outdoor);
    else if (look.sky) this.sky = buildSky(fake, look.sky);
    if (this.sky) this.scene.add(this.sky.group);
    const bg = look.outdoor?.horizon ?? look.fog?.color ?? 0x05070d;
    this.scene.background = new THREE.Color(bg);
    // the editor sees further than the game (you fly around the whole map)
    this.scene.fog = look.fog
      ? new THREE.Fog(look.fog.color, Math.max(look.fog.near, 120), Math.max(look.fog.far * 2, 600))
      : null;
  }

  /** The built-in map's boxes (changes only when a base box is deleted or adopted). */
  setBase(boxes: BoxDef[]): void {
    if (this.baseLayer) {
      this.scene.remove(this.baseLayer);
      disposeBuckets(this.baseLayer);
    }
    this.baseLayer = buildBuckets(boxes, this.mats, this.showHidden);
    this.scene.add(this.baseLayer);
  }

  /** The doc's own blocks (not the moving ones). */
  setDoc(boxes: BoxDef[]): void {
    if (this.docLayer) {
      this.scene.remove(this.docLayer);
      disposeBuckets(this.docLayer);
    }
    this.docLayer = buildBuckets(boxes, this.mats, true);
    this.scene.add(this.docLayer);
  }

  setMovers(list: MoverSpec[]): void {
    this.moverLayer.clear();
    this.empty('mover');
    for (const m of this.movers) disposeBuckets(m.group);
    this.movers = [];
    const dash = new THREE.LineDashedMaterial({
      color: 0xffd23f,
      dashSize: 0.6,
      gapSize: 0.4,
      depthTest: false,
      transparent: true,
    });
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0xffd23f,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    });
    this.trash.mover.push(dash, ghostMat);
    for (const spec of list) {
      // the moving block itself (animated)
      const moving = buildBuckets(spec.boxes, this.mats, true);
      this.moverLayer.add(moving);
      this.movers.push({ group: moving, spec });
      // numbered ghosts at every point + the path (loops back to 1)
      const pts = spec.points;
      pts.forEach((p, i) => {
        const off = new THREE.Vector3(
          p[0] - spec.origin[0],
          p[1] - spec.origin[1],
          p[2] - spec.origin[2],
        );
        if (i > 0) {
          const g = new THREE.Group();
          for (const b of spec.boxes) {
            const m = new THREE.Mesh(unitGeometry(prismKey(b)), ghostMat);
            m.position.set(b.c.x, b.c.y, b.c.z);
            if (b.q) m.quaternion.set(b.q.x, b.q.y, b.q.z, b.q.w);
            m.scale.set(b.h.x, b.h.y, b.h.z);
            g.add(m);
          }
          g.position.copy(off);
          this.moverLayer.add(g);
        }
        const lab = labelSprite(String(i + 1), spec.selected ? '#ffd23f' : '#ffffff', 1.6);
        lab.position.set(p[0], p[1] + 2.2, p[2]);
        this.moverLayer.add(lab);
      });
      if (pts.length >= 2) {
        const loop = [...pts, pts[0]].map((p) => new THREE.Vector3(p[0], p[1], p[2]));
        const geo = new THREE.BufferGeometry().setFromPoints(loop);
        const line = new THREE.Line(geo, dash);
        line.computeLineDistances();
        line.renderOrder = 6;
        this.moverLayer.add(line);
        this.trash.mover.push(geo);
      }
    }
  }

  setMarkers(list: MarkerSpec[]): void {
    this.markerLayer.clear();
    this.empty('marker');
    for (const m of list) {
      const b = m.box;
      const geo = unitGeometry(prismKey(b));
      const mat =
        m.kind === 'volume'
          ? new THREE.MeshBasicMaterial({
              color: m.color,
              transparent: true,
              opacity: 0.22,
              depthWrite: false,
              side: THREE.DoubleSide,
            })
          : new THREE.MeshLambertMaterial({ color: m.color });
      this.trash.marker.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.c.x, b.c.y, b.c.z);
      if (b.q) mesh.quaternion.set(b.q.x, b.q.y, b.q.z, b.q.w);
      mesh.scale.set(b.h.x, b.h.y, b.h.z);
      if (m.kind === 'volume') mesh.renderOrder = 3;
      this.markerLayer.add(mesh);
      if (m.kind === 'volume') {
        const edges = new THREE.LineSegments(
          outlineGeometry([b]),
          new THREE.LineBasicMaterial({ color: m.color }),
        );
        this.trash.marker.push(edges.geometry, edges.material as THREE.Material);
        this.markerLayer.add(edges);
      }
      if (m.label) {
        const lab = labelSprite(m.label, m.labelColor ?? '#ffffff', 1.4);
        lab.position.set(b.c.x, b.c.y + b.h.y + 1, b.c.z);
        this.markerLayer.add(lab);
      }
      const lineMat = new THREE.LineBasicMaterial({
        color: m.color,
        depthTest: false,
        transparent: true,
      });
      this.trash.marker.push(lineMat);
      if (m.lineTo) {
        const geo2 = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(b.c.x, b.c.y, b.c.z),
          new THREE.Vector3(...m.lineTo),
        ]);
        this.trash.marker.push(geo2);
        const l = new THREE.Line(geo2, lineMat);
        l.renderOrder = 6;
        this.markerLayer.add(l);
      }
      if (m.arrow) {
        const dir = new THREE.Vector3(...m.arrow);
        const length = Math.max(0.5, dir.length());
        const arrow = new THREE.ArrowHelper(
          dir.normalize(),
          new THREE.Vector3(b.c.x, b.c.y, b.c.z),
          length,
          m.color,
          Math.min(1.2, length * 0.3),
          Math.min(0.8, length * 0.2),
        );
        this.markerLayer.add(arrow);
        this.trash.marker.push(arrow);
      }
    }
  }

  setSelection(boxes: BoxDef[]): void {
    this.selLines.geometry.dispose();
    this.selLines.geometry = outlineGeometry(boxes);
  }

  setHover(boxes: BoxDef[]): void {
    this.hoverLines.geometry.dispose();
    this.hoverLines.geometry = outlineGeometry(boxes);
  }

  /** A selected curve's drag handles: its end (a ball) and its climb (an arrow above it). */
  setHandles(list: { kind: 'end' | 'height'; pos: [number, number, number] }[]): void {
    this.handleLayer.clear();
    this.empty('handle');
    for (const hd of list) {
      const m = new THREE.Mesh(
        hd.kind === 'end' ? this.handleGeo.ball : this.handleGeo.cone,
        hd.kind === 'end' ? this.handleMats.end : this.handleMats.up,
      );
      m.position.set(...hd.pos);
      m.renderOrder = 9;
      this.handleLayer.add(m);
    }
    const end = list.find((x) => x.kind === 'end');
    const up = list.find((x) => x.kind === 'height');
    if (end && up) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...end.pos),
        new THREE.Vector3(...up.pos),
      ]);
      this.trash.handle.push(geo);
      const l = new THREE.Line(geo, this.handleMats.line);
      l.renderOrder = 9;
      this.handleLayer.add(l);
    }
  }

  /** The placement preview (null: none). `ok` false draws it red (can't place there). */
  setGhost(boxes: BoxDef[] | null, ok = true): void {
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost.traverse((o) => {
        if (o instanceof THREE.LineSegments) o.geometry.dispose();
      });
    }
    this.ghost = null;
    if (!boxes?.length) return;
    const g = new THREE.Group();
    for (const b of boxes) {
      const m = new THREE.Mesh(
        unitGeometry(prismKey(b)),
        ok ? this.ghostMats.ok : this.ghostMats.bad,
      );
      m.position.set(b.c.x, b.c.y, b.c.z);
      if (b.q) m.quaternion.set(b.q.x, b.q.y, b.q.z, b.q.w);
      m.scale.set(Math.max(1e-3, b.h.x), Math.max(1e-3, b.h.y), Math.max(1e-3, b.h.z));
      m.renderOrder = 4;
      g.add(m);
    }
    const lines = new THREE.LineSegments(outlineGeometry(boxes), this.ghostMats.line);
    lines.renderOrder = 5;
    g.add(lines);
    this.ghost = g;
    this.scene.add(g);
  }

  /** A grid patch (placement height and grid size), or null to hide it. */
  setGrid(at: [number, number, number] | null, step: number): void {
    if (!at) {
      if (this.grid) this.grid.visible = false;
      return;
    }
    if (!this.grid || this.gridStep !== step) {
      if (this.grid) {
        this.scene.remove(this.grid);
        this.grid.geometry.dispose();
        (this.grid.material as THREE.Material).dispose();
      }
      // an even number of cells: lines sit on whole multiples of the step around the centre
      const cells = 2 * Math.min(40, Math.round(12 / step));
      this.grid = new THREE.GridHelper(cells * step, cells, 0x9ff6ff, 0x5ff0ff);
      const gm = this.grid.material as THREE.Material;
      gm.transparent = true;
      gm.opacity = 0.35;
      gm.depthWrite = false;
      this.grid.renderOrder = 3;
      this.gridStep = step;
      this.scene.add(this.grid);
    }
    this.grid.visible = true;
    // cells line up with the world grid
    const snapTo = (v: number) => Math.round(v / step) * step;
    this.grid.position.set(snapTo(at[0]), at[1] + 0.02, snapTo(at[2]));
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  frame(dt: number): void {
    this.time += dt;
    for (const m of this.movers) {
      const p = this.previewMotion ? m.spec.posAt(this.time) : m.spec.origin;
      m.group.position.set(
        p[0] - m.spec.origin[0],
        p[1] - m.spec.origin[1],
        p[2] - m.spec.origin[2],
      );
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Restart the moving blocks' loop (after a change: all start at point 1 together). */
  resetTime(): void {
    this.time = 0;
  }

  /** Screen position (pixels) of a world point, or null when it is behind the camera. */
  project(p: [number, number, number], w: number, h: number): [number, number] | null {
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h];
  }

  dispose(): void {
    for (const l of [this.baseLayer, this.docLayer]) if (l) this.scene.remove(l);
    this.sky?.dispose();
    this.empty('mover');
    this.empty('marker');
    this.empty('handle');
    for (const m of this.movers) disposeBuckets(m.group);
    for (const l of [this.baseLayer, this.docLayer]) if (l) disposeBuckets(l);
    for (const m of Object.values(this.mats)) m.dispose();
    for (const g of Object.values(this.handleGeo)) g.dispose();
    for (const m of Object.values(this.handleMats)) m.dispose();
    this.selLines.geometry.dispose();
    this.hoverLines.geometry.dispose();
    this.setGhost(null);
    this.scene.clear();
  }
}
