// MAP MAKER (touch) — telling a tap from a hold from a drag, Minecraft Pocket Edition style:
//   tap   (let go quickly, barely moved)      place the held piece / select with the hand
//   hold  (0.5 s without moving)              break the piece under the finger
//   drag  (moved more than a few pixels)      look around — a drag never places or breaks
//   two fingers                               pinch: fly forward / back
// Plain logic fed with pointer positions and times (tests drive it without a screen).

/** A finger that moves more than this (px) is dragging (looking), never tapping or holding. */
export const TAP_MOVE_PX = 10;
/** Held this long without moving: break. */
export const HOLD_MS = 500;
/** The hold ring shows after this long (a quick tap never flashes it). */
export const HOLD_SHOW_MS = 150;

export type GestureEvent =
  | { k: 'tap'; x: number; y: number }
  | { k: 'hold'; x: number; y: number }
  /** hold progress 0..1 at (x, y); p < 0: the hold was given up (hide the ring) */
  | { k: 'holdProgress'; x: number; y: number; p: number }
  | { k: 'look'; dx: number; dy: number }
  /** change of the distance between two fingers (px; + = spreading) */
  | { k: 'pinch'; d: number };

interface Finger {
  x0: number;
  y0: number;
  x: number;
  y: number;
  t0: number;
  state: 'pending' | 'drag' | 'held' | 'pinch' | 'done';
  /** the hold ring is showing */
  ring: boolean;
}

export class GestureTracker {
  private fingers = new Map<number, Finger>();
  private pinchDist = 0;

  get active(): number {
    return this.fingers.size;
  }

  down(id: number, x: number, y: number, t: number): GestureEvent[] {
    const out: GestureEvent[] = [];
    const f: Finger = { x0: x, y0: y, x, y, t0: t, state: 'pending', ring: false };
    if (this.fingers.size >= 1) {
      // a second finger: both pinch (whatever the first was about to do is off)
      for (const o of this.fingers.values()) {
        if (o.ring) out.push({ k: 'holdProgress', x: o.x, y: o.y, p: -1 });
        o.ring = false;
        o.state = 'pinch';
      }
      f.state = 'pinch';
    }
    this.fingers.set(id, f);
    if (f.state === 'pinch') this.pinchDist = this.distance();
    return out;
  }

  move(id: number, x: number, y: number, _t: number): GestureEvent[] {
    const f = this.fingers.get(id);
    if (!f) return [];
    const out: GestureEvent[] = [];
    const px = f.x;
    const py = f.y;
    f.x = x;
    f.y = y;
    if (f.state === 'pinch') {
      if (this.fingers.size >= 2) {
        const d = this.distance();
        if (d !== this.pinchDist) out.push({ k: 'pinch', d: d - this.pinchDist });
        this.pinchDist = d;
      }
      return out;
    }
    if (f.state === 'pending' && Math.hypot(x - f.x0, y - f.y0) > TAP_MOVE_PX) {
      f.state = 'drag';
      if (f.ring) out.push({ k: 'holdProgress', x, y, p: -1 });
      f.ring = false;
      // (the look starts from where the finger went down: no jump)
      out.push({ k: 'look', dx: x - f.x0, dy: y - f.y0 });
      return out;
    }
    if (f.state === 'drag') out.push({ k: 'look', dx: x - px, dy: y - py });
    return out;
  }

  up(id: number, t: number): GestureEvent[] {
    const f = this.fingers.get(id);
    if (!f) return [];
    this.fingers.delete(id);
    const out: GestureEvent[] = [];
    if (f.ring) out.push({ k: 'holdProgress', x: f.x, y: f.y, p: -1 });
    if (f.state === 'pending' && t - f.t0 < HOLD_MS) out.push({ k: 'tap', x: f.x, y: f.y });
    // the finger left in a pinch keeps doing nothing until it lifts
    for (const o of this.fingers.values()) if (o.state === 'pinch') o.state = 'done';
    return out;
  }

  /** A finger went away without a proper lift (the browser took it): nothing happens. */
  cancel(id: number): GestureEvent[] {
    const f = this.fingers.get(id);
    this.fingers.delete(id);
    for (const o of this.fingers.values()) if (o.state === 'pinch') o.state = 'done';
    return f?.ring ? [{ k: 'holdProgress', x: f.x, y: f.y, p: -1 }] : [];
  }

  /** Call every frame: holds complete here (and their ring fills). */
  tick(t: number): GestureEvent[] {
    const out: GestureEvent[] = [];
    for (const f of this.fingers.values()) {
      if (f.state !== 'pending') continue;
      const el = t - f.t0;
      if (el >= HOLD_MS) {
        f.state = 'held';
        f.ring = false;
        out.push({ k: 'holdProgress', x: f.x, y: f.y, p: -1 }, { k: 'hold', x: f.x, y: f.y });
      } else if (el >= HOLD_SHOW_MS) {
        f.ring = true;
        out.push({
          k: 'holdProgress',
          x: f.x,
          y: f.y,
          p: (el - HOLD_SHOW_MS) / (HOLD_MS - HOLD_SHOW_MS),
        });
      }
    }
    return out;
  }

  private distance(): number {
    const f = [...this.fingers.values()];
    return f.length >= 2 ? Math.hypot(f[0].x - f[1].x, f[0].y - f[1].y) : 0;
  }
}
