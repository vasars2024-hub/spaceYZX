// Menu screens built from small DOM helpers. All user-provided text goes through textContent.
import type { Settings, CameraRotation } from '../settings';
import { saveSettings } from '../settings';

export const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c !== null && c !== undefined) e.append(c);
  return e;
};

export const button = (label: string, onClick: () => void, cls = 'btn'): HTMLButtonElement => {
  const b = h('button', { class: cls, type: 'button' }, label);
  b.addEventListener('click', onClick);
  return b;
};

export const slider = (
  label: string,
  min: number,
  max: number,
  stepv: number,
  value: number,
  fmt: (v: number) => string,
  onInput: (v: number) => void,
): HTMLElement => {
  const out = h('span', { class: 'setting-value' }, fmt(value));
  const input = h('input', {
    type: 'range',
    min: String(min),
    max: String(max),
    step: String(stepv),
    value: String(value),
  });
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = fmt(v);
    onInput(v);
  });
  return h('label', { class: 'setting' }, h('span', { class: 'setting-label' }, label), input, out);
};

const select = <T extends string>(
  label: string,
  options: [T, string][],
  value: T,
  onChange: (v: T) => void,
): HTMLElement => {
  const s = h('select', {});
  for (const [v, text] of options) {
    const o = h('option', { value: v }, text);
    if (v === value) o.selected = true;
    s.append(o);
  }
  s.addEventListener('change', () => onChange(s.value as T));
  return h('label', { class: 'setting' }, h('span', { class: 'setting-label' }, label), s);
};

const toggle = (label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement => {
  const c = h('input', { type: 'checkbox' });
  c.checked = value;
  c.addEventListener('change', () => onChange(c.checked));
  return h('label', { class: 'setting' }, h('span', { class: 'setting-label' }, label), c);
};

/** The quick settings used in the pause menu (the full settings screen extends this). */
export const quickSettings = (s: Settings, onChange: () => void): HTMLElement => {
  const apply = () => {
    saveSettings(s);
    onChange();
  };
  return h(
    'div',
    { class: 'settings-list' },
    slider(
      'Mouse sensitivity',
      0.01,
      0.3,
      0.005,
      s.sensitivity,
      (v) => v.toFixed(3),
      (v) => {
        s.sensitivity = v;
        apply();
      },
    ),
    slider(
      'Field of view',
      70,
      120,
      1,
      s.fov,
      (v) => `${v}°`,
      (v) => {
        s.fov = v;
        apply();
      },
    ),
    select<CameraRotation>(
      'Camera rotation (gravity changes)',
      [
        ['body', 'Follow body (fastest)'],
        ['fast', 'Fast'],
        ['medium', 'Medium'],
        ['slow', 'Slow (most comfortable)'],
      ],
      s.cameraRotation,
      (v) => {
        s.cameraRotation = v;
        apply();
      },
    ),
    slider(
      'Master volume',
      0,
      1,
      0.05,
      s.masterVolume,
      (v) => `${Math.round(v * 100)}%`,
      (v) => {
        s.masterVolume = v;
        apply();
      },
    ),
    toggle('Fullscreen when playing (protects Ctrl+W)', s.fullscreenOnPlay, (v) => {
      s.fullscreenOnPlay = v;
      apply();
    }),
    toggle('Invert mouse Y', s.invertY, (v) => {
      s.invertY = v;
      apply();
    }),
    toggle('Screen shake', s.screenShake, (v) => {
      s.screenShake = v;
      apply();
    }),
    toggle('Show FPS', s.showFps, (v) => {
      s.showFps = v;
      apply();
    }),
  );
};

export const CONTROLS_HELP: [string, string][] = [
  ['W A S D', 'Move (you sprint automatically)'],
  ['Space', 'Jump · wall-jump · push off in zero-G · thruster in zero-G'],
  ['Ctrl / C', 'Crouch · slide when sprinting'],
  ['Shift', 'Dash'],
  ['F', 'Mag-boots (zero-G): stick to the nearest surface'],
  ['Left mouse', 'Hold to aim a Quick Throw, release to throw · Laser when your Boomerang is away'],
  ['Right mouse', 'Hold: Wind-up Throw · while your Boomerang flies: steer it'],
  ['A / D on release', 'Curve the Quick Throw left / right'],
  ['E', 'Slash / deflect'],
  ['Q', 'Gravity Grenade'],
  ['R', 'Lethal Recall'],
  ['Tab', 'Scoreboard'],
  ['`', 'Tuning panel (dev)'],
  ['Esc', 'Menu'],
];

export const controlsTable = (): HTMLElement =>
  h(
    'table',
    { class: 'controls' },
    ...CONTROLS_HELP.map(([k, d]) => h('tr', {}, h('td', { class: 'key' }, k), h('td', {}, d))),
  );
