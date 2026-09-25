// In-game HUD (DOM overlay). Text updates are throttled; the speed graph is a tiny canvas.
import type { PlayerState, MovementConfig, Vec3 } from '@space-yz/shared';
import { MOVE_NAMES, len, projectOnPlane, lenSq, normalize, dot, cross } from '@space-yz/shared';
import type { Settings } from '../settings';

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
};

/**
 * CSS rotation (radians, clockwise) for the gravity arrow, which points down when unrotated:
 * it then points the way gravity pulls on screen. Rotating "down" clockwise by θ gives
 * (−sin θ, cos θ) in screen pixels (y down).
 */
export const gravityArrowAngle = (gravity: Vec3, camForward: Vec3, camUp: Vec3): number => {
  const gdir = normalize(gravity);
  const right = normalize(cross(camForward, camUp));
  const sx = dot(gdir, right); // screen right
  const sy = dot(gdir, camUp); // screen up
  return Math.atan2(-sx, -sy);
};

export class Hud {
  root: HTMLDivElement;
  private crosshair: HTMLDivElement;
  private speedEl: HTMLDivElement;
  private speedSub: HTMLDivElement;
  private stateEl: HTMLDivElement;
  private gravEl: HTMLDivElement;
  private gravArrow: HTMLDivElement;
  private countersEl: HTMLDivElement;
  private fpsEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private graph: HTMLCanvasElement;
  private graphCtx: CanvasRenderingContext2D | null;
  private history: number[] = [];
  private maxSpeed = 0;
  private lastText = 0;
  private frames = 0;
  private fpsTime = 0;
  fps = 0;
  /** extra line under the FPS (net stats) */
  netText = '';
  /** current dynamic render scale (shown next to the FPS when below 100%) */
  renderScale = 1;

  constructor(
    parent: HTMLElement,
    private settings: Settings,
  ) {
    this.root = el('div', 'hud', parent);
    this.crosshair = el('div', 'crosshair', this.root);
    const bl = el('div', 'hud-bl', this.root);
    this.speedEl = el('div', 'hud-speed', bl);
    this.speedSub = el('div', 'hud-speed-sub', bl);
    this.graph = el('canvas', 'hud-graph', bl);
    this.graph.width = 220;
    this.graph.height = 48;
    this.graphCtx = this.graph.getContext('2d');
    this.stateEl = el('div', 'hud-state', bl);
    const tl = el('div', 'hud-tl', this.root);
    const g = el('div', 'hud-grav', tl);
    this.gravArrow = el('div', 'hud-grav-arrow', g);
    this.gravEl = el('div', 'hud-grav-text', g);
    this.countersEl = el('div', 'hud-counters', tl);
    this.fpsEl = el('div', 'hud-fps', this.root);
    this.hintEl = el('div', 'hud-hint', this.root);
    this.hintEl.textContent = '` tuning panel · Esc menu';
    this.applyCrosshair();
  }

  applyCrosshair(): void {
    const c = this.settings.crosshair;
    const s = this.crosshair.style;
    s.setProperty('--ch-color', c.color);
    s.setProperty('--ch-size', `${c.size}px`);
    s.setProperty('--ch-gap', `${c.gap}px`);
    s.setProperty('--ch-thick', `${c.thickness}px`);
    this.crosshair.dataset.style = c.style;
    this.crosshair.classList.toggle('outlined', c.outline);
  }

  setHint(text: string, seconds = 12): void {
    this.hintEl.textContent = text;
    this.hintEl.classList.remove('faded');
    window.setTimeout(() => this.hintEl.classList.add('faded'), seconds * 1000);
  }

  /** Called every rendered frame. */
  update(
    p: PlayerState | undefined,
    m: MovementConfig,
    frameDt: number,
    camForward: Vec3,
    camUp: Vec3,
  ): void {
    this.frames++;
    this.fpsTime += frameDt;
    if (this.fpsTime >= 0.5) {
      this.fps = this.frames / this.fpsTime;
      this.frames = 0;
      this.fpsTime = 0;
    }
    if (!p) return;
    const planar = len(projectOnPlane(p.vel, p.up));
    this.maxSpeed = Math.max(this.maxSpeed, planar);
    this.history.push(planar);
    if (this.history.length > 300) this.history.shift();

    const now = performance.now();
    if (now - this.lastText > 66) {
      this.lastText = now;
      this.speedEl.textContent = `${planar.toFixed(1)}`;
      this.speedSub.textContent = `m/s · best ${this.maxSpeed.toFixed(1)}`;
      this.stateEl.textContent =
        (MOVE_NAMES[p.move] ?? '?').toUpperCase() + (p.crouched ? ' · CROUCH' : '');
      const zeroG = lenSq(p.gravity) < 1e-6;
      this.gravEl.textContent = p.mag
        ? 'MAG-BOOTS'
        : zeroG
          ? 'ZERO-G'
          : Math.abs(p.gravity.y) > 0.9 * len(p.gravity) && p.gravity.y < 0
            ? 'NORMAL GRAVITY'
            : 'SHIFTED GRAVITY';
      // arrow: gravity direction projected into the screen (right/up)
      if (!zeroG) {
        const ang = gravityArrowAngle(p.gravity, camForward, camUp);
        this.gravArrow.style.transform = `rotate(${ang}rad)`;
        this.gravArrow.style.opacity = '1';
      } else this.gravArrow.style.opacity = '0.2';
      const pips = (n: number, max: number) =>
        '●'.repeat(Math.max(0, n)) + '○'.repeat(Math.max(0, max - n));
      const lines = [
        `WALL-JUMPS ${pips(p.wallJumpsLeft, m.wallJumpsPerAir)}`,
        `TAP-STRAFES ${pips(p.tapStrafesLeft, m.tapStrafesPerAir)}`,
        `THRUSTERS ${pips(p.thrusterCharges, m.thrusterCharges)}`,
        `DASH ${p.dashCd > 0 ? (p.dashCd / 60).toFixed(1) + 's' : 'READY'}`,
      ];
      this.countersEl.textContent = lines.join('\n');
      this.fpsEl.textContent = this.settings.showFps
        ? `${Math.round(this.fps)} FPS${this.renderScale < 0.999 ? ` · ${Math.round(this.renderScale * 100)}%` : ''}${this.netText ? '\n' + this.netText : ''}`
        : this.netText;
      this.drawGraph(m);
    }
  }

  resetBest(): void {
    this.maxSpeed = 0;
    this.history = [];
  }

  private drawGraph(m: MovementConfig): void {
    const ctx = this.graphCtx;
    if (!ctx) return;
    const w = this.graph.width;
    const h = this.graph.height;
    ctx.clearRect(0, 0, w, h);
    const top = Math.max(m.slideMaxSpeed, 20);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    const sprintY = h - (m.sprintSpeed / top) * h;
    ctx.moveTo(0, sprintY);
    ctx.lineTo(w, sprintY);
    ctx.stroke();
    ctx.strokeStyle = '#19e3ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    this.history.forEach((s, i) => {
      const x = (i / 300) * w;
      const y = h - Math.min(1, s / top) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
  }
}
