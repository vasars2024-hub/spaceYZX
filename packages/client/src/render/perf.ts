// Low-end performance: quality presets, dynamic resolution driven by frame time, and frame
// statistics for the benchmark. Gameplay visuals (rim lights, markers, lines) never change
// with quality — only resolution, antialiasing and decorative particles do.
import type * as THREE from 'three';
import type { Settings } from '../settings';

export interface QualityProfile {
  /** highest render scale this preset allows (the player's slider can only go lower) */
  maxScale: number;
  /** lowest scale dynamic resolution may drop to */
  minScale: number;
  antialias: boolean;
  /** decorative particle amount (kill shatters, sparks, zero-G dust) */
  particles: number;
  dust: boolean;
}

export const QUALITY: Record<Settings['quality'], QualityProfile> = {
  potato: { maxScale: 0.5, minScale: 0.5, antialias: false, particles: 0.25, dust: false },
  low: { maxScale: 0.75, minScale: 0.5, antialias: false, particles: 0.5, dust: false },
  medium: { maxScale: 1, minScale: 0.5, antialias: true, particles: 1, dust: true },
  high: { maxScale: 1, minScale: 0.6, antialias: true, particles: 1, dust: true },
};

/** Current decorative particle factor (read by effects). */
export let particleDensity = 1;
export const setParticleDensity = (d: number): void => {
  particleDensity = d;
};

/**
 * Dynamic resolution: keeps frame time near the display's budget by scaling the render
 * resolution between the preset's min and the player's chosen scale. Reacts quickly when
 * slow, recovers slowly when there is headroom (so it doesn't flicker).
 */
export class DynamicResolution {
  scale: number;
  private ema = 16.7;
  private sinceChange = 0;
  private goodFor = 0;
  /** frame budget in ms (60 Hz by default; updated from observed vsync) */
  budget = 1000 / 60;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private settings: Settings,
  ) {
    this.scale = this.maxScale();
  }

  private profile(): QualityProfile {
    return QUALITY[this.settings.quality] ?? QUALITY.medium;
  }

  maxScale(): number {
    return Math.min(this.profile().maxScale, this.settings.renderScale);
  }

  private dpr(): number {
    return Math.min(globalThis.devicePixelRatio || 1, 1.5);
  }

  /** Apply the current scale to the renderer. */
  apply(): void {
    this.renderer.setPixelRatio(this.dpr() * this.scale);
  }

  /** Settings changed: reset to the allowed maximum. */
  reset(): void {
    this.scale = this.maxScale();
    this.goodFor = 0;
    this.apply();
  }

  /** Call once per frame with the real frame time (ms). */
  frame(ms: number): void {
    if (!Number.isFinite(ms) || ms <= 0 || ms > 250) return; // tab switches, stalls
    this.ema = this.ema * 0.9 + ms * 0.1;
    this.sinceChange += ms;
    if (!this.settings.dynamicResolution) {
      if (this.scale !== this.maxScale()) this.reset();
      return;
    }
    const p = this.profile();
    const max = this.maxScale();
    const min = Math.min(p.minScale, max);
    if (this.sinceChange < 500) return;
    if (this.ema > this.budget * 1.2 && this.scale > min) {
      this.scale = Math.max(min, +(this.scale - 0.1).toFixed(2));
      this.sinceChange = 0;
      this.goodFor = 0;
      this.apply();
    } else if (this.ema < this.budget * 1.05) {
      this.goodFor += this.sinceChange;
      this.sinceChange = 0;
      if (this.goodFor > 3000 && this.scale < max) {
        this.scale = Math.min(max, +(this.scale + 0.05).toFixed(2));
        this.goodFor = 0;
        this.apply();
      }
    } else {
      this.sinceChange = 0;
      this.goodFor = 0;
    }
  }
}

/** Rolling frame-time statistics (benchmark + FPS display). */
export class FrameStats {
  private samples: number[] = [];
  add(ms: number): void {
    this.samples.push(ms);
    if (this.samples.length > 3600) this.samples.shift();
  }
  reset(): void {
    this.samples = [];
  }
  summary(): { frames: number; avgMs: number; p95Ms: number; p99Ms: number; fps: number } {
    const s = [...this.samples].sort((a, b) => a - b);
    const n = s.length || 1;
    const avg = s.reduce((a, b) => a + b, 0) / n;
    const pct = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
    return {
      frames: s.length,
      avgMs: avg,
      p95Ms: pct(0.95),
      p99Ms: pct(0.99),
      fps: avg > 0 ? 1000 / avg : 0,
    };
  }
}
