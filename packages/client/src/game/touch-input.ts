// Pure logic behind the on-screen touch controls (no DOM, unit-tested in
// test/touch-input.test.ts): the joystick → movement buttons, finger movement → look degrees,
// finger-held actions → Btn bits, and the small state machines of the toggle-style buttons.
// The DOM side lives in touch-controls.ts.
import { Btn } from '@space-yz/shared';

/** fraction of the stick radius that does nothing (a resting thumb jitters) */
export const STICK_DEAD = 0.22;
/** sin 22.5°: eight equal 45° sectors; a direction counts once the stick leans this far to it */
const SECTOR = Math.sin(Math.PI / 8);

/**
 * Movement buttons for a stick offset in screen pixels (x right, y down) — 8-way, like W/A/S/D
 * held together. The game sprints on its own, so how far the stick is pushed doesn't matter.
 */
export const joystickButtons = (
  dx: number,
  dy: number,
  radius: number,
  dead = STICK_DEAD,
): number => {
  const d = Math.hypot(dx, dy);
  if (!Number.isFinite(d) || !(d > dead * radius)) return 0;
  const nx = dx / d;
  const ny = dy / d;
  let b = 0;
  if (ny < -SECTOR) b |= Btn.Forward;
  else if (ny > SECTOR) b |= Btn.Back;
  if (nx > SECTOR) b |= Btn.Right;
  else if (nx < -SECTOR) b |= Btn.Left;
  return b;
};

/**
 * Floating stick: the knob follows the finger up to `radius`; beyond that the base is dragged
 * along so turning back never needs a long trip. Returns the new base and the knob offset.
 */
export const followStick = (
  baseX: number,
  baseY: number,
  x: number,
  y: number,
  radius: number,
): { baseX: number; baseY: number; dx: number; dy: number } => {
  let dx = x - baseX;
  let dy = y - baseY;
  const d = Math.hypot(dx, dy);
  if (d > radius && d > 0) {
    const k = (d - radius) / d;
    baseX += dx * k;
    baseY += dy * k;
    dx = x - baseX;
    dy = y - baseY;
  }
  return { baseX, baseY, dx, dy };
};

/** A finger can't really move this far between two touch events: a jump this big is a glitch. */
export const MAX_TOUCH_STEP_PX = 250;

/** Look turn (degrees yaw, pitch) for a finger movement in CSS pixels. */
export const touchLookDegrees = (
  dxPx: number,
  dyPx: number,
  degPerPx: number,
): [number, number] => {
  const clamp = (v: number) =>
    Number.isFinite(v) ? Math.max(-MAX_TOUCH_STEP_PX, Math.min(MAX_TOUCH_STEP_PX, v)) : 0;
  return [clamp(dxPx) * degPerPx, clamp(dyPx) * degPerPx];
};

/** Degrees → "mouse counts" at the mouse sensitivity (the game turns counts × sensitivity). */
export const degreesToCounts = (deg: number, mouseSensitivity: number): number =>
  deg / Math.max(1e-4, mouseSensitivity);

/**
 * Actions held by fingers on on-screen buttons, turned into Btn bits for the simulation. Like
 * keys: a press is remembered until the next tick samples it, so a tap shorter than a tick
 * still counts; two fingers on buttons of the same action release it only when both let go.
 */
export class VirtualButtons {
  private held = new Map<string, number>();
  private latched = 0;

  constructor(
    private bitOf: (action: string) => number,
    /** `action` on the first press, `action:up` on the last release (like key actions) */
    private emit: (action: string) => void = () => {},
  ) {}

  press(action: string): void {
    const n = this.held.get(action) ?? 0;
    this.held.set(action, n + 1);
    if (n === 0) {
      this.latched |= this.bitOf(action);
      this.emit(action);
    }
  }

  release(action: string): void {
    const n = this.held.get(action) ?? 0;
    if (n <= 0) return;
    if (n > 1) {
      this.held.set(action, n - 1);
      return;
    }
    this.held.delete(action);
    this.emit(`${action}:up`);
  }

  /** press + release: counts for exactly one tick */
  tap(action: string): void {
    this.press(action);
    this.release(action);
  }

  isHeld(action: string): boolean {
    return (this.held.get(action) ?? 0) > 0;
  }

  /** Held buttons plus any press since the last sample. */
  sample(): number {
    let b = this.latched;
    this.latched = 0;
    for (const a of this.held.keys()) b |= this.bitOf(a);
    return b;
  }

  /** Everything let go silently (window lost focus, chat box opened; like keys). */
  releaseAll(): void {
    this.held.clear();
    this.latched = 0;
  }

  /** Everything let go, telling the listeners (`action:up`), e.g. the scoreboard closes. */
  letGoAll(): void {
    const actions = [...this.held.keys()];
    this.held.clear();
    this.latched = 0;
    for (const a of actions) this.emit(`${a}:up`);
  }
}

/**
 * Crouch button: a quick tap toggles crouch on (tap again to stand up), a long press works like
 * holding the key (lets go when the finger does). Frees the thumb to look while sliding.
 */
export class HybridToggle {
  on = false;
  private downAt = 0;
  private turningOff = false;

  constructor(private holdMs = 300) {}

  /** Finger down. True: press the action now. */
  down(nowMs: number): boolean {
    if (this.on) {
      this.turningOff = true;
      return false;
    }
    this.on = true;
    this.turningOff = false;
    this.downAt = nowMs;
    return true;
  }

  /** Finger up. True: release the action now. */
  up(nowMs: number): boolean {
    if (!this.on) return false;
    if (this.turningOff || nowMs - this.downAt >= this.holdMs) {
      this.on = false;
      this.turningOff = false;
      return true;
    }
    return false;
  }

  /** Forced off (jump, menu). True if it was on (release the action). */
  clear(): boolean {
    const was = this.on;
    this.on = false;
    this.turningOff = false;
    return was;
  }
}

/**
 * Wind-up / steer button (RMB). On a phone one thumb can't hold it and tap Fire, so a tap
 * latches it on: hold-to-wind-up then Fire throws; while your Boomerang flies it steers.
 * It lets go by itself once it has done its job (read from the game each frame):
 *  - latched with the Boomerang in hand: off when the wind-up throw leaves, or when no wind-up
 *    is running (cancelled by a jump/dash, wound down, or it couldn't start: air, crouch, Laser);
 *  - latched while the Boomerang is away (steering): off when it's back in your hand.
 * Tapping it again always lets go.
 */
export class AltLatch {
  on = false;
  private t = 0;
  private wound = false;
  private steering = false;

  /** Tap. `inHand`: your Boomerang is in your hand. True when it's now on. */
  toggle(inHand: boolean): boolean {
    this.on = !this.on;
    this.t = 0;
    this.wound = false;
    this.steering = !inHand;
    return this.on;
  }

  /** Once per frame. True when it just let go by itself (release the action). */
  update(dtSec: number, inHand: boolean, windup: number, alive: boolean): boolean {
    if (!this.on) return false;
    this.t += dtSec;
    if (windup > 0) this.wound = true;
    const done = !alive
      ? true
      : this.steering
        ? inHand
        : !inHand || (windup === 0 && (this.wound || this.t > 0.25));
    if (done) this.on = false;
    return done;
  }

  clear(): boolean {
    const was = this.on;
    this.on = false;
    return was;
  }
}

/**
 * Curve swipe: the fire finger's recent sideways turning. A Quick Throw curves from how fast
 * the view turns as you let go (sim/flick.ts), so a sideways swipe on the Fire button as you
 * lift your thumb curves it. Afterwards the swipe's turn is undone smoothly, so your aim is
 * back where it was for the next shot ("turns the view briefly").
 */
export class SwipeUndo {
  private recent: { t: number; yaw: number }[] = [];
  private pending = 0;
  private wait = 0;
  private left = 0;

  constructor(
    /** how much of the swipe counts: the part just before release (the flick window) */
    private windowMs = 160,
    /** smaller turns are aim corrections, not curve swipes: they stay */
    private minDeg = 3,
    /** wait before turning back, so the throw is surely taken with the turned view */
    private delayMs = 70,
    private durationMs = 220,
  ) {}

  add(nowMs: number, yawDeg: number): void {
    this.recent.push({ t: nowMs, yaw: yawDeg });
    this.prune(nowMs);
  }

  private prune(nowMs: number): void {
    while (this.recent.length && nowMs - this.recent[0].t > this.windowMs) this.recent.shift();
  }

  /** The swipe's turn (degrees) in the flick window right now. */
  swipeDeg(nowMs: number): number {
    this.prune(nowMs);
    return this.recent.reduce((s, r) => s + r.yaw, 0);
  }

  /**
   * Fire let go. `threw`: it released a Quick Throw — schedule turning the swipe back (any
   * other release just forgets the swipe: the Laser keeps the aim you dragged to).
   */
  release(nowMs: number, threw = true): void {
    const yaw = this.swipeDeg(nowMs);
    this.recent = [];
    if (!threw || Math.abs(yaw) < this.minDeg) return;
    this.pending = -yaw;
    this.wait = this.delayMs;
    this.left = this.durationMs;
  }

  cancel(): void {
    this.recent = [];
    this.pending = 0;
  }

  get active(): boolean {
    return this.pending !== 0;
  }

  /** Yaw (degrees) to turn this frame. */
  step(dtMs: number): number {
    if (this.pending === 0) return 0;
    if (this.wait > 0) {
      this.wait -= dtMs;
      if (this.wait > 0) return 0;
      dtMs = -this.wait;
      this.wait = 0;
    }
    const f = this.left <= dtMs ? 1 : dtMs / this.left;
    const out = this.pending * f;
    this.left -= dtMs;
    this.pending = f >= 1 ? 0 : this.pending - out;
    return out;
  }
}
