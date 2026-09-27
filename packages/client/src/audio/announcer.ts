// The 90s-arcade announcer ("LETHAL RECOIL!", "Round three", "Match point"…): small
// pre-rendered clips in public/audio/announcer/ (made by tools/audio/announcer.ts — TTS
// placeholders, see announcer-lines.ts), fetched and decoded lazily, played on the engine's
// 'announcer' bus (own volume slider + on/off in Settings → Audio).
//
// The announcer never holds anything up: a clip that isn't decoded yet is loaded in the
// background and played only if it arrives within `maxLateMs`; a clip that fails to load is
// skipped silently (and not asked for again).
import { ANNOUNCER_EXT, ANNOUNCER_LINES } from './announcer-lines';

/** What the announcer needs from the audio engine (AudioEngine implements it). */
export interface ClipPlayer {
  readonly unlocked: boolean;
  decodeClip(data: ArrayBuffer): Promise<AudioBuffer | null>;
  playClip(buffer: AudioBuffer, volume?: number): (() => void) | null;
}

export interface AnnouncerOptions {
  /** URL prefix of the site (Vite's BASE_URL), default '/' */
  base?: string;
  /** fetches a clip's bytes (default: window.fetch); rejects / throws on failure */
  fetch?: (url: string) => Promise<ArrayBuffer>;
  /** a clip that is still loading is dropped if it arrives later than this (ms), default 600 */
  maxLateMs?: number;
  now?: () => number;
}

const defaultFetch = async (url: string): Promise<ArrayBuffer> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.arrayBuffer();
};

const viteBase = (): string => {
  try {
    return import.meta.env?.BASE_URL ?? '/';
  } catch (_err) {
    return '/';
  }
};

export class Announcer {
  /** Settings → Audio → Announcer on/off */
  enabled = true;
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly failed = new Set<string>();
  private stopCurrent: (() => void) | null = null;
  private readonly base: string;
  private readonly fetchClip: (url: string) => Promise<ArrayBuffer>;
  private readonly maxLateMs: number;
  private readonly now: () => number;

  constructor(
    private readonly engine: ClipPlayer,
    opts: AnnouncerOptions = {},
  ) {
    this.base = opts.base ?? viteBase();
    this.fetchClip = opts.fetch ?? defaultFetch;
    this.maxLateMs = opts.maxLateMs ?? 600;
    this.now = opts.now ?? (() => performance.now());
  }

  url(id: string): string {
    return `${this.base.endsWith('/') ? this.base : `${this.base}/`}audio/announcer/${id}.${ANNOUNCER_EXT}`;
  }

  /** Is this clip decoded and ready to play right away? */
  isReady(id: string): boolean {
    return this.buffers.has(id);
  }

  /** Starts loading clips in the background (all by default). Needs audio to be unlocked. */
  preload(ids: readonly string[] = Object.keys(ANNOUNCER_LINES)): void {
    if (!this.enabled) return;
    for (const id of ids) void this.load(id);
  }

  /** Loads + decodes one clip (cached). Resolves null on any failure; never rejects. */
  load(id: string): Promise<AudioBuffer | null> {
    const have = this.buffers.get(id);
    if (have) return Promise.resolve(have);
    if (this.failed.has(id) || !(id in ANNOUNCER_LINES)) return Promise.resolve(null);
    // decoding needs a running AudioContext: try again after the first click / key press
    if (!this.engine.unlocked) return Promise.resolve(null);
    let p = this.loading.get(id);
    if (!p) {
      p = (async () => {
        try {
          const data = await this.fetchClip(this.url(id));
          const buf = await this.engine.decodeClip(data);
          if (buf) this.buffers.set(id, buf);
          else this.failed.add(id);
          return buf;
        } catch (_err) {
          this.failed.add(id);
          return null;
        } finally {
          this.loading.delete(id);
        }
      })();
      this.loading.set(id, p);
    }
    return p;
  }

  /**
   * Says a line now (cutting off the previous one). Returns true when it started playing right
   * away; a clip still loading plays when it arrives (if soon enough), a missing one is skipped.
   */
  say(id: string, volume = 1): boolean {
    if (!this.enabled) return false;
    try {
      const buf = this.buffers.get(id);
      if (buf) return this.play(buf, volume);
      const asked = this.now();
      void this.load(id).then((b) => {
        if (b && this.enabled && this.now() - asked <= this.maxLateMs) this.play(b, volume);
      });
    } catch (_err) {
      // the announcer must never break the game
    }
    return false;
  }

  /** Stops the line being said (e.g. leaving the match). */
  stop(): void {
    this.stopCurrent?.();
    this.stopCurrent = null;
  }

  private play(buf: AudioBuffer, volume: number): boolean {
    this.stop();
    this.stopCurrent = this.engine.playClip(buf, volume);
    return this.stopCurrent !== null;
  }
}
