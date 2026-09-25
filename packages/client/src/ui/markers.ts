// Screen-space markers for things in the world (name tags, objective markers): projection,
// edge clamping for off-screen targets, simple overlap avoidance, and a DOM layer that reuses
// its elements. Everything above the DOM layer is plain math so it can be unit tested.
import * as THREE from 'three';
import type { Vec3 } from '@space-yz/shared';
import { h } from './menus';

export interface ScreenMarker {
  /** projected position in CSS pixels (only meaningful when `onScreen`) */
  x: number;
  y: number;
  /** in front of the camera and inside the screen (minus a small border) */
  onScreen: boolean;
  /** metres from the camera */
  dist: number;
  /**
   * Direction from the screen centre toward the target, in screen terms: 0 = up, π/2 = right
   * (clockwise). Uses the camera's own axes, so it stays right when the view is rolled or
   * upside down (wall and ceiling gravity). See screenAngle for targets behind you.
   */
  angle: number;
}

const tmp = new THREE.Vector3();

/**
 * A target behind you counts as "look up" only this steeply above you (tan ≈ 58°: with the
 * 88° pitch limit and the vertical field of view, looking up brings it into view); anything
 * lower means "turn around".
 */
const BEHIND_LOOK_UP = 1.6;

/**
 * Screen angle (0 = up, clockwise) for a point in camera space (x right, y up, -z forward).
 * In front: exactly where the point projects. Behind: you can't pitch over the top, so the
 * arrow folds toward the bottom edge on the side you should turn to (straight behind =
 * bottom, no flicker); it is continuous with the front at your sides.
 */
export const screenAngle = (x: number, y: number, z: number): number =>
  Math.atan2(x, y - BEHIND_LOOK_UP * Math.max(0, z));

/**
 * Project a world point for a marker. Needs the camera's world matrices of this frame
 * (GameClient updates them before features run).
 */
export const projectMarker = (
  p: Vec3,
  camera: THREE.PerspectiveCamera,
  w: number,
  hgt: number,
  edge = 0.95,
): ScreenMarker => {
  const local = tmp.set(p.x, p.y, p.z).applyMatrix4(camera.matrixWorldInverse);
  const lx = local.x;
  const ly = local.y;
  const lz = local.z;
  const dist = local.length();
  const angle = screenAngle(lx, ly, lz);
  if (lz >= 0) return { x: w / 2, y: hgt / 2, onScreen: false, dist, angle };
  const ndc = local.applyMatrix4(camera.projectionMatrix);
  return {
    x: ((ndc.x + 1) / 2) * w,
    y: ((1 - ndc.y) / 2) * hgt,
    onScreen: Math.abs(ndc.x) <= edge && Math.abs(ndc.y) <= edge,
    dist,
    angle,
  };
};

/** Edge margins for clamped markers (px): keeps them clear of the score bar and HUD corners. */
export const EDGE_INSET = { x: 70, y: 96 };

/**
 * Where an off-screen marker sits: on an ellipse just inside the screen edges, in the target's
 * direction (`angle` as in ScreenMarker).
 */
export const edgePoint = (
  angle: number,
  w: number,
  hgt: number,
  inset: { x: number; y: number } = EDGE_INSET,
): { x: number; y: number } => {
  const rx = Math.max(8, w / 2 - inset.x);
  const ry = Math.max(8, hgt / 2 - inset.y);
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const k = 1 / Math.hypot(dx / rx, dy / ry);
  return { x: w / 2 + dx * k, y: hgt / 2 + dy * k };
};

// ------------------------------------------------------------------------------------------
// Layout

export interface MarkerBox {
  key: string;
  /** anchor in px: bottom-centre of the box ('bottom') or its centre ('center') */
  x: number;
  y: number;
  w: number;
  h: number;
  align: 'bottom' | 'center';
  /** higher keeps its place; lower ones move up out of the way */
  priority: number;
}

/**
 * Rough box size (px) of a marker label, so layout needs no DOM measuring. Line height is
 * font + 4 px (as in the .wm styles); `spacingEm` = CSS letter-spacing, `padX`/`padY` =
 * everything else around the text (padding, the edge arrow).
 */
export const estimateBox = (
  text: string,
  fontPx: number,
  o: { spacingEm?: number; padX?: number; padY?: number } = {},
): { w: number; h: number } => ({
  w: [...text].length * fontPx * (0.6 + (o.spacingEm ?? 0)) + 6 + (o.padX ?? 0),
  h: fontPx + 4 + (o.padY ?? 0),
});

/**
 * Keep markers from covering each other: in priority order, a marker that overlaps one
 * already placed moves straight up just above it (at most `maxLift` px). Returns the new
 * anchor y per key.
 */
export const layoutMarkers = (
  boxes: readonly MarkerBox[],
  gap = 2,
  maxLift = 120,
): Map<string, number> => {
  const order = [...boxes].sort((a, b) => b.priority - a.priority);
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const out = new Map<string, number>();
  for (const b of order) {
    const x0 = b.x - b.w / 2;
    const x1 = b.x + b.w / 2;
    const top0 = b.align === 'bottom' ? b.y - b.h : b.y - b.h / 2;
    let top = top0;
    for (let iter = 0; iter < 12; iter++) {
      const hit = placed.find(
        (r) => x0 < r.x1 && x1 > r.x0 && top < r.y1 + gap && top + b.h > r.y0 - gap,
      );
      if (!hit) break;
      const next = hit.y0 - gap - b.h;
      if (top0 - next > maxLift) break;
      top = next;
    }
    placed.push({ x0, x1, y0: top, y1: top + b.h });
    out.set(b.key, b.y + (top - top0));
  }
  return out;
};

// ------------------------------------------------------------------------------------------
// DOM

export interface MarkerView {
  key: string;
  /** class names added to `wm` (e.g. 'wm-ally wm-occluded') */
  cls: string;
  text: string;
  color: string;
  x: number;
  y: number;
  align: 'bottom' | 'center';
  opacity: number;
  /** edge-clamped markers show an arrow pointing at the target (radians, 0 = up) */
  arrow: number | null;
}

interface El {
  el: HTMLDivElement;
  arrow: HTMLSpanElement;
  label: HTMLSpanElement;
  cls: string;
  text: string;
  color: string;
}

/** One absolutely positioned element per marker, reused frame to frame by key. */
export class MarkerLayer {
  root: HTMLDivElement;
  private els = new Map<string, El>();

  constructor() {
    this.root = h('div', { class: 'world-markers' });
  }

  render(views: readonly MarkerView[]): void {
    const seen = new Set<string>();
    for (const v of views) {
      seen.add(v.key);
      let e = this.els.get(v.key);
      if (!e) {
        const arrow = h('span', { class: 'wm-arrow' });
        const label = h('span', { class: 'wm-text' });
        const el = h('div', { class: 'wm' }, arrow, label);
        el.dataset.key = v.key;
        this.root.append(el);
        e = { el, arrow, label, cls: '', text: '', color: '' };
        this.els.set(v.key, e);
      }
      const cls = `wm ${v.cls}${v.arrow !== null ? ' wm-clamped' : ''}`;
      if (e.cls !== cls) e.el.className = e.cls = cls;
      if (e.text !== v.text) e.label.textContent = e.text = v.text;
      if (e.color !== v.color) e.el.style.color = e.color = v.color;
      const ty = v.align === 'center' ? '-50%' : '-100%';
      e.el.style.transform = `translate(${v.x.toFixed(1)}px, ${v.y.toFixed(1)}px) translate(-50%, ${ty})`;
      e.el.style.opacity = v.opacity.toFixed(2);
      if (v.arrow !== null) e.arrow.style.transform = `rotate(${v.arrow.toFixed(3)}rad)`;
    }
    for (const [key, e] of this.els)
      if (!seen.has(key)) {
        e.el.remove();
        this.els.delete(key);
      }
  }

  dispose(): void {
    this.root.remove();
    this.els.clear();
  }
}
