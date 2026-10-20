// Suction tubes (LevelDef.liftTubes, sim/devices.ts): a translucent glowing tube with bright
// rings flowing up it, a ring on the floor at its mouth and a faint one where it throws you.
// Cheap: one shared material (its striped texture scrolls to move every tube's rings at once)
// and one mesh per tube; no lights.
import * as THREE from 'three';
import type { LevelDef } from '@space-yz/shared';

const COLOR = 0x5fe1ff;
/** Metres between two rings on the tube. */
const RING_SPACING = 1.6;
/** How fast the rings flow up (m/s): a bit slower than the ride itself reads better. */
const FLOW_SPEED = 6;

/** A 1 × 64 stripe: faint glass with one bright, soft-edged ring band. */
const stripeTexture = (): THREE.DataTexture => {
  const n = 64;
  const data = new Uint8Array(n * 4);
  const c = new THREE.Color(COLOR);
  for (let i = 0; i < n; i++) {
    const v = i / n;
    // a band about 15 % of the spacing wide, fading at both edges
    const band = Math.max(0, 1 - Math.abs(v - 0.1) / 0.08);
    const a = 0.1 + 0.8 * band;
    data[i * 4] = Math.round(255 * Math.min(1, c.r + band * 0.4));
    data[i * 4 + 1] = Math.round(255 * Math.min(1, c.g + band * 0.2));
    data[i * 4 + 2] = Math.round(255 * c.b);
    data[i * 4 + 3] = Math.round(255 * a);
  }
  const tex = new THREE.DataTexture(data, 1, n, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
};

export interface TubeMeshes {
  group: THREE.Group;
  /** move the rings up (call every rendered frame) */
  update(dt: number): void;
  dispose(): void;
}

export const buildTubeMeshes = (def: LevelDef): TubeMeshes | null => {
  const tubes = def.liftTubes ?? [];
  if (tubes.length === 0) return null;
  const group = new THREE.Group();
  const tex = stripeTexture();
  const tubeMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const ringMat = new THREE.MeshBasicMaterial({ color: COLOR });
  const landMat = new THREE.MeshBasicMaterial({
    color: COLOR,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const disposables: { dispose(): void }[] = [tex, tubeMat, ringMat, landMat];
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (const t of tubes) {
    const base = new THREE.Vector3(t.base.x, t.base.y, t.base.z);
    const top = new THREE.Vector3(t.top.x, t.top.y, t.top.z);
    const axis = top.clone().sub(base);
    const length = axis.length();
    if (length < 1e-3) continue;
    axis.normalize();
    // the tube, a little higher than its top so you see where it ends
    const h = length + 0.6;
    const geo = new THREE.CylinderGeometry(t.radius, t.radius, h, 20, 1, true);
    // stretch the stripe along the tube: one ring every RING_SPACING metres
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) * h) / RING_SPACING);
    uv.needsUpdate = true;
    disposables.push(geo);
    const tube = new THREE.Mesh(geo, tubeMat);
    tube.position.copy(base).addScaledVector(axis, h / 2);
    tube.quaternion.setFromUnitVectors(yAxis, axis);
    tube.renderOrder = 2; // (after the level, like other glows)
    group.add(tube);
    // a bright ring on the floor at its mouth
    const mouthGeo = new THREE.TorusGeometry(t.radius, 0.06, 6, 28);
    disposables.push(mouthGeo);
    const mouth = new THREE.Mesh(mouthGeo, ringMat);
    mouth.position.copy(base).addScaledVector(axis, 0.04);
    mouth.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    group.add(mouth);
    // a faint ring where it throws you
    const landGeo = new THREE.RingGeometry(0.45, 0.6, 24);
    disposables.push(landGeo);
    const land = new THREE.Mesh(landGeo, landMat);
    land.position.set(t.land.x, t.land.y + 0.03, t.land.z);
    land.rotation.x = -Math.PI / 2;
    group.add(land);
  }
  return {
    group,
    update: (dt) => {
      // (the texture's v runs up the tube: lowering the offset moves the rings up)
      tex.offset.y = (tex.offset.y - (dt * FLOW_SPEED) / RING_SPACING) % 1;
    },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
};
