// Mouse flick → Quick Throw curve. How fast you turn sideways (around your own up) around the
// moment you release LMB sets the curve: a slow drag bends the throw a little, a fast flick bends
// it fully.
// A/D stay pure movement, so strafing never bends a throw by accident.
import type { Vec3 } from '../math/vec3';
import { cross, dot, lenSq, projectOnPlane, rotateAxis } from '../math/vec3';
import type { Quat } from '../math/quat';
import { qForward, qRight } from '../math/quat';
import type { CombatConfig } from '../config';
import type { PlayerState } from './state';

const RAD_TO_DEG = 180 / Math.PI;
const CURVE_STEPS = 32;

/** Direction of `view` flattened onto the plane of `up` (falls back to its right vector). */
const flatDir = (view: Quat, up: Vec3): Vec3 => {
  const f = projectOnPlane(qForward(view), up);
  return lenSq(f) > 1e-6 ? f : projectOnPlane(qRight(view), up);
};

/**
 * Updates the player's flick (deg/s, positive = turning right): the fastest recent sideways turn,
 * fading each tick, so a flick just before letting go still counts. Call once per tick before
 * the new view is applied.
 */
export const trackFlick = (p: PlayerState, newView: Quat, dt: number, c: CombatConfig): void => {
  const a = flatDir(p.view, p.up);
  const b = flatDir(newView, p.up);
  // turning right rotates clockwise around up, i.e. a negative angle
  const rate = (-Math.atan2(dot(cross(a, b), p.up), dot(a, b)) * RAD_TO_DEG) / dt;
  if (!Number.isFinite(rate)) {
    p.flick = 0;
    return;
  }
  const faded = p.flick * Math.min(1, Math.max(0, c.flickDecay));
  // a turn the other way takes over straight away; the same way only if it's faster
  p.flick = Math.sign(rate) !== Math.sign(faded) || Math.abs(rate) > Math.abs(faded) ? rate : faded;
};

/** A flat aim direction for `view` around `up` (a thrown Boomerang's tilt reference). */
export const flatAim = (view: Quat, up: Vec3): Vec3 => {
  const f = flatDir(view, up);
  const l = Math.sqrt(lenSq(f));
  return { x: f.x / l, y: f.y / l, z: f.z / l };
};

/** Tilt offsets are kept in these steps (degrees): prediction and server agree exactly. */
const TILT_STEP_DEG = 1 / 8;

/**
 * One tick of a Quick Throw's tilt while it flies out. The tilt is how far the thrower now looks
 * left/right of `b.tiltRef`, a "centre" that then moves toward the aim by the recenter rate (a
 * flick's tilt fades, slow aiming never builds one up). Returns the curve -1 (full left) .. 0 ..
 * +1 (full right), snapped to 1/32; the centre is rebuilt from the aim and a rounded offset each
 * tick, so tiny float differences never add up.
 */
export const tiltStep = (
  view: Quat,
  b: { tiltRef: Vec3; curveAxis: Vec3 },
  c: CombatConfig,
  dt: number,
): number => {
  const axis = b.curveAxis;
  const cur = flatAim(view, axis);
  const raw = -Math.atan2(dot(cross(b.tiltRef, cur), axis), dot(b.tiltRef, cur)) * RAD_TO_DEG;
  const deg = Number.isFinite(raw) ? Math.round(raw / TILT_STEP_DEG) * TILT_STEP_DEG : 0;
  const span = Math.max(1e-6, c.tiltFullDeg - c.tiltDeadDeg);
  const amount = Math.min(1, Math.max(0, (Math.abs(deg) - c.tiltDeadDeg) / span));
  const steps = Math.round(amount * CURVE_STEPS);
  // the centre catches up with the aim
  const recenter = Math.round((c.tiltRecenterDegPerSec * dt) / TILT_STEP_DEG) * TILT_STEP_DEG;
  const left = Math.sign(deg) * Math.max(0, Math.abs(deg) - recenter);
  // the aim is `left` degrees right of the new centre: turn back counter-clockwise by that much
  b.tiltRef = left === 0 ? cur : rotateAxis(cur, axis, (left * Math.PI) / 180);
  return steps === 0 ? 0 : (Math.sign(deg) * steps) / CURVE_STEPS;
};

/** Quick Throw curve for the current flick: -1 (full left) .. 0 (straight) .. +1 (full right). */
export const flickCurve = (p: PlayerState, c: CombatConfig): number => {
  const speed = Math.abs(p.flick);
  const span = Math.max(1e-6, c.flickFullDegPerSec - c.flickDeadDegPerSec);
  const amount = Math.min(1, Math.max(0, (speed - c.flickDeadDegPerSec) / span));
  // snapped to 1/32 steps: the client's prediction and the server then agree exactly even if
  // their turn rates differ in the last few bits
  return (Math.sign(p.flick) * Math.round(amount * CURVE_STEPS)) / CURVE_STEPS;
};
