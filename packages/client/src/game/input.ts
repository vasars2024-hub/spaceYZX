// Keyboard + mouse input: held keys, latched presses (so sub-tick taps count), mouse deltas,
// pointer lock (raw input), fullscreen + Keyboard Lock (so Ctrl+W can't close the tab).
import { Btn } from '@space-yz/shared';
import type { Settings } from '../settings';

const ACTION_BUTTON: Record<string, number> = {
  forward: Btn.Forward,
  back: Btn.Back,
  left: Btn.Left,
  right: Btn.Right,
  jump: Btn.Jump,
  crouch: Btn.Crouch,
  dash: Btn.Dash,
  fire: Btn.Fire,
  alt: Btn.Alt,
  melee: Btn.Melee,
  grenade: Btn.Grenade,
  recall: Btn.Recall,
  magboots: Btn.MagBoots,
};

type ActionListener = (action: string) => void;

export class InputManager {
  private held = new Set<string>();
  private latched = 0;
  mouseDX = 0;
  mouseDY = 0;
  private codeToActions = new Map<string, string[]>();
  private listeners: ActionListener[] = [];
  locked = false;
  /** When false, game keys are not captured (menus open). */
  capture = false;
  /** Test hook: buttons forced on (used by automated browser tests). */
  debugButtons = 0;
  onLockChange: (locked: boolean) => void = () => {};

  constructor(
    private canvas: HTMLElement,
    private settings: Settings,
  ) {
    this.rebuildBindings();
    window.addEventListener('keydown', this.onKeyDown, { capture: true });
    window.addEventListener('keyup', this.onKeyUp, { capture: true });
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('contextmenu', (e) => {
      if (this.capture) e.preventDefault();
    });
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.releaseAll();
      this.onLockChange(this.locked);
    });
  }

  rebuildBindings(): void {
    this.codeToActions.clear();
    for (const [action, codes] of Object.entries(this.settings.keybinds)) {
      for (const code of codes) {
        const list = this.codeToActions.get(code) ?? [];
        list.push(action);
        this.codeToActions.set(code, list);
      }
    }
  }

  /** Fires for non-movement actions (scoreboard, tuning…) on key-down. */
  onAction(fn: ActionListener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private press(code: string): void {
    const actions = this.codeToActions.get(code);
    if (!this.held.has(code)) {
      for (const a of actions ?? []) {
        const b = ACTION_BUTTON[a];
        if (b) this.latched |= b;
        for (const l of this.listeners) l(a);
      }
    }
    this.held.add(code);
  }

  private release(code: string): void {
    this.held.delete(code);
    for (const a of this.codeToActions.get(code) ?? [])
      for (const l of this.listeners) l(a + ':up');
  }

  releaseAll(): void {
    this.held.clear();
  }

  isHeld(action: string): boolean {
    for (const code of this.settings.keybinds[action] ?? []) if (this.held.has(code)) return true;
    return false;
  }

  /** Buttons for this tick: held keys plus any press that happened since the last sample. */
  sampleButtons(): number {
    let b = this.latched | this.debugButtons;
    this.latched = 0;
    if (!this.capture) return this.debugButtons;
    for (const code of this.held) {
      for (const a of this.codeToActions.get(code) ?? []) b |= ACTION_BUTTON[a] ?? 0;
    }
    return b;
  }

  takeMouse(): [number, number] {
    const d: [number, number] = [this.mouseDX, this.mouseDY];
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.capture) {
      if (e.code === 'Backquote' || e.code === 'Tab')
        for (const a of this.codeToActions.get(e.code) ?? []) for (const l of this.listeners) l(a);
      return;
    }
    // Block browser shortcuts (Ctrl+R/S/D/…, Space scrolling, Tab focus). Ctrl+W/T/N are only
    // blockable in fullscreen with Keyboard Lock (requested on Play).
    if (e.code !== 'F11' && e.code !== 'F12') e.preventDefault();
    if (e.code === 'Escape') {
      document.exitPointerLock?.();
      return;
    }
    if (e.repeat) return;
    this.press(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (this.capture) e.preventDefault();
    this.release(e.code);
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.capture || !this.locked) return;
    this.press(`Mouse${e.button}`);
  };

  private onMouseUp = (e: MouseEvent): void => {
    this.release(`Mouse${e.button}`);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.capture) return;
    e.preventDefault();
    const code = e.deltaY > 0 ? 'WheelDown' : 'WheelUp';
    // a wheel notch is an instant tap
    for (const a of this.codeToActions.get(code) ?? []) {
      const b = ACTION_BUTTON[a];
      if (b) this.latched |= b;
    }
  };

  /** Lock the mouse (raw input where supported). Must be called from a user gesture. */
  async lockPointer(): Promise<void> {
    const el = this.canvas as HTMLElement & {
      requestPointerLock(opts?: { unadjustedMovement?: boolean }): Promise<void> | void;
    };
    try {
      await el.requestPointerLock({ unadjustedMovement: true });
    } catch {
      try {
        await el.requestPointerLock();
      } catch {
        /* user will click again */
      }
    }
  }

  /** Fullscreen + Keyboard Lock so Ctrl+W / Ctrl+T can't close the game mid-slide. */
  async enterFullscreen(): Promise<void> {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      const kb = (
        navigator as Navigator & { keyboard?: { lock?: (keys?: string[]) => Promise<void> } }
      ).keyboard;
      await kb?.lock?.();
    } catch {
      /* not supported or denied — the beforeunload guard still protects the player */
    }
  }
}

/** Ask before leaving the page while a match is running (Ctrl+W safety net). */
export const setLeaveGuard = (on: boolean): void => {
  window.onbeforeunload = on
    ? (e: BeforeUnloadEvent) => {
        e.preventDefault();
        return '';
      }
    : null;
};
