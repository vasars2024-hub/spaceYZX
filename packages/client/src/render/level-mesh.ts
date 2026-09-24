// Build the static level as a few merged meshes with lighting baked into vertex colors.
// MeshBasicMaterial = no lighting cost at runtime; looks flat-shaded and low-poly.
import * as THREE from 'three';
import type { LevelDef, BoxDef, Material, Vec3 } from '@space-yz/shared';
import { qRotate, v3, normalize, dot, cross, len, sub, lenSq } from '@space-yz/shared';

export const MATERIAL_COLORS: Record<Material, number> = {
  hull: 0x2b3446,
  floor: 0x394358,
  panel: 0x4a5670,
  crate: 0x6a5238,
  pillar: 0x3c4760,
  glass: 0x9ec3e6,
  engine: 0x3f3040,
  teamA: 0x1f6f80,
  teamB: 0x80501f,
  trim: 0xffffff,
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
  quad(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    d: Vec3,
    ca: THREE.Color,
    cb: THREE.Color,
    cc: THREE.Color,
    cd: THREE.Color,
  ): void {
    for (const [p, cl] of [
      [a, ca],
      [b, cb],
      [c, cc],
      [a, ca],
      [c, cc],
      [d, cd],
    ] as [Vec3, THREE.Color][]) {
      this.pos.push(p.x, p.y, p.z);
      this.col.push(cl.r, cl.g, cl.b);
    }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const boxCorner = (b: BoxDef, lx: number, ly: number, lz: number): Vec3 => {
  const local = v3(lx * b.h.x, ly * b.h.y, lz * b.h.z);
  const r = b.q ? qRotate(b.q, local) : local;
  return v3(b.c.x + r.x, b.c.y + r.y, b.c.z + r.z);
};

const shade = (
  base: THREE.Color,
  n: Vec3,
  variation: number,
  bottom: boolean,
  brightness: number,
): THREE.Color => {
  const diffuse = Math.max(0, dot(n, LIGHT));
  const fill = Math.max(0, -dot(n, LIGHT)) * 0.18;
  const up = n.y > 0.5 ? 0.08 : 0;
  let k = 0.42 + 0.52 * diffuse + fill + up;
  k *= 0.94 + variation * 0.12;
  if (bottom) k *= 0.78; // fake ambient occlusion toward the bottom of walls
  return base.clone().multiplyScalar(k * brightness);
};

export interface LevelMeshes {
  group: THREE.Group;
  dispose(): void;
}

export const buildLevelMeshes = (def: LevelDef, brightness = 1): LevelMeshes => {
  const solid = new GeoBuilder();
  const trims = new GeoBuilder();
  const tmp = new THREE.Color();

  def.boxes.forEach((b, bi) => {
    if (b.noRender) return;
    const base = new THREE.Color(b.color ?? MATERIAL_COLORS[b.mat ?? 'hull']);
    const isTrim = b.mat === 'trim';
    FACES.forEach((f, fi) => {
      const n = b.q ? qRotate(b.q, f.n) : f.n;
      const pts = f.corners.map(([x, y, z]) => boxCorner(b, x, y, z));
      if (isTrim) {
        const c = base.clone().multiplyScalar(brightness);
        trims.quad(pts[0], pts[1], pts[2], pts[3], c, c, c, c);
        return;
      }
      const variation = hash(bi * 7 + fi);
      // darker near the bottom of vertical faces
      const vertical = Math.abs(n.y) < 0.5;
      const cols = f.corners.map(([, y]) =>
        shade(base, n, variation, vertical && y < 0, brightness),
      );
      tiledQuad(solid, pts, cols, bi * 31 + fi);
    });
    if (b.trim !== undefined)
      addTrims(trims, b, new THREE.Color(b.trim).multiplyScalar(brightness), tmp);
  });

  const group = new THREE.Group();
  const solidGeo = solid.build();
  const trimGeo = trims.build();
  const solidMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const trimMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
  const solidMesh = new THREE.Mesh(solidGeo, solidMat);
  const trimMesh = new THREE.Mesh(trimGeo, trimMat);
  solidMesh.matrixAutoUpdate = false;
  trimMesh.matrixAutoUpdate = false;
  group.add(solidMesh, trimMesh);

  const extras = buildExtras(def);
  group.add(extras.group);

  return {
    group,
    dispose: () => {
      solidGeo.dispose();
      trimGeo.dispose();
      solidMat.dispose();
      trimMat.dispose();
      extras.dispose();
    },
  };
};

const TILE = 2.5;

/**
 * Split a face into ~2.5 m panels with a subtle checker tint. Gives surfaces scale, which is
 * what makes speed readable in a fast movement game.
 */
const tiledQuad = (g: GeoBuilder, pts: Vec3[], cols: THREE.Color[], seed: number): void => {
  const [p0, p1, , p3] = pts;
  const l1 = len(sub(p1, p0));
  const l2 = len(sub(p3, p0));
  const nu = Math.min(40, Math.max(1, Math.round(l1 / TILE)));
  const nv = Math.min(40, Math.max(1, Math.round(l2 / TILE)));
  if (nu === 1 && nv === 1) {
    g.quad(pts[0], pts[1], pts[2], pts[3], cols[0], cols[1], cols[2], cols[3]);
    return;
  }
  const at = (u: number, v: number): Vec3 => {
    // bilinear over the (planar) quad p0 p1 p2 p3
    const a = lerp3(pts[0], pts[1], u);
    const b = lerp3(pts[3], pts[2], u);
    return lerp3(a, b, v);
  };
  const colAt = (u: number, v: number, tint: number): THREE.Color => {
    const a = cols[0].clone().lerp(cols[1], u);
    const b = cols[3].clone().lerp(cols[2], u);
    return a.lerp(b, v).multiplyScalar(tint);
  };
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const u0 = i / nu,
        u1 = (i + 1) / nu,
        v0 = j / nv,
        v1 = (j + 1) / nv;
      const tint =
        ((i + j) % 2 === 0 ? 1.035 : 0.965) * (0.98 + hash(seed * 977 + i * 131 + j) * 0.04);
      g.quad(
        at(u0, v0),
        at(u1, v0),
        at(u1, v1),
        at(u0, v1),
        colAt(u0, v0, tint),
        colAt(u1, v0, tint),
        colAt(u1, v1, tint),
        colAt(u0, v1, tint),
      );
    }
};

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 =>
  v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

/** Thin glowing strips along the top (and for tall boxes, bottom) edges of a box. */
const addTrims = (g: GeoBuilder, b: BoxDef, color: THREE.Color, _tmp: THREE.Color): void => {
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

/** Rails, gravity-zone hints. */
const buildExtras = (def: LevelDef): { group: THREE.Group; dispose(): void } => {
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

    if (zeroG) {
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
    } else {
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
  return { group, dispose: () => disposables.forEach((d) => d.dispose()) };
};
