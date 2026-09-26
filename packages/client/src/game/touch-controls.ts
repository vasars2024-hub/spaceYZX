// On-screen touch controls for phones and tablets (the mobile layout, see mobile.ts). Feeds the
// same InputManager as the keyboard and mouse: fingers hold "virtual" actions (-> Btn bits and
// action listeners) and turn the view through the mouse path, so the simulation, prediction and
// every feature see ordinary input.
//
// Layout (landscape): left 40% = floating movement stick; the rest = drag to look; buttons on
// the right for the thumb; a small row top-right (menu, scores, chat, push-to-talk).
// Pure logic lives in touch-input.ts (unit-tested).
import { Btn, Phase } from '@space-yz/shared';
import type { ClientFeature, GameClient } from './client';
import type { Settings } from '../settings';
import { h } from '../ui/menus';
import {
  AltLatch,
  HybridToggle,
  SwipeUndo,
  followStick,
  joystickButtons,
  touchLookDegrees,
} from './touch-input';
import { enterMobileFullscreen } from '../mobile';

/** What each on-screen control does, for the Controls screen on phones. */
export const TOUCH_CONTROLS_HELP: [string, string][] = [
  ['Left side', 'Drag anywhere: move (you sprint automatically)'],
  ['Right side', 'Drag: look around (sensitivity: Settings → Touch)'],
  [
    'THROW / FIRE',
    'Hold to aim a Quick Throw, let go to throw · drag while holding to aim · fires the Laser when it is out',
  ],
  [
    'Curve a throw',
    'Swipe sideways on THROW as you lift your thumb (faster swipe = more curve; watch the meter) — the view turns back afterwards',
  ],
  ['WIND / STEER', 'Tap: Wind-up Throw (then THROW when it is ready) · while it flies: steer'],
  ['JUMP', 'Jump · wall-jump · hold in the air for a jetpack burst'],
  ['SLIDE', 'Tap: crouch on/off (slide when running) · hold: crouch while held'],
  ['DASH / SLASH', 'Dash · slash / deflect'],
  ['RECALL', 'Lethal Recall (Boomerang) · reload (Laser)'],
  ['NADE / SWAP / GRAV', 'Gravity Grenade · switch weapon · gravity shift (walk on walls)'],
  ['USE', 'Bomb mode: hold to plant or defuse'],
  ['Top right', 'Menu · scoreboard · chat and push-to-talk (online)'],
];

interface ButtonDef {
  id: string;
  label: string;
  /** diameter (px at scale 1) */
  size: number;
  /** right / bottom offset of the button from the safe gutter (px at scale 1) */
  right: number;
  bottom: number;
}

/** Thumb cluster, bottom-right. */
const MAIN: ButtonDef[] = [
  { id: 'jump', label: 'JUMP', size: 72, right: 0, bottom: 0 },
  { id: 'crouch', label: 'SLIDE', size: 60, right: 84, bottom: 0 },
  { id: 'grenade', label: 'NADE', size: 52, right: 156, bottom: 0 },
  { id: 'use', label: 'USE', size: 56, right: 220, bottom: 0 },
  { id: 'fire', label: 'THROW', size: 88, right: 76, bottom: 76 },
  { id: 'dash', label: 'DASH', size: 56, right: 0, bottom: 84 },
  { id: 'alt', label: 'WIND', size: 60, right: 176, bottom: 84 },
  { id: 'melee', label: 'SLASH', size: 56, right: 0, bottom: 152 },
  { id: 'recall', label: 'RECALL', size: 52, right: 88, bottom: 176 },
  { id: 'swap', label: 'SWAP', size: 52, right: 152, bottom: 176 },
  { id: 'magboots', label: 'GRAV', size: 52, right: 0, bottom: 220 },
];
/** height of the thumb cluster at scale 1 (the tallest column) */
const CLUSTER_H = 272;
/** Small row, top-right (right to left). */
const TOP: { id: string; label: string }[] = [
  { id: 'pause', label: '❚❚' },
  { id: 'score', label: 'SCORES' },
  { id: 'chat', label: 'CHAT' },
  { id: 'voiceTeam', label: 'TALK TEAM' },
  { id: 'voiceAll', label: 'TALK ALL' },
];
const TOP_SIZE = 48;
/** buttons that simply hold their action while a finger is on them */
const HOLD_ACTION: Record<string, string> = {
  jump: 'jump',
  dash: 'dash',
  melee: 'melee',
  recall: 'recall',
  grenade: 'grenade',
  magboots: 'magboots',
  use: 'use',
  voiceTeam: 'voiceTeam',
  voiceAll: 'voiceAll',
};
/** the stick's movement buttons, as actions */
const MOVE_BITS: [string, number][] = [
  ['forward', Btn.Forward],
  ['back', Btn.Back],
  ['left', Btn.Left],
  ['right', Btn.Right],
];
/** movement stick radius (px at scale 1) */
const STICK_R = 56;
/** the stick zone: this much of the screen width from the left */
const STICK_ZONE = 0.4;

type Role =
  | { kind: 'stick' }
  | { kind: 'look'; x: number; y: number }
  | { kind: 'btn'; id: string; el: HTMLElement; x: number; y: number; action?: string };

export interface TouchControlsOptions {
  settings: Settings;
  /** open the in-game menu */
  onPause: () => void;
  /** online room: chat and voice buttons */
  online: boolean;
  /** the touch layout is (still) on */
  enabled: () => boolean;
}

export class TouchControls implements ClientFeature {
  private client: GameClient | null = null;
  private layer!: HTMLDivElement;
  private rotate!: HTMLDivElement;
  private stickEl!: HTMLDivElement;
  private knobEl!: HTMLDivElement;
  private buttons = new Map<string, HTMLDivElement>();
  private labels = new Map<string, string>();
  private roles = new Map<number, Role>();
  private stickId: number | null = null;
  private lookId: number | null = null;
  private stick = { baseX: 0, baseY: 0, dx: 0, dy: 0 };
  /** movement buttons the stick holds right now (Btn bits) */
  private stickBits = 0;
  private alt = new AltLatch();
  private crouch = new HybridToggle();
  private swipe = new SwipeUndo();
  private scoreOn = false;
  private shown = true;
  private scale = 1;
  private hinted = false;
  private triedFullscreen = false;
  private layoutKey = '';
  private offResize: (() => void) | null = null;

  constructor(private opts: TouchControlsOptions) {}

  init(c: GameClient): void {
    this.client = c;
    this.stickEl = h('div', { class: 'tc-stick idle' });
    this.knobEl = h('div', { class: 'tc-knob' });
    this.stickEl.append(this.knobEl);
    this.layer = h('div', { class: 'touch-layer' }, this.stickEl);
    for (const d of MAIN) this.layer.append(this.makeButton(d.id, d.label, 'tc-btn'));
    const top = h('div', { class: 'tc-top' });
    for (const d of TOP) top.append(this.makeButton(d.id, d.label, 'tc-btn tc-small'));
    this.layer.append(top);
    this.rotate = h(
      'div',
      { class: 'rotate-overlay' },
      h('div', { class: 'rotate-phone' }),
      h('div', {}, 'Turn your phone sideways to play'),
    );
    c.deps.ui.append(this.layer, this.rotate);

    const l = this.layer;
    l.addEventListener('pointerdown', this.onDown);
    l.addEventListener('pointermove', this.onMove);
    l.addEventListener('pointerup', this.onUp);
    l.addEventListener('pointercancel', this.onUp);
    l.addEventListener('lostpointercapture', this.onUp);
    // no long-press menus, text selection, double-tap zoom or mouse emulation from the fingers
    l.addEventListener('contextmenu', (e) => e.preventDefault());
    l.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    const onResize = () => this.layout(true);
    window.addEventListener('resize', onResize);
    this.offResize = () => window.removeEventListener('resize', onResize);
    this.layout(true);
    this.idleStick();
  }

  private makeButton(id: string, label: string, cls: string): HTMLDivElement {
    const el = h('div', { class: cls, 'data-tb': id, role: 'button', 'aria-label': label });
    el.textContent = label;
    this.buttons.set(id, el);
    this.labels.set(id, label);
    return el;
  }

  /** Sizes and positions from the button-size setting and the screen size. */
  private layout(force = false): void {
    const s = this.opts.settings;
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    const key = `${w}x${hgt}:${s.touchButtonScale}:${s.touchButtonOpacity}`;
    if (!force && key === this.layoutKey) return;
    this.layoutKey = key;
    // bigger screens get bigger buttons; the thumb cluster must still fit under the top row
    const auto = Math.min(1.35, Math.max(0.85, Math.min(w, hgt) / 390));
    const fit = (hgt - 32 - TOP_SIZE - 24) / CLUSTER_H;
    this.scale = Math.max(0.6, Math.min(s.touchButtonScale * auto, fit));
    const k = this.scale;
    this.layer.style.setProperty('--tb', String(k));
    this.layer.style.setProperty('--tb-alpha', String(s.touchButtonOpacity));
    for (const d of MAIN) {
      const el = this.buttons.get(d.id);
      if (!el) continue;
      el.style.width = el.style.height = `${d.size * k}px`;
      el.style.right = `calc(var(--gr) + ${d.right * k}px)`;
      el.style.bottom = `calc(var(--gb) + ${d.bottom * k}px)`;
      el.style.fontSize = `${Math.round((d.id === 'fire' ? 14 : 11) * Math.min(1.2, k))}px`;
    }
    this.stickEl.style.width = this.stickEl.style.height = `${STICK_R * 2 * k}px`;
    this.knobEl.style.width = this.knobEl.style.height = `${STICK_R * 0.9 * k}px`;
    if (this.stickId === null) this.idleStick();
  }

  private get radius(): number {
    return STICK_R * this.scale;
  }

  /** Resting stick: a faint hint where the left thumb goes. */
  private idleStick(): void {
    const r = this.radius;
    const g = 16;
    this.stick = { baseX: g + 40 + r, baseY: window.innerHeight - g - 30 - r, dx: 0, dy: 0 };
    this.stickEl.classList.add('idle');
    this.paintStick();
  }

  private paintStick(): void {
    const r = this.radius;
    const { baseX, baseY, dx, dy } = this.stick;
    this.stickEl.style.transform = `translate(${baseX - r}px, ${baseY - r}px)`;
    this.knobEl.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
  }

  private setStickBits(bits: number): void {
    const v = this.client?.deps.input.virtual;
    if (!v || bits === this.stickBits) return;
    for (const [action, bit] of MOVE_BITS) {
      const was = (this.stickBits & bit) !== 0;
      const now = (bits & bit) !== 0;
      if (now && !was) v.press(action);
      else if (was && !now) v.release(action);
    }
    this.stickBits = bits;
  }

  private onDown = (e: PointerEvent): void => {
    e.preventDefault();
    const c = this.client;
    if (!c || !this.shown) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      this.layer.setPointerCapture(e.pointerId);
    } catch {
      /* already gone */
    }
    const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-tb]');
    if (el?.dataset.tb) {
      const role: Role = { kind: 'btn', id: el.dataset.tb, el, x: e.clientX, y: e.clientY };
      this.roles.set(e.pointerId, role);
      el.classList.add('down');
      this.buttonDown(role);
      return;
    }
    if (e.clientX < window.innerWidth * STICK_ZONE) {
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      this.roles.set(e.pointerId, { kind: 'stick' });
      this.stick = { baseX: e.clientX, baseY: e.clientY, dx: 0, dy: 0 };
      this.stickEl.classList.remove('idle');
      this.paintStick();
    } else {
      if (this.lookId !== null) return;
      this.lookId = e.pointerId;
      this.roles.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY });
    }
  };

  private onMove = (e: PointerEvent): void => {
    const role = this.roles.get(e.pointerId);
    if (!role) return;
    e.preventDefault();
    this.moveRole(role, e.clientX, e.clientY);
  };

  private moveRole(role: Role, x: number, y: number): void {
    const c = this.client;
    if (!c) return;
    const input = c.deps.input;
    const sens = this.opts.settings.touchLookSensitivity;
    if (role.kind === 'stick') {
      const r = this.radius;
      this.stick = followStick(this.stick.baseX, this.stick.baseY, x, y, r);
      this.paintStick();
      this.setStickBits(joystickButtons(this.stick.dx, this.stick.dy, r));
    } else if (role.kind === 'look') {
      const [yaw, pitch] = touchLookDegrees(x - role.x, y - role.y, sens);
      role.x = x;
      role.y = y;
      input.addLook(yaw, pitch);
    } else if (role.id === 'fire') {
      const mode = this.opts.settings.touchFireDrag;
      const [yaw, pitch] = touchLookDegrees(x - role.x, y - role.y, sens);
      role.x = x;
      role.y = y;
      if (mode === 'aim') {
        input.addLook(yaw, pitch);
        this.swipe.add(performance.now(), yaw);
      } else if (mode === 'curve' && c.session.local()?.aiming) {
        // sideways only, and always turned back after the throw
        input.addLook(yaw, 0);
        this.swipe.add(performance.now(), yaw);
      }
    }
  }

  private onUp = (e: PointerEvent): void => {
    const role = this.roles.get(e.pointerId);
    if (!role) return;
    this.roles.delete(e.pointerId);
    const c = this.client;
    // the last bit of movement counts (a swipe as the thumb lifts is what curves a throw)
    if (e.type === 'pointerup') this.moveRole(role, e.clientX, e.clientY);
    if (role.kind === 'stick') {
      this.stickId = null;
      this.setStickBits(0);
      this.idleStick();
    } else if (role.kind === 'look') {
      this.lookId = null;
    } else {
      role.el.classList.remove('down');
      this.buttonUp(role, e.type === 'pointerup');
    }
    // fullscreen needs a tap; online games start without one, so try on the first tap
    if (
      e.type === 'pointerup' &&
      !this.triedFullscreen &&
      c?.deps.settings.fullscreenOnPlay &&
      !document.fullscreenElement
    ) {
      this.triedFullscreen = true;
      void enterMobileFullscreen();
    }
  };

  private inHand(): boolean {
    const s = this.client?.session;
    if (!s) return true;
    const b = s.boomerangs().find((x) => x.owner === s.localId);
    return !b || b.phase === Phase.Held;
  }

  private buttonDown(role: Extract<Role, { kind: 'btn' }>): void {
    const c = this.client;
    if (!c) return;
    const v = c.deps.input.virtual;
    const now = performance.now();
    switch (role.id) {
      case 'fire':
        v.press('fire');
        break;
      case 'alt':
        if (this.alt.toggle(this.inHand())) v.press('alt');
        else v.release('alt');
        break;
      case 'jump':
        // jumping stands you up from a toggled crouch
        if (this.crouch.clear()) v.release('crouch');
        v.press('jump');
        break;
      case 'crouch':
        if (this.crouch.down(now)) v.press('crouch');
        break;
      case 'swap':
        role.action = c.session.local()?.weapon === 1 ? 'slot1' : 'slot2';
        v.press(role.action);
        break;
      case 'score':
        this.scoreOn = !this.scoreOn;
        if (this.scoreOn) v.press('scoreboard');
        else v.release('scoreboard');
        break;
      case 'pause':
      case 'chat':
        break; // on release (opening the phone keyboard needs the finger lifted)
      default: {
        const a = HOLD_ACTION[role.id];
        if (a) v.press(a);
      }
    }
  }

  private buttonUp(role: Extract<Role, { kind: 'btn' }>, tapped: boolean): void {
    const c = this.client;
    if (!c) return;
    const v = c.deps.input.virtual;
    const now = performance.now();
    switch (role.id) {
      case 'fire':
        // no turning back after a throw: in flight, turning the view tilts the Boomerang
        this.swipe.release(now, false);
        v.release('fire');
        break;
      case 'alt':
      case 'score':
        break; // toggles
      case 'crouch':
        if (this.crouch.up(now)) v.release('crouch');
        break;
      case 'swap':
        if (role.action) v.release(role.action);
        break;
      case 'pause':
        if (tapped) this.opts.onPause();
        break;
      case 'chat':
        if (tapped) v.tap('chatTeam'); // the chat feature opens the box and the keyboard
        break;
      default: {
        const a = HOLD_ACTION[role.id];
        if (a) v.release(a);
      }
    }
  }

  /** Everything let go (menu opened, chat box took the keyboard). */
  private reset(): void {
    const v = this.client?.deps.input.virtual;
    const fingers = [...this.roles.entries()];
    this.roles.clear();
    for (const [id, role] of fingers) {
      if (role.kind === 'btn') role.el.classList.remove('down');
      try {
        this.layer.releasePointerCapture(id);
      } catch {
        /* gone */
      }
    }
    this.stickId = null;
    this.lookId = null;
    this.stickBits = 0;
    this.alt.clear();
    this.crouch.clear();
    this.scoreOn = false;
    this.swipe.cancel();
    v?.letGoAll();
    this.idleStick();
  }

  frame(c: GameClient, dt: number): void {
    const input = c.deps.input;
    const on = this.opts.enabled();
    const show = on && input.capture && !input.isTyping;
    if (show !== this.shown) {
      this.shown = show;
      this.layer.classList.toggle('hidden', !show);
      if (!show) this.reset();
    }
    // portrait: ask to rotate (menus stay usable in portrait)
    this.rotate.classList.toggle('hidden', !(on && input.capture));
    if (!show) return;
    if (!this.hinted) {
      this.hinted = true;
      // replaces the keyboard hint set at game start
      c.hud.setHint(
        'Left side: move · right side: look · hold THROW to aim, swipe sideways as you let go to curve · ❚❚ menu',
        14,
      );
    }
    this.layout();

    const v = input.virtual;
    const me = c.session.local();
    const inHand = this.inHand();
    if (this.alt.update(dt, inHand, me?.windup ?? 0, !!me?.alive)) v.release('alt');
    // something let go of everything (window lost focus): the toggles follow
    if (this.alt.on && !v.isHeld('alt')) this.alt.clear();
    if (this.crouch.on && !v.isHeld('crouch')) this.crouch.clear();
    if (this.scoreOn && !v.isHeld('scoreboard')) this.scoreOn = false;

    // turn a curve swipe back after the throw
    const back = this.swipe.step(dt * 1000);
    if (back) input.addLook(back, 0);

    // context: what the buttons do right now
    const laser = me?.weapon === 1 || !inHand;
    this.setLabel('fire', laser ? 'FIRE' : 'THROW');
    this.setLabel('alt', inHand ? 'WIND' : 'STEER');
    this.setLabel('recall', me?.weapon === 1 ? 'RELOAD' : 'RECALL');
    const match = c.session.match?.() ?? null;
    this.toggleButton('use', match?.objective === 'bomb');
    this.toggleButton('score', !!match);
    this.toggleButton('chat', this.opts.online);
    const voice = this.opts.online && this.opts.settings.voiceEnabled;
    this.toggleButton('voiceTeam', voice);
    this.toggleButton('voiceAll', voice);
    this.buttons.get('alt')?.classList.toggle('on', this.alt.on);
    this.buttons.get('crouch')?.classList.toggle('on', this.crouch.on);
    this.buttons.get('score')?.classList.toggle('on', this.scoreOn);
  }

  private setLabel(id: string, text: string): void {
    if (this.labels.get(id) === text) return;
    this.labels.set(id, text);
    const el = this.buttons.get(id);
    if (el) {
      el.textContent = text;
      el.setAttribute('aria-label', text);
    }
  }

  private toggleButton(id: string, visible: boolean): void {
    this.buttons.get(id)?.classList.toggle('hidden', !visible);
  }

  dispose(): void {
    this.reset();
    this.offResize?.();
    this.layer.remove();
    this.rotate.remove();
    this.client = null;
  }
}
