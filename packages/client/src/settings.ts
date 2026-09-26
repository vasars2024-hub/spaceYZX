// Player settings, persisted in localStorage.
export type CameraRotation = 'body' | 'fast' | 'medium' | 'slow';

export interface Settings {
  sensitivity: number; // degrees per mouse count
  fov: number; // horizontal degrees
  cameraRotation: CameraRotation;
  fullscreenOnPlay: boolean;
  masterVolume: number;
  sfxVolume: number;
  uiVolume: number;
  showFps: boolean;
  showNetStats: boolean;
  invertY: boolean;
  quality: 'potato' | 'low' | 'medium' | 'high';
  renderScale: number; // 0.5..1 (1 = native, capped DPR)
  dynamicResolution: boolean;
  brightness: number; // 0.8..1.2 (capped for fairness)
  screenShake: boolean;
  /** how busy the screen gets (see render/effects.ts) */
  effects: 'full' | 'reduced' | 'minimal';
  /** show sounds as on-screen direction indicators (play without sound / headphones) */
  soundVisualizer: boolean;
  throwPreview: boolean;
  throwPreviewOpacity: number;
  crosshair: CrosshairSettings;
  keybinds: Record<string, string[]>;
  nickname: string;
  /** online text chat: show enemies' all-chat */
  chatShowEnemyAll: boolean;
  /** voice chat: connect and play others' voices (the mic is only asked for on push-to-talk) */
  voiceEnabled: boolean;
  /** incoming voice volume 0..1 */
  voiceVolume: number;
  /** hear enemies when they talk on the all channel */
  voiceHearEnemy: boolean;
  /** mute every enemy (their chat and voice) */
  muteEnemies: boolean;
  /** on-screen touch controls + phone layout: detected ('auto') or forced */
  touchControls: 'auto' | 'on' | 'off';
  /** touch look: degrees per CSS pixel of finger movement */
  touchLookSensitivity: number;
  /** on-screen button size (1 = default, scaled further for bigger screens) */
  touchButtonScale: number;
  /** on-screen button opacity 0.2..0.9 */
  touchButtonOpacity: number;
  /** dragging the held Fire button: aims ('aim'), only sideways curve swipes ('curve'), nothing */
  touchFireDrag: 'aim' | 'curve' | 'off';
}

export interface CrosshairSettings {
  style: 'cross' | 'dot' | 'circle';
  color: string;
  size: number;
  gap: number;
  thickness: number;
  outline: boolean;
}

export const DEFAULT_KEYBINDS: Record<string, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space', 'WheelDown'],
  crouch: ['ControlLeft', 'KeyC'],
  dash: ['ShiftLeft'],
  fire: ['Mouse0'],
  alt: ['Mouse2'],
  melee: ['KeyE'],
  grenade: ['KeyQ'],
  recall: ['KeyR'],
  magboots: ['KeyF'],
  slot1: ['Digit1'],
  slot2: ['Digit2'],
  use: ['KeyG'],
  scoreboard: ['Tab'],
  tuning: ['Backquote'],
  chatTeam: ['Enter'],
  chatAll: ['KeyY'],
  voiceTeam: ['KeyV'],
  voiceAll: ['KeyB'],
};

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 0.07,
  fov: 100,
  cameraRotation: 'body',
  fullscreenOnPlay: true,
  masterVolume: 0.8,
  sfxVolume: 1,
  uiVolume: 0.8,
  showFps: true,
  showNetStats: true,
  invertY: false,
  quality: 'medium',
  renderScale: 1,
  dynamicResolution: true,
  brightness: 1,
  screenShake: true,
  effects: 'reduced',
  soundVisualizer: false,
  throwPreview: true,
  throwPreviewOpacity: 0.8,
  crosshair: { style: 'cross', color: '#e8fbff', size: 7, gap: 4, thickness: 2, outline: true },
  keybinds: DEFAULT_KEYBINDS,
  nickname: '',
  chatShowEnemyAll: true,
  voiceEnabled: true,
  voiceVolume: 0.8,
  voiceHearEnemy: true,
  muteEnemies: false,
  touchControls: 'auto',
  touchLookSensitivity: 0.3,
  touchButtonScale: 1,
  touchButtonOpacity: 0.55,
  touchFireDrag: 'aim',
};

const KEY = 'spaceyz.settings.v1';

const safeGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const safeSet = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode etc. */
  }
};

export const loadSettings = (): Settings => {
  const raw = safeGet(KEY);
  if (!raw) return structuredClone(DEFAULT_SETTINGS);
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const s: Settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      ...parsed,
      crosshair: { ...DEFAULT_SETTINGS.crosshair, ...(parsed.crosshair ?? {}) },
      keybinds: { ...DEFAULT_KEYBINDS, ...(parsed.keybinds ?? {}) },
    };
    // saved before the Effects option existed: the sound visualizer was on by default then,
    // and in a 5v5 it's a lot; switch it off once (players can turn it back on)
    if (parsed.effects === undefined) s.soundVisualizer = false;
    if (!['full', 'reduced', 'minimal'].includes(s.effects)) s.effects = 'reduced';
    // fairness: brightness can't be pushed past the cap by editing storage
    s.brightness = Math.min(1.2, Math.max(0.8, Number(s.brightness) || 1));
    s.renderScale = Math.min(1, Math.max(0.5, Number(s.renderScale) || 1));
    s.voiceVolume = Math.min(1, Math.max(0, Number(s.voiceVolume) || 0));
    if (!['auto', 'on', 'off'].includes(s.touchControls)) s.touchControls = 'auto';
    if (!['aim', 'curve', 'off'].includes(s.touchFireDrag)) s.touchFireDrag = 'aim';
    const num = (v: unknown, min: number, max: number, def: number): number => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
    };
    s.touchLookSensitivity = num(s.touchLookSensitivity, 0.05, 1.2, 0.3);
    s.touchButtonScale = num(s.touchButtonScale, 0.7, 1.5, 1);
    s.touchButtonOpacity = num(s.touchButtonOpacity, 0.2, 0.9, 0.55);
    return s;
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
};

export const saveSettings = (s: Settings): void => safeSet(KEY, JSON.stringify(s));

/** False on the very first run in this browser (nothing saved yet). */
export const hasSavedSettings = (): boolean => safeGet(KEY) !== null;

export const storage = { get: safeGet, set: safeSet };

/** Degrees per second for the camera's gravity re-orientation (Infinity = follow body). */
export const cameraRotationRate = (r: CameraRotation): number =>
  r === 'body' ? Infinity : r === 'fast' ? 540 : r === 'medium' ? 300 : 160;
