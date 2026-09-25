// Space YZ client entry.
import './styles.css';
import type { Vec3 } from '@space-yz/shared';
import { yawToView, qFromBasis, normalize, cross, sub, v3, dot } from '@space-yz/shared';
import { App } from './app';

const app = new App(
  document.getElementById('game') as HTMLCanvasElement,
  document.getElementById('ui') as HTMLDivElement,
);

// Test/debug hooks used by automated browser checks (harmless for players).
const tools = {
  /** view quaternion for a yaw/pitch (degrees) */
  view: (yawDeg: number, pitchDeg = 0) => yawToView(yawDeg, pitchDeg),
  /** view quaternion looking from `from` at `to`, keeping `up` */
  lookAt: (from: Vec3, to: Vec3, up: Vec3 = v3(0, 1, 0)) => {
    const f = normalize(sub(to, from));
    const u0 = Math.abs(dot(f, up)) > 0.99 ? v3(1, 0, 0) : up;
    const r = normalize(cross(f, u0));
    return qFromBasis(f, cross(r, f));
  },
};
(window as unknown as { __spaceyz: unknown }).__spaceyz = { app, tools };
