// Block-robot building blocks shared by the other players' models (players.ts) and your own
// first-person hands and feet (viewmodel.ts): boxes with baked vertex colors merged into one
// geometry per body segment (one draw call each, no textures), plus a two-bone leg solver.
import * as THREE from 'three';

export const SUIT = 0x2a3140;
export const SUIT_DARK = 0x161b25; // joints, visor band
export const SUIT_LIGHT = 0x5a6478; // hands, head, plates: reads well against the dark suit
export const SUIT_MID = 0x3a4458;

export interface Part {
  size: readonly [number, number, number];
  at?: readonly [number, number, number];
  rot?: readonly [number, number, number];
  color: number;
  /** vertex color multiplier: > 1 reads as a lit strip under the rim shader */
  glow?: number;
}

const tmpM = new THREE.Matrix4();
const tmpP = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const ONE = new THREE.Vector3(1, 1, 1);
const tmpC = new THREE.Color();

/**
 * One non-indexed geometry (position, normal, color) from a list of boxes. `mirror` builds the
 * left-side twin of a right-side limb (x and the y/z rotations flip; boxes are symmetric, so
 * the triangle winding stays correct).
 */
export const partsGeometry = (parts: readonly Part[], mirror = false): THREE.BufferGeometry => {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  for (const p of parts) {
    const g = new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]).toNonIndexed();
    const [x, y, z] = p.at ?? [0, 0, 0];
    const [rx, ry, rz] = p.rot ?? [0, 0, 0];
    tmpQ.setFromEuler(tmpE.set(rx, mirror ? -ry : ry, mirror ? -rz : rz));
    g.applyMatrix4(tmpM.compose(tmpP.set(mirror ? -x : x, y, z), tmpQ, ONE));
    tmpC.set(p.color).multiplyScalar(p.glow ?? 1);
    const pa = g.attributes.position.array;
    const na = g.attributes.normal.array;
    for (let i = 0; i < pa.length; i += 3) {
      pos.push(pa[i], pa[i + 1], pa[i + 2]);
      nrm.push(na[i], na[i + 1], na[i + 2]);
      col.push(tmpC.r, tmpC.g, tmpC.b);
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
};

export const partsMesh = (
  parts: readonly Part[],
  mat: THREE.Material,
  mirror = false,
): THREE.Mesh => new THREE.Mesh(partsGeometry(parts, mirror), mat);

// ---------------------------------------------------------------------------------------------
// Legs: hip joint -> knee -> ankle; the foot stays level with the hips.

export const LEG = { thigh: 0.36, shin: 0.36, ankle: 0.08 } as const;

export interface Leg {
  thigh: THREE.Group; // at the hip joint
  knee: THREE.Group;
  ankle: THREE.Group;
}

export const buildLeg = (mat: THREE.Material, accent: number, mirror: boolean): Leg => {
  const thigh = new THREE.Group();
  // pitch (IK) first, then splay the whole leg plane outward: the foot stays flat
  thigh.rotation.order = 'ZXY';
  thigh.add(
    partsMesh(
      [
        { size: [0.13, 0.1, 0.13], at: [0, -0.02, 0], color: SUIT_DARK },
        { size: [0.16, 0.28, 0.18], at: [0, -0.2, 0], color: SUIT },
      ],
      mat,
      mirror,
    ),
  );
  const knee = new THREE.Group();
  knee.position.y = -LEG.thigh;
  knee.add(
    partsMesh(
      [
        { size: [0.12, 0.1, 0.12], color: SUIT_DARK },
        { size: [0.11, 0.09, 0.04], at: [0, -0.01, -0.08], color: accent },
        { size: [0.15, 0.26, 0.16], at: [0, -0.2, 0], color: SUIT },
        { size: [0.1, 0.16, 0.03], at: [0, -0.2, -0.09], color: SUIT_LIGHT },
      ],
      mat,
      mirror,
    ),
  );
  thigh.add(knee);
  const ankle = new THREE.Group();
  ankle.position.y = -LEG.shin;
  ankle.add(
    partsMesh(
      [
        { size: [0.1, 0.05, 0.1], at: [0, -0.01, 0], color: SUIT_DARK },
        { size: [0.17, 0.07, 0.27], at: [0, -0.045, -0.04], color: SUIT_MID },
        { size: [0.175, 0.05, 0.06], at: [0, -0.05, -0.16], color: accent },
      ],
      mat,
      mirror,
    ),
  );
  knee.add(ankle);
  return { thigh, knee, ankle };
};

/**
 * Two-bone IK in the leg's forward/up plane: put the ankle at (`z`, `y`) from the hip joint
 * (-z = forward, y < 0 = below). Knees always bend forward; out of reach the leg goes straight.
 */
export const solveLeg = (leg: Leg, z: number, y: number): void => {
  const a = LEG.thigh;
  const b = LEG.shin;
  const d = Math.min(a + b - 1e-4, Math.max(0.04, Math.hypot(z, y)));
  const aim = Math.atan2(-z, -y); // 0 = straight down, + = forward
  const hip = Math.acos(Math.min(1, (a * a + d * d - b * b) / (2 * a * d)));
  const knee = Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - d * d) / (2 * a * b))));
  leg.thigh.rotation.x = aim + hip;
  leg.knee.rotation.x = -(Math.PI - knee);
  leg.ankle.rotation.x = -(leg.thigh.rotation.x + leg.knee.rotation.x);
};

/** Frame-rate independent approach of `cur` toward `target` (rate k per second). */
export const damp = (cur: number, target: number, k: number, dt: number): number =>
  cur + (target - cur) * (1 - Math.exp(-k * dt));

export const smooth = (x: number): number => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
