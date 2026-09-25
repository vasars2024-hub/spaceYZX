// Full settings screen: Game, Video, Audio, Controls (rebinding, incl. mouse buttons and the
// wheel) and Crosshair (editor with live preview). Everything saves immediately.
import type { Settings, CameraRotation, CrosshairSettings } from '../settings';
import { saveSettings, DEFAULT_KEYBINDS, DEFAULT_SETTINGS } from '../settings';
import { h, button, slider, select, toggle } from './menus';

/** Brightness is capped so dark corners can't be lifted to spot players (fairness). */
export const BRIGHTNESS_MIN = 0.8;
export const BRIGHTNESS_MAX = 1.2;

const ACTIONS: [string, string][] = [
  ['forward', 'Move forward'],
  ['back', 'Move back'],
  ['left', 'Strafe left'],
  ['right', 'Strafe right'],
  ['jump', 'Jump / thruster'],
  ['crouch', 'Crouch / slide'],
  ['dash', 'Dash'],
  ['fire', 'Throw (hold to aim) / Laser'],
  ['alt', 'Wind-up / steer'],
  ['melee', 'Slash / deflect'],
  ['recall', 'Lethal Recall'],
  ['grenade', 'Gravity Grenade'],
  ['magboots', 'Mag-boots'],
  ['scoreboard', 'Scoreboard'],
];

/** Friendly names for key codes. */
export const keyLabel = (code: string | undefined): string => {
  if (!code) return '—';
  const mouse: Record<string, string> = {
    Mouse0: 'Left mouse',
    Mouse1: 'Middle mouse',
    Mouse2: 'Right mouse',
    Mouse3: 'Mouse 4',
    Mouse4: 'Mouse 5',
    WheelUp: 'Wheel up',
    WheelDown: 'Wheel down',
  };
  if (mouse[code]) return mouse[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return `${code.slice(5)} arrow`;
  return code.replace(/Left$/, ' (left)').replace(/Right$/, ' (right)');
};

/** Assign `code` to `action` slot `slot`, removing it from any other action first. */
export const bindKey = (
  binds: Record<string, string[]>,
  action: string,
  slot: number,
  code: string | null,
): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const [a, codes] of Object.entries(binds)) out[a] = codes.filter((c) => c !== code);
  const list = [...(out[action] ?? [])];
  if (code === null) list.splice(slot, 1);
  else if (slot < list.length) list[slot] = code;
  else list.push(code);
  out[action] = list.slice(0, 2);
  return out;
};

type Tab = 'game' | 'video' | 'audio' | 'controls' | 'crosshair';

export const settingsScreen = (
  s: Settings,
  onChange: () => void,
  back: () => void,
): HTMLElement => {
  let tab: Tab = 'game';
  const apply = () => {
    saveSettings(s);
    onChange();
  };
  const tabs = h('div', { class: 'choice-row tabs' });
  const body = h('div', { class: 'settings-list' });
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  const gameTab = () => [
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
    toggle('Invert mouse Y', s.invertY, (v) => {
      s.invertY = v;
      apply();
    }),
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
      'Camera rotation when gravity changes',
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
    toggle('Show my throw path while aiming', s.throwPreview, (v) => {
      s.throwPreview = v;
      apply();
    }),
    slider('Throw path opacity', 0.2, 1, 0.05, s.throwPreviewOpacity, pct, (v) => {
      s.throwPreviewOpacity = v;
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
    toggle('Show ping (online)', s.showNetStats, (v) => {
      s.showNetStats = v;
      apply();
    }),
    toggle('Fullscreen when playing (protects Ctrl+W)', s.fullscreenOnPlay, (v) => {
      s.fullscreenOnPlay = v;
      apply();
    }),
  ];

  const videoTab = () => [
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
    slider('Resolution', 0.5, 1, 0.05, s.renderScale, pct, (v) => {
      s.renderScale = v;
      apply();
    }),
    toggle('Lower resolution automatically when slow', s.dynamicResolution, (v) => {
      s.dynamicResolution = v;
      apply();
    }),
    slider(
      'Brightness (limited for fairness; applies to the next match)',
      BRIGHTNESS_MIN,
      BRIGHTNESS_MAX,
      0.02,
      s.brightness,
      pct,
      (v) => {
        s.brightness = Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, v));
        apply();
      },
    ),
  ];

  const audioTab = () => [
    toggle(
      'Show sounds on screen (footsteps, shots… — for playing without sound)',
      s.soundVisualizer,
      (v) => {
        s.soundVisualizer = v;
        apply();
      },
    ),
    slider('Master volume', 0, 1, 0.05, s.masterVolume, pct, (v) => {
      s.masterVolume = v;
      apply();
    }),
    slider('Game sounds', 0, 1, 0.05, s.sfxVolume, pct, (v) => {
      s.sfxVolume = v;
      apply();
    }),
    slider('Menu sounds', 0, 1, 0.05, s.uiVolume, pct, (v) => {
      s.uiVolume = v;
      apply();
    }),
  ];

  let listening: { action: string; slot: number; stop: () => void } | null = null;
  const controlsTab = (): HTMLElement[] => {
    const table = h('table', { class: 'binds' });
    for (const [action, label] of ACTIONS) {
      const codes = s.keybinds[action] ?? [];
      const slotBtn = (slot: number) => {
        const active = listening?.action === action && listening.slot === slot;
        const b = h(
          'button',
          { class: `btn tiny ${active ? 'listening' : 'secondary'}`, type: 'button' },
          active ? 'Press a key…' : keyLabel(codes[slot]),
        );
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          listen(action, slot);
        });
        return b;
      };
      table.append(
        h('tr', {}, h('td', {}, label), h('td', {}, slotBtn(0)), h('td', {}, slotBtn(1))),
      );
    }
    return [
      h(
        'div',
        { class: 'label' },
        'Click a slot, then press a key, mouse button or turn the wheel. Esc cancels, Delete clears.',
      ),
      table,
      button(
        'Reset controls',
        () => {
          s.keybinds = structuredClone(DEFAULT_KEYBINDS);
          apply();
          render();
        },
        'btn small secondary',
      ),
    ];
  };

  const listen = (action: string, slot: number) => {
    listening?.stop();
    const done = (code: string | null | undefined) => {
      stop();
      if (code !== undefined) {
        s.keybinds = bindKey(s.keybinds, action, slot, code);
        apply();
      }
      render();
    };
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') done(undefined);
      else if (e.code === 'Delete' || e.code === 'Backspace') done(null);
      else done(e.code);
    };
    const onMouse = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('button.listening') && e.button === 0) return;
      e.preventDefault();
      done(`Mouse${e.button}`);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      done(e.deltaY > 0 ? 'WheelDown' : 'WheelUp');
    };
    const noMenu = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', onKey, { capture: true });
    window.addEventListener('mousedown', onMouse, { capture: true });
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    window.addEventListener('contextmenu', noMenu, { capture: true });
    const stop = () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      window.removeEventListener('mousedown', onMouse, { capture: true });
      window.removeEventListener('wheel', onWheel, { capture: true });
      setTimeout(() => window.removeEventListener('contextmenu', noMenu, { capture: true }), 0);
      listening = null;
    };
    listening = { action, slot, stop };
    render();
  };

  const crosshairTab = (): HTMLElement[] => {
    const c = s.crosshair;
    const preview = h('div', { class: 'crosshair-preview' });
    const ch = h('div', { class: 'crosshair' });
    preview.append(ch);
    const paint = () => {
      ch.style.setProperty('--ch-color', c.color);
      ch.style.setProperty('--ch-size', `${c.size}px`);
      ch.style.setProperty('--ch-gap', `${c.gap}px`);
      ch.style.setProperty('--ch-thick', `${c.thickness}px`);
      ch.dataset.style = c.style;
      ch.classList.toggle('outlined', c.outline);
    };
    const set = <K extends keyof CrosshairSettings>(k: K, v: CrosshairSettings[K]) => {
      c[k] = v;
      paint();
      apply();
    };
    paint();
    const color = h('input', { type: 'color', value: c.color });
    color.addEventListener('input', () => set('color', color.value));
    return [
      preview,
      select<CrosshairSettings['style']>(
        'Style',
        [
          ['cross', 'Cross'],
          ['dot', 'Dot'],
          ['circle', 'Circle'],
        ],
        c.style,
        (v) => set('style', v),
      ),
      h('label', { class: 'setting' }, h('span', { class: 'setting-label' }, 'Color'), color),
      slider(
        'Size',
        2,
        20,
        1,
        c.size,
        (v) => `${v}px`,
        (v) => set('size', v),
      ),
      slider(
        'Gap',
        0,
        12,
        1,
        c.gap,
        (v) => `${v}px`,
        (v) => set('gap', v),
      ),
      slider(
        'Thickness',
        1,
        5,
        1,
        c.thickness,
        (v) => `${v}px`,
        (v) => set('thickness', v),
      ),
      toggle('Dark outline', c.outline, (v) => set('outline', v)),
      button(
        'Reset crosshair',
        () => {
          s.crosshair = { ...DEFAULT_SETTINGS.crosshair };
          apply();
          render();
        },
        'btn small secondary',
      ),
    ];
  };

  const render = () => {
    tabs.replaceChildren(
      ...(
        [
          ['game', 'Game'],
          ['video', 'Video'],
          ['audio', 'Audio'],
          ['controls', 'Controls'],
          ['crosshair', 'Crosshair'],
        ] as const
      ).map(([t, label]) =>
        button(
          label,
          () => {
            listening?.stop();
            tab = t;
            render();
          },
          `btn small ${tab === t ? '' : 'secondary'}`,
        ),
      ),
    );
    const parts =
      tab === 'game'
        ? gameTab()
        : tab === 'video'
          ? videoTab()
          : tab === 'audio'
            ? audioTab()
            : tab === 'controls'
              ? controlsTab()
              : crosshairTab();
    body.replaceChildren(...parts);
  };
  render();
  return h(
    'div',
    { class: 'screen interactive' },
    h('h2', {}, 'Settings'),
    h('div', { class: 'panel wide-panel' }, tabs, body),
    button(
      'Back',
      () => {
        listening?.stop();
        back();
      },
      'btn secondary',
    ),
  );
};
