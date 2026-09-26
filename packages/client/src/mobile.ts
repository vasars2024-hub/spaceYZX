// Mobile (phone / tablet) layout: detection, first-run performance defaults, fullscreen +
// landscape lock on Play. The layout itself is CSS under `html.mobile` (ui/mobile.css); the
// on-screen controls are game/touch-controls.ts.
import type { Settings } from './settings';

export interface DeviceEnv {
  /** the primary pointer is a finger (media query `pointer: coarse`) */
  coarsePointer: boolean;
  /** the primary pointer can hover (a mouse or trackpad) */
  canHover: boolean;
  /** navigator.maxTouchPoints */
  touchPoints: number;
  /** the screen's shorter side in CSS pixels */
  screenMin: number;
}

/** Phones and tablets: a finger is the main pointer, or a touch screen as small as a phone's. */
export const isTouchDevice = (e: DeviceEnv): boolean =>
  ((e.coarsePointer || e.touchPoints > 0) && !e.canHover) ||
  // some Android phones claim hover support; a touch screen this small is a phone anyway
  (e.touchPoints > 0 && e.screenMin > 0 && e.screenMin <= 540);

/** The touch layout is used: forced on/off in Settings, or detected ('auto'). */
export const useMobileLayout = (mode: Settings['touchControls'], e: DeviceEnv): boolean =>
  mode === 'on' ? true : mode === 'off' ? false : isTouchDevice(e);

export const readDeviceEnv = (): DeviceEnv => {
  const mq = (q: string): boolean => {
    try {
      return typeof matchMedia === 'function' && matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  return {
    coarsePointer: mq('(pointer: coarse)'),
    canHover: mq('(hover: hover)'),
    touchPoints: typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints || 0,
    screenMin: typeof screen === 'undefined' ? 0 : Math.min(screen.width || 0, screen.height || 0),
  };
};

/** First run on a phone: settings a phone GPU can hold 60 fps with. */
export const applyMobileDefaults = (s: Settings): void => {
  s.quality = 'low';
  s.effects = 'minimal';
  s.dynamicResolution = true;
  s.renderScale = 1;
};

/** Highest device pixel ratio rendered on phones (their screens are small and very dense). */
export const MOBILE_PIXEL_RATIO_CAP = 1.25;

/** Switch the page between the desktop and the touch layout. */
export const setMobileClass = (on: boolean): void => {
  document.documentElement.classList.toggle('mobile', on);
};

/**
 * Fullscreen (hides the address bar) and landscape lock. Call from a tap. Browsers that don't
 * allow either just keep going; the rotate-your-phone overlay covers portrait.
 */
export const enterMobileFullscreen = async (): Promise<void> => {
  try {
    if (!document.fullscreenElement)
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    /* not allowed here (iPhone Safari, no tap) */
  }
  try {
    const o = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
    };
    await o.lock?.('landscape');
  } catch {
    /* only works in fullscreen on Android; elsewhere the overlay asks to rotate */
  }
};
