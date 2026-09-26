// Open space outside the ship (maps with a `sky`): a star field and a few moons, far away so
// they barely move as you walk. Two draw calls total (one point cloud, one merged moon mesh),
// no textures, no lights: moons are shaded once into vertex colors (a lit half and a dark
// half), stars are single pixels. The level geometry hides them except through 'skyglass'.
import * as THREE from 'three';
import type { LevelDef, SkyDef, Vec3 } from '@space-yz/shared';

/** Distance of the sky from the map centre (the camera's far plane is 600 m). */
const SKY_R = 430;
const STARS = 1400;
/** where the (off-screen) sun lights the moons from */
const SUN = new THREE.Vector3(-0.45, 0.35, 0.82).normalize();

const hash = (n: number): number => {
  let x = Math.imul(n ^ 0x2c1b3c6d, 0x297a2d39);
  x ^= x >>> 15;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967295;
};

/** Object name of the sky group (the sky duel arena hides it while you are up there). */
export const SPACE_SKY_NAME = 'space-sky';

export interface SkyMeshes {
  group: THREE.Group;
  dispose(): void;
}

/** Map centre = middle of its bounds (the sky is centred there). */
const centreOf = (def: LevelDef): Vec3 => ({
  x: (def.boundsMin.x + def.boundsMax.x) / 2,
  y: (def.boundsMin.y + def.boundsMax.y) / 2,
  z: (def.boundsMin.z + def.boundsMax.z) / 2,
});

export const buildSky = (def: LevelDef, sky: SkyDef): SkyMeshes => {
  const group = new THREE.Group();
  group.name = SPACE_SKY_NAME;
  const c = centreOf(def);
  group.position.set(c.x, c.y, c.z);
  const disposables: { dispose(): void }[] = [];

  // stars: uniform on the sphere, a few brighter and tinted
  const pos = new Float32Array(STARS * 3);
  const col = new Float32Array(STARS * 3);
  for (let i = 0; i < STARS; i++) {
    const u = hash(i * 3 + 1) * 2 - 1;
    const a = hash(i * 3 + 2) * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    pos[i * 3] = Math.cos(a) * r * SKY_R;
    pos[i * 3 + 1] = u * SKY_R;
    pos[i * 3 + 2] = Math.sin(a) * r * SKY_R;
    const b = hash(i * 3 + 3);
    const k = 0.25 + b * b * 0.75;
    const tint = hash(i * 7 + 5);
    col[i * 3] = k * (tint > 0.85 ? 1 : 0.85);
    col[i * 3 + 1] = k * 0.9;
    col[i * 3 + 2] = k * (tint < 0.15 ? 0.75 : 1);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const starMat = new THREE.PointsMaterial({
    size: 1.6,
    sizeAttenuation: false,
    vertexColors: true,
    fog: false,
    depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  group.add(stars);
  disposables.push(starGeo, starMat);

  // moons: one merged mesh, shaded into vertex colors (terminator + faint maria blotches)
  const parts: THREE.BufferGeometry[] = [];
  sky.moons.forEach((m, mi) => {
    const radius = SKY_R * Math.tan(((m.sizeDeg / 2) * Math.PI) / 180);
    const g = new THREE.SphereGeometry(radius, 28, 18).toNonIndexed();
    const d = new THREE.Vector3(m.dir.x, m.dir.y, m.dir.z).normalize();
    const base = new THREE.Color(m.color);
    const n = g.getAttribute('normal');
    const cols = new Float32Array(n.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < n.count; i++) {
      v.set(n.getX(i), n.getY(i), n.getZ(i));
      const lit = Math.max(0, v.dot(SUN));
      const blotch =
        0.82 +
        0.18 *
          hash(
            mi * 1000 +
              Math.floor((v.x + 1) * 4) * 31 +
              Math.floor((v.y + 1) * 4) * 7 +
              Math.floor((v.z + 1) * 4),
          );
      const k = (0.05 + 0.95 * Math.pow(lit, 0.7)) * blotch;
      cols[i * 3] = base.r * k;
      cols[i * 3 + 1] = base.g * k;
      cols[i * 3 + 2] = base.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.translate(d.x * SKY_R, d.y * SKY_R, d.z * SKY_R);
    parts.push(g);
  });
  if (parts.length) {
    const merged = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    const moonMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    const moons = new THREE.Mesh(merged, moonMat);
    moons.frustumCulled = false;
    moons.matrixAutoUpdate = false;
    group.add(moons);
    disposables.push(merged, moonMat);
  }
  group.updateMatrixWorld(true);
  return { group, dispose: () => disposables.forEach((x) => x.dispose()) };
};

/** Concatenate non-indexed geometries with position + color attributes. */
const mergeGeometries = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => {
  const total = parts.reduce((a, p) => a + p.getAttribute('position').count, 0);
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.getAttribute('position').array as Float32Array, o * 3);
    col.set(p.getAttribute('color').array as Float32Array, o * 3);
    o += p.getAttribute('position').count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
};
