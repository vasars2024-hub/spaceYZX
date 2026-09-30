// First-person camera that follows the body's up vector (gravity) and turns with the mouse.
// Mouse yaw rotates around the camera's current up; pitch is clamped relative to it. When the
// up vector changes, the camera is carried along by the shortest rotation (no roll jumps).
import type { Quat, Vec3 } from '@space-yz/shared';
import {
  qFromAxisAngle,
  qMul,
  qNormalize,
  qRotate,
  qForward,
  qFromUnitVectors,
  v3,
  dot,
  normalize,
  rotateToward,
  angleBetween,
  clone,
  projectOnPlane,
} from '@space-yz/shared';

const DEG = Math.PI / 180;
const MAX_PITCH = 88 * DEG;

export class FpsCamera {
  quat: Quat;
  up: Vec3;

  constructor(view: Quat, up: Vec3 = v3(0, 1, 0)) {
    this.quat = qNormalize(view);
    this.up = normalize(up, v3(0, 1, 0));
  }

  reset(view: Quat, up: Vec3): void {
    this.quat = qNormalize(view);
    this.up = normalize(up, v3(0, 1, 0));
  }

  /** Apply mouse movement (in degrees). */
  look(yawDeg: number, pitchDeg: number): void {
    // yaw around the current up (world axis)
    if (yawDeg !== 0)
      this.quat = qNormalize(qMul(qFromAxisAngle(this.up, -yawDeg * DEG), this.quat));
    if (pitchDeg !== 0) {
      const fwd = qForward(this.quat);
      const cur = Math.asin(Math.max(-1, Math.min(1, dot(fwd, this.up))));
      const target = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, cur - pitchDeg * DEG));
      const delta = target - cur;
      // rotate around the camera's local right axis
      this.quat = qNormalize(qMul(this.quat, qFromAxisAngle(v3(1, 0, 0), delta)));
    }
    this.fixPitch();
  }

  /** Follow the body up at `rateDegPerSec` (Infinity = snap). */
  followUp(bodyUp: Vec3, rateDegPerSec: number, dt: number): void {
    const target = normalize(bodyUp, this.up);
    const ang = angleBetween(this.up, target);
    if (ang < 1e-5) return;
    const next =
      rateDegPerSec === Infinity
        ? clone(target)
        : rotateToward(this.up, target, rateDegPerSec * DEG * dt, qForward(this.quat));
    const r = qFromUnitVectors(this.up, next, qForward(this.quat));
    this.quat = qNormalize(qMul(r, this.quat));
    this.up = next;
  }

  /** Keep the view inside the pitch limits relative to up (can drift during re-orientation). */
  private fixPitch(): void {
    const fwd = qForward(this.quat);
    const s = dot(fwd, this.up);
    const pitch = Math.asin(Math.max(-1, Math.min(1, s)));
    if (Math.abs(pitch) <= MAX_PITCH + 1e-4) return;
    const target = Math.sign(pitch) * MAX_PITCH;
    this.quat = qNormalize(qMul(this.quat, qFromAxisAngle(v3(1, 0, 0), target - pitch)));
  }

  forward(): Vec3 {
    return qForward(this.quat);
  }

  /** Current "up" of the camera image (for Three.js). */
  camUp(): Vec3 {
    return qRotate(this.quat, v3(0, 1, 0));
  }

  /** Planar forward in the body frame (for UI compasses). */
  planarForward(): Vec3 {
    return normalize(projectOnPlane(this.forward(), this.up), v3(0, 0, -1));
  }
}
