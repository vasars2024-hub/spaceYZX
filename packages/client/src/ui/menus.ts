// Menu screens built from small DOM helpers. All user-provided text goes through textContent.
import { RULES_DEFAULTS as RULES } from '@space-yz/shared';
import { DEFAULT_KEYBINDS, keyHint, type Keybinds } from '../keybinds';
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

export const select = <T extends string>(
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

export const toggle = (
  label: string,
  value: boolean,
  onChange: (v: boolean) => void,
): HTMLElement => {
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
    select<Settings['quality']>(
      'Graphics quality (antialiasing changes after a page reload)',
      [
        ['potato', 'Potato (old laptops)'],
        ['low', 'Low'],
        ['medium', 'Medium'],
        ['high', 'High'],
      ],
      s.quality,
      (v) => {
        s.quality = v;
        apply();
      },
    ),
    slider(
      'Resolution',
      0.5,
      1,
      0.05,
      s.renderScale,
      (v) => `${Math.round(v * 100)}%`,
      (v) => {
        s.renderScale = v;
        apply();
      },
    ),
    toggle('Lower resolution automatically when slow', s.dynamicResolution, (v) => {
      s.dynamicResolution = v;
      apply();
    }),
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

/**
 * The Controls help rows with the player's own keys (Settings → Controls changes them).
 * `{action}` is the first key of an action, `{action*}` all its keys (keybinds.ts keyHint).
 */
export const controlsHelp = (binds: Keybinds = DEFAULT_KEYBINDS): [string, string][] =>
  (
    [
      ['{forward} {left} {back} {right}', 'Move (you sprint automatically)'],
      [
        '{jump*}',
        'Jump · wall-jump · in the air: hold for a jetpack burst · push off / thruster in zero-G',
      ],
      ['{crouch*}', 'Crouch · slide when sprinting'],
      ['{dash*}', 'Dash · in races: SURGE (a burst of speed, 3 per race)'],
      [
        '{magboots*}',
        'Gravity shift: walk on the nearest wall or ceiling within 2.5 m (again or jump to let go)',
      ],
      ['{fire*}', 'Hold to aim a Quick Throw, release to throw · fire the Laser when it is out'],
      ['{alt*}', 'Hold: Wind-up Throw · while your Boomerang flies: steer it'],
      [
        'Flick mouse in flight',
        'Tilt your Quick Throw left / right while it flies out (faster flick = sharper curve)',
      ],
      ['{melee*}', 'Slash / deflect · hold: teleport slash (not in CS modes)'],
      ['{grenade*}', 'Grenade'],
      ['{nadeBounce*}', 'Grenade bounces: cycle how often the next grenade bounces'],
      ['{minePlace*} / {mineDetonate*}', 'Remote mine: place it where you stand / set it off'],
      ['{slot1} / {slot2}', 'Switch weapon: Boomerang / Laser (CS kit: AK / Deagle)'],
      [
        '{use*} (hold)',
        `Bomb mode: plant in site A or B (${RULES.bombPlantSec} s) · defuse next to the bomb (${RULES.bombDefuseSec} s)`,
      ],
      [
        '{recall*}',
        'Lethal Recall (Boomerang) · reload (Laser) · in races: hold to go back to your checkpoint',
      ],
      ['{scoreboard*}', 'Scoreboard'],
      ['{bigMap*}', 'Big map (hold)'],
      [
        '{chatTeam} / {chatAll}',
        'Online: chat to your team / to everyone (Enter sends, Esc cancels)',
      ],
      ['Hold {voiceTeam} / {voiceAll}', 'Online: talk to your team / to everyone (voice chat)'],
      ['{tuning*}', 'Tuning panel (dev)'],
      ['Esc', 'Menu'],
    ] as [string, string][]
  ).map(([k, d]) => [keyHint(binds, k), d]);

/** The help rows with the default keys. */
export const CONTROLS_HELP: [string, string][] = controlsHelp();

/** Controls help table: the keyboard + mouse rows, or other rows (the touch controls). */
export const controlsTable = (rows: [string, string][] = CONTROLS_HELP): HTMLElement =>
  h(
    'table',
    { class: 'controls' },
    ...rows.map(([k, d]) => h('tr', {}, h('td', { class: 'key' }, k), h('td', {}, d))),
  );
