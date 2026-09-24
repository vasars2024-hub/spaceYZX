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
  throwPreview: boolean;
  throwPreviewOpacity: number;
  crosshair: CrosshairSettings;
  keybinds: Record<string, string[]>;
  nickname: string;
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
  scoreboard: ['Tab'],
  tuning: ['Backquote'],
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
  throwPreview: true,
  throwPreviewOpacity: 0.8,
  crosshair: { style: 'cross', color: '#e8fbff', size: 7, gap: 4, thickness: 2, outline: true },
  keybinds: DEFAULT_KEYBINDS,
  nickname: '',
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
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...parsed,
      crosshair: { ...DEFAULT_SETTINGS.crosshair, ...(parsed.crosshair ?? {}) },
      keybinds: { ...DEFAULT_KEYBINDS, ...(parsed.keybinds ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
};

export const saveSettings = (s: Settings): void => safeSet(KEY, JSON.stringify(s));

export const storage = { get: safeGet, set: safeSet };

/** Degrees per second for the camera's gravity re-orientation (Infinity = follow body). */
export const cameraRotationRate = (r: CameraRotation): number =>
  r === 'body' ? Infinity : r === 'fast' ? 540 : r === 'medium' ? 300 : 160;
