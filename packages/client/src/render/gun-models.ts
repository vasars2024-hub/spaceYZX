// Blocky AK-47 and Desert Eagle (CS mode), built from boxes like the robots. Origin = where the
// hand grips (the pistol grip), barrel along -Z, +Y up. Used by the first-person viewmodel and
// by the robots of other players.
import * as THREE from 'three';
import type { Part } from './robot';

const METAL = 0x2a2d33;
const METAL_LIGHT = 0x3c4048;
const BARREL = 0x1c1e22;
const WOOD = 0x7a4524;
const WOOD_DARK = 0x57301a;
const MAG = 0x8a4a22;
const SILVER = 0x9aa0a8;
const SILVER_DARK = 0x5c6168;
const GRIP = 0x222428;

export const AK_PARTS: readonly Part[] = [
  { size: [0.045, 0.06, 0.26], at: [0, 0.05, -0.08], color: METAL }, // receiver
  { size: [0.04, 0.016, 0.2], at: [0, 0.087, -0.06], color: METAL_LIGHT }, // dust cover
  { size: [0.05, 0.05, 0.16], at: [0, 0.045, -0.29], color: WOOD }, // handguard
  { size: [0.024, 0.022, 0.17], at: [0, 0.087, -0.285], color: METAL }, // gas tube
  { size: [0.02, 0.02, 0.21], at: [0, 0.05, -0.47], color: BARREL }, // barrel
  { size: [0.012, 0.035, 0.012], at: [0, 0.075, -0.53], color: BARREL }, // front sight
  { size: [0.028, 0.028, 0.045], at: [0, 0.05, -0.595], color: METAL }, // muzzle brake
  { size: [0.02, 0.02, 0.02], at: [0, 0.1, -0.13], color: BARREL }, // rear sight
  { size: [0.034, 0.13, 0.06], at: [0, -0.03, -0.15], rot: [-0.38, 0, 0], color: MAG }, // mag
  { size: [0.034, 0.05, 0.055], at: [0, -0.085, -0.2], rot: [-0.7, 0, 0], color: MAG }, // curve
  { size: [0.035, 0.085, 0.04], at: [0, -0.015, 0.01], rot: [0.32, 0, 0], color: WOOD_DARK }, // grip
  { size: [0.012, 0.03, 0.05], at: [0, 0.005, -0.045], color: METAL }, // trigger guard
  { size: [0.042, 0.06, 0.22], at: [0, 0.028, 0.17], rot: [0.09, 0, 0], color: WOOD }, // stock
  { size: [0.044, 0.075, 0.02], at: [0, 0.018, 0.285], rot: [0.09, 0, 0], color: WOOD_DARK }, // butt
];
/** Muzzle (flash / tracer start) in the AK's own space. */
export const AK_MUZZLE = new THREE.Vector3(0, 0.05, -0.63);

export const DEAGLE_PARTS: readonly Part[] = [
  { size: [0.036, 0.045, 0.21], at: [0, 0.078, -0.075], color: SILVER }, // slide
  { size: [0.03, 0.012, 0.21], at: [0, 0.105, -0.075], color: SILVER_DARK }, // top rib
  { size: [0.034, 0.035, 0.16], at: [0, 0.04, -0.07], color: SILVER_DARK }, // frame
  { size: [0.033, 0.1, 0.05], at: [0, -0.02, 0.005], rot: [0.25, 0, 0], color: GRIP }, // grip
  { size: [0.01, 0.028, 0.05], at: [0, 0.012, -0.055], color: GRIP }, // trigger guard
  { size: [0.022, 0.012, 0.012], at: [0, 0.114, 0.02], color: GRIP }, // rear sight
  { size: [0.008, 0.012, 0.01], at: [0, 0.114, -0.165], color: GRIP }, // front sight
  { size: [0.02, 0.02, 0.014], at: [0, 0.075, 0.035], color: SILVER_DARK }, // hammer
];
export const DEAGLE_MUZZLE = new THREE.Vector3(0, 0.078, -0.185);

/** An additive star-shaped muzzle flash (hidden until `flash` shows it). */
export const muzzleFlash = (size: number): THREE.Mesh => {
  const shape = new THREE.Shape();
  const n = 6;
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? size * 0.35 : size;
    const a = (i / (n * 2)) * Math.PI * 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const m = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  m.visible = false;
  return m;
};
