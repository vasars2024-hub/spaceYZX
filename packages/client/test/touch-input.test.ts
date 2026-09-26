import { describe, expect, it } from 'vitest';
import { Btn } from '@space-yz/shared';
import {
  AltLatch,
  HybridToggle,
  MAX_TOUCH_STEP_PX,
  STICK_DEAD,
  SwipeUndo,
  VirtualButtons,
  degreesToCounts,
  followStick,
  joystickButtons,
  touchLookDegrees,
} from '../src/game/touch-input';
import { isTouchDevice, useMobileLayout, applyMobileDefaults } from '../src/mobile';
import { DEFAULT_SETTINGS, loadSettings } from '../src/settings';

const BITS: Record<string, number> = {
  fire: Btn.Fire,
  alt: Btn.Alt,
  jump: Btn.Jump,
  crouch: Btn.Crouch,
  forward: Btn.Forward,
};
const bitOf = (a: string) => BITS[a] ?? 0;

describe('joystick → movement buttons', () => {
  const R = 56;
  it('does nothing inside the dead zone', () => {
    expect(joystickButtons(0, 0, R)).toBe(0);
    expect(joystickButtons(R * STICK_DEAD * 0.9, 0, R)).toBe(0);
    expect(joystickButtons(NaN, 3, R)).toBe(0);
  });
  it('maps the four main directions (screen y grows downward)', () => {
    expect(joystickButtons(0, -R, R)).toBe(Btn.Forward);
    expect(joystickButtons(0, R, R)).toBe(Btn.Back);
    expect(joystickButtons(-R, 0, R)).toBe(Btn.Left);
    expect(joystickButtons(R, 0, R)).toBe(Btn.Right);
  });
  it('gives diagonals in 45° sectors', () => {
    expect(joystickButtons(R, -R, R)).toBe(Btn.Forward | Btn.Right);
    expect(joystickButtons(-R, R, R)).toBe(Btn.Back | Btn.Left);
    // 15° off straight ahead: still just forward
    const a = (15 * Math.PI) / 180;
    expect(joystickButtons(Math.sin(a) * R, -Math.cos(a) * R, R)).toBe(Btn.Forward);
    // 30° off: forward-right
    const b = (30 * Math.PI) / 180;
    expect(joystickButtons(Math.sin(b) * R, -Math.cos(b) * R, R)).toBe(Btn.Forward | Btn.Right);
  });
  it('never presses opposite directions together', () => {
    for (let deg = 0; deg < 360; deg += 7) {
      const r = (deg * Math.PI) / 180;
      const b = joystickButtons(Math.cos(r) * R, Math.sin(r) * R, R);
      expect(b & Btn.Forward && b & Btn.Back).toBeFalsy();
      expect(b & Btn.Left && b & Btn.Right).toBeFalsy();
      expect(b).not.toBe(0);
    }
  });
  it('floating stick: the base follows a finger that goes past the radius', () => {
    const s = followStick(100, 100, 100 + 3 * R, 100, R);
    expect(s.dx).toBeCloseTo(R);
    expect(s.dy).toBeCloseTo(0);
    expect(s.baseX).toBeCloseTo(100 + 2 * R);
    const inside = followStick(100, 100, 110, 90, R);
    expect(inside).toEqual({ baseX: 100, baseY: 100, dx: 10, dy: -10 });
  });
});

describe('touch look', () => {
  it('scales finger movement by the touch sensitivity', () => {
    expect(touchLookDegrees(100, -20, 0.3)).toEqual([30, -6]);
    expect(touchLookDegrees(0, 0, 0.3)).toEqual([0, 0]);
  });
  it('ignores glitch jumps and bad numbers', () => {
    const [yaw] = touchLookDegrees(5000, 0, 0.3);
    expect(yaw).toBeCloseTo(MAX_TOUCH_STEP_PX * 0.3);
    expect(touchLookDegrees(NaN, Infinity, 0.3)).toEqual([0, 0]);
  });
  it('goes through the mouse path at any mouse sensitivity', () => {
    // the client turns counts × sensitivity: the same degrees come out
    for (const sens of [0.01, 0.07, 0.3]) expect(degreesToCounts(12, sens) * sens).toBeCloseTo(12);
    expect(Number.isFinite(degreesToCounts(12, 0))).toBe(true);
  });
  it('a quick swipe reaches a full-curve flick rate (default settings)', () => {
    // 60 px in one 60 Hz frame at the default sensitivity: well past the full-curve turn rate
    const [yaw] = touchLookDegrees(60, 0, DEFAULT_SETTINGS.touchLookSensitivity);
    expect(yaw * 60).toBeGreaterThanOrEqual(300);
  });
});

describe('virtual buttons → Btn bits', () => {
  it('holds while the finger is down and releases on lift', () => {
    const v = new VirtualButtons(bitOf);
    expect(v.sample()).toBe(0);
    v.press('fire');
    expect(v.sample()).toBe(Btn.Fire);
    expect(v.sample()).toBe(Btn.Fire); // still held
    v.release('fire');
    expect(v.sample()).toBe(0);
  });
  it('a tap shorter than a tick still counts once', () => {
    const v = new VirtualButtons(bitOf);
    v.tap('jump');
    expect(v.sample()).toBe(Btn.Jump);
    expect(v.sample()).toBe(0);
  });
  it('two fingers on the same action: released when both lift', () => {
    const v = new VirtualButtons(bitOf);
    v.press('fire');
    v.press('fire');
    v.release('fire');
    expect(v.isHeld('fire')).toBe(true);
    v.release('fire');
    expect(v.isHeld('fire')).toBe(false);
    v.release('fire'); // extra lift: harmless
    expect(v.sample()).toBe(Btn.Fire); // the press still counts for the tick it happened in
    expect(v.sample()).toBe(0);
  });
  it('tells action listeners on press and release (scoreboard, chat, voice)', () => {
    const seen: string[] = [];
    const v = new VirtualButtons(bitOf, (a) => seen.push(a));
    v.press('scoreboard');
    v.press('scoreboard');
    v.release('scoreboard');
    v.release('scoreboard');
    v.tap('chatTeam');
    v.press('crouch');
    v.letGoAll();
    expect(seen).toEqual([
      'scoreboard',
      'scoreboard:up',
      'chatTeam',
      'chatTeam:up',
      'crouch',
      'crouch:up',
    ]);
    expect(v.sample()).toBe(0);
  });
  it('several buttons at once (move + look + fire)', () => {
    const v = new VirtualButtons(bitOf);
    v.press('forward');
    v.press('fire');
    v.press('jump');
    expect(v.sample()).toBe(Btn.Forward | Btn.Fire | Btn.Jump);
    v.releaseAll();
    expect(v.sample()).toBe(0);
  });
});

describe('crouch button (tap toggles, long press holds)', () => {
  it('tap on, tap off', () => {
    const t = new HybridToggle(300);
    expect(t.down(0)).toBe(true);
    expect(t.up(100)).toBe(false); // stays crouched
    expect(t.on).toBe(true);
    expect(t.down(1000)).toBe(false);
    expect(t.up(1050)).toBe(true);
    expect(t.on).toBe(false);
  });
  it('long press works like holding the key', () => {
    const t = new HybridToggle(300);
    expect(t.down(0)).toBe(true);
    expect(t.up(600)).toBe(true);
    expect(t.on).toBe(false);
  });
  it('jump clears it', () => {
    const t = new HybridToggle(300);
    t.down(0);
    t.up(50);
    expect(t.clear()).toBe(true);
    expect(t.clear()).toBe(false);
  });
});

describe('wind-up / steer latch', () => {
  it('lets go after the wind-up throw leaves', () => {
    const a = new AltLatch();
    expect(a.toggle(true)).toBe(true);
    expect(a.update(0.1, true, 5, true)).toBe(false); // winding
    expect(a.update(0.5, true, 40, true)).toBe(false); // wound, waiting for THROW
    expect(a.update(0.016, false, 0, true)).toBe(true); // thrown
    expect(a.on).toBe(false);
  });
  it('lets go when the wind-up is cancelled or never starts', () => {
    const a = new AltLatch();
    a.toggle(true);
    a.update(0.1, true, 3, true);
    expect(a.update(0.016, true, 0, true)).toBe(true); // jumped: cancelled
    a.toggle(true);
    expect(a.update(0.1, true, 0, true)).toBe(false); // give the sim a moment
    expect(a.update(0.2, true, 0, true)).toBe(true); // in the air / Laser out: nothing started
  });
  it('steers while the Boomerang flies and lets go when it is back', () => {
    const a = new AltLatch();
    a.toggle(false);
    expect(a.update(1, false, 0, true)).toBe(false);
    expect(a.update(1, false, 0, true)).toBe(false);
    expect(a.update(0.016, true, 0, true)).toBe(true);
  });
  it('tap again or dying lets go', () => {
    const a = new AltLatch();
    a.toggle(false);
    expect(a.toggle(false)).toBe(false);
    a.toggle(false);
    expect(a.update(0.016, false, 0, false)).toBe(true);
  });
});

describe('curve swipe on the Fire button', () => {
  it('turns a curve swipe back after the throw, smoothly', () => {
    const u = new SwipeUndo(160, 3, 70, 220);
    u.add(0, 0.5); // slow aim correction long before release: not undone
    u.add(1000, 6);
    u.add(1016, 6);
    u.add(1033, 6);
    u.release(1040);
    expect(u.active).toBe(true);
    let total = 0;
    const first = u.step(16);
    expect(first).toBe(0); // waits so the throw is surely taken with the turned view
    total += first;
    for (let i = 0; i < 40; i++) total += u.step(16);
    expect(total).toBeCloseTo(-18);
    expect(u.active).toBe(false);
  });
  it('leaves small aim corrections and non-throws alone', () => {
    const u = new SwipeUndo(160, 3);
    u.add(0, 1);
    u.release(10);
    expect(u.active).toBe(false);
    u.add(20, 20);
    u.release(30, false); // Laser shot: keep the aim
    expect(u.active).toBe(false);
    expect(u.step(16)).toBe(0);
  });
});

describe('mobile detection', () => {
  const phone = { coarsePointer: true, canHover: false, touchPoints: 5, screenMin: 390 };
  const desktop = { coarsePointer: false, canHover: true, touchPoints: 0, screenMin: 1080 };
  const touchLaptop = { coarsePointer: false, canHover: true, touchPoints: 10, screenMin: 900 };
  const tablet = { coarsePointer: true, canHover: false, touchPoints: 5, screenMin: 820 };
  const lyingPhone = { coarsePointer: false, canHover: true, touchPoints: 5, screenMin: 412 };
  it('phones and tablets get the touch layout; desktops and touch laptops do not', () => {
    expect(isTouchDevice(phone)).toBe(true);
    expect(isTouchDevice(tablet)).toBe(true);
    expect(isTouchDevice(lyingPhone)).toBe(true); // claims hover, but a phone-sized touch screen
    expect(isTouchDevice(desktop)).toBe(false);
    expect(isTouchDevice(touchLaptop)).toBe(false);
  });
  it('the setting can force it on or off', () => {
    expect(useMobileLayout('auto', phone)).toBe(true);
    expect(useMobileLayout('off', phone)).toBe(false);
    expect(useMobileLayout('on', desktop)).toBe(true);
    expect(useMobileLayout('auto', desktop)).toBe(false);
  });
  it('first run on a phone: light graphics', () => {
    const s = structuredClone(DEFAULT_SETTINGS);
    applyMobileDefaults(s);
    expect(['low', 'potato']).toContain(s.quality);
    expect(['minimal', 'reduced']).toContain(s.effects);
    expect(s.dynamicResolution).toBe(true);
  });
  it('touch settings load with defaults and stay in range', () => {
    const s = loadSettings(); // no localStorage in node: defaults
    expect(s.touchControls).toBe('auto');
    expect(s.touchLookSensitivity).toBeGreaterThan(0);
    expect(s.touchFireDrag).toBe('aim');
  });
});
