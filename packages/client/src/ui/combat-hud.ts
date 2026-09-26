// Combat HUD: health, kit status, threat arcs, own-Boomerang marker, Wind-up ring, hit
// markers, damage direction, kill feed, multi-kill banners, death screen.
import type { Vec3, KillKind } from '@space-yz/shared';
import { h } from './menus';
import { edgePoint, type ScreenMarker } from './markers';
import { effects } from '../render/effects';
import { storage } from '../settings';

const TIP_KEY = 'lethalrecoil.tiltTips';
/** the flick tip shows on this many aims, ever (per browser) */
const FLICK_TIPS = 6;

export interface Threat {
  angle: number; // screen direction to the threat (0 = up, clockwise; see screenAngle)
  intensity: number; // 0..1
  color: string;
}

export interface KitStatus {
  hp: number;
  maxHp: number;
  boomerang: 'held' | 'flying' | 'dropped' | 'recalling' | 'steer';
  boomerangDist: number;
  laserCharges: number;
  laserMax: number;
  laserRecharge01: number;
  laserReserve: number;
  /** reload progress 0..1 (0 = not reloading) */
  laserReload01: number;
  /** what LMB does right now */
  weapon: 'boomerang' | 'laser';
  grenades: number;
  dashReady01: number;
  jetReady01: number;
  steer01: number;
  windup01: number;
  windupFull: boolean;
  windupHold01: number;
  alive: boolean;
  /** the throw you're aiming would hit an enemy */
  onTarget: boolean;
  /** while aiming a Quick Throw: the curve a release right now would get (-1..1), else null */
  aimCurve: number | null;
  /** your round-start shield is still up */
  shield?: boolean;
  /** explosive throw: Quick Throws left until it's charged (0 = your next / current one explodes) */
  blastIn?: number;
  /** the Boomerang in the air right now is the explosive one */
  blastFlying?: boolean;
  /** CS mode: the guns instead of the Boomerang / Laser / Grenade rows */
  guns?: GunKit | null;
  /** the power-up you hold (1 Freeze, 2 Double boomerang) and its charges left */
  powerup?: { kind: 1 | 2; charges: number; max: number } | null;
  /** frozen by a Freeze hit: 0..1 of the freeze left (0 = not frozen) */
  stun01?: number;
}

/** HUD names and colours of the power-ups. */
export const POWERUP_HUD: Record<1 | 2, { name: string; icon: string; css: string }> = {
  1: { name: 'FREEZE', icon: '❄', css: '#8fe6ff' },
  2: { name: 'DOUBLE BOOMERANG', icon: '⟨⟩⟨⟩', css: '#ffc44d' },
};

/** CS mode kit: ammo per gun, which one is out, reload progress, current spread. */
export interface GunKit {
  active: 'ak' | 'deagle';
  ak: { mag: number; reserve: number };
  deagle: { mag: number; reserve: number };
  /** reload progress 0..1 (0 = not reloading) */
  reload01: number;
  /** radius (px) of the current random cone around the crosshair (CS-style dynamic crosshair) */
  spreadPx: number;
}

const KIND_ICON: Record<KillKind, string> = {
  boomerang: '⟨⟩',
  headshot: '◎',
  windup: '➶',
  recall: '↩',
  deflect: '⤺',
  slash: '⚔',
  laser: '⌁',
  grenade: '✺',
  blast: '✹',
  bomb: '💥',
  ak: 'AK',
  deagle: 'DE',
  world: '☠',
};

const TEAM_CSS = ['#19e3ff', '#ff8a1f'];
/** resolution of the pixelated hurt edge (scaled up with hard pixels) */
const HURT_W = 64;
const HURT_H = 36;
/** kill feed color when a player's team isn't known (never guess a wrong team color) */
const NEUTRAL_CSS = '#e8f1ff';
const teamCss = (team: 0 | 1 | undefined): string =>
  team === undefined ? NEUTRAL_CSS : TEAM_CSS[team];

export class CombatHud {
  root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private hpFill: HTMLDivElement;
  private hpText: HTMLDivElement;
  private kit: HTMLDivElement;
  private feed: HTMLDivElement;
  private banner: HTMLDivElement;
  private hitmark: HTMLDivElement;
  private death: HTMLDivElement;
  private centerMsg: HTMLDivElement;
  private statsEl: HTMLDivElement;
  private tip: HTMLDivElement;
  private spectate: HTMLDivElement;
  /** Freeze power-up: frosty screen edge + FROZEN while you're frozen */
  private frost: HTMLDivElement;
  private frostText: HTMLDivElement;
  /** how many more aims show the flick tip (counts down across sessions) */
  private tipsLeft = Number(storage.get(TIP_KEY) ?? FLICK_TIPS);
  /** where recent damage came from (world); drawn relative to the current view */
  private damageDirs: { src: Vec3; life: number }[] = [];
  /** pixelated red edges: grow as you lose health, flash when you're hit */
  private hurt: HTMLCanvasElement;
  private hurtCtx: CanvasRenderingContext2D | null;
  private hurtImg: ImageData | null = null;
  private hurtFlash = 0;
  private hurtTime = 0;
  private hurtNoise = new Float32Array(HURT_W * HURT_H);
  private bannerTimer = 0;
  private centerTimer = 0;
  showStats = false;

  constructor(parent: HTMLElement) {
    this.root = h('div', { class: 'combat-hud' });
    parent.append(this.root);
    this.hurt = h('canvas', { class: 'hurt-vignette' });
    this.hurt.width = HURT_W;
    this.hurt.height = HURT_H;
    this.hurtCtx = this.hurt.getContext('2d');
    this.hurtImg = this.hurtCtx?.createImageData(HURT_W, HURT_H) ?? null;
    // fixed per-block roughness, so the edge looks broken up rather than a smooth gradient
    let seed = 12345;
    for (let i = 0; i < this.hurtNoise.length; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      this.hurtNoise[i] = (seed >>> 8) / 16777216;
    }
    this.root.append(this.hurt);
    this.canvas = h('canvas', { class: 'hud-canvas' });
    this.ctx = this.canvas.getContext('2d');
    this.hpFill = h('div', { class: 'hp-fill' });
    this.hpText = h('div', { class: 'hp-text' });
    const hp = h('div', { class: 'hp' }, h('div', { class: 'hp-bar' }, this.hpFill), this.hpText);
    this.kit = h('div', { class: 'kit' });
    this.feed = h('div', { class: 'killfeed' });
    this.banner = h('div', { class: 'banner' });
    this.hitmark = h('div', { class: 'hitmark' });
    this.death = h('div', { class: 'death hidden' });
    this.centerMsg = h('div', { class: 'center-msg' });
    this.statsEl = h('div', { class: 'combat-stats hidden' });
    this.tip = h('div', { class: 'flick-tip' });
    this.spectate = h('div', { class: 'spectate-label hidden' });
    this.frost = h('div', {
      class: 'frost-edge',
      style:
        'position:absolute;inset:0;pointer-events:none;display:none;' +
        'background:radial-gradient(ellipse at center, rgba(170,230,255,0) 42%, ' +
        'rgba(185,238,255,0.45) 78%, rgba(235,252,255,0.9) 100%);' +
        'box-shadow:inset 0 0 90px 24px rgba(205,246,255,0.75);',
    });
    this.frostText = h(
      'div',
      {
        class: 'frost-text',
        style:
          'position:absolute;left:50%;top:36%;transform:translate(-50%,-50%);' +
          'pointer-events:none;display:none;font:800 34px Segoe UI,sans-serif;' +
          'letter-spacing:0.35em;color:#e6fbff;text-shadow:0 0 14px #5fd4ff,0 0 3px #ffffff;',
      },
      'FROZEN',
    );
    this.root.append(this.frost, this.frostText);
    this.root.append(
      this.canvas,
      hp,
      this.kit,
      this.feed,
      this.banner,
      this.hitmark,
      this.death,
      this.centerMsg,
      this.statsEl,
      this.tip,
      this.spectate,
    );
    this.resize();
  }

  resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /** Your hit broke someone's shield: a blue marker (no damage done). */
  shieldMarker(): void {
    this.hitmark.className = 'hitmark show shield';
    void this.hitmark.offsetWidth; // restart animation
    this.hitmark.className = 'hitmark show anim shield';
  }

  /** Your own shield just took a hit for you. */
  shieldBroken(): void {
    this.tip.textContent = 'SHIELD BROKEN · the next hit is for real';
    this.tip.classList.add('show');
    window.setTimeout(() => this.tip.classList.remove('show'), 1800);
  }

  /** `team`: you hit a teammate (friendly fire) — a warning, not a reward. */
  hitMarker(head: boolean, kill: boolean, team = false): void {
    const cls = team ? 'team' : `${head ? 'head' : ''} ${kill ? 'kill' : ''}`;
    this.hitmark.className = `hitmark show ${cls}`;
    void this.hitmark.offsetWidth; // restart animation
    this.hitmark.className = `hitmark show anim ${cls}`;
  }

  /** You started aiming a Quick Throw: the first few times, explain the in-flight flick. */
  aimStarted(): void {
    if (!(this.tipsLeft > 0)) return;
    this.tipsLeft--;
    storage.set(TIP_KEY, String(this.tipsLeft));
    this.tip.textContent = document.documentElement.classList.contains('mobile')
      ? 'After you throw, swipe the view sideways to tilt the Boomerang in flight · faster swipe = sharper curve'
      : 'After you throw, flick the mouse sideways to tilt the Boomerang in flight · faster flick = sharper curve · watch the meter';
    this.tip.classList.add('show');
    window.setTimeout(() => this.tip.classList.remove('show'), 4500);
  }

  /** You took damage from `src` (world position); the arc follows it as you turn. */
  damageFrom(src: Vec3): void {
    this.damageDirs.push({ src: { x: src.x, y: src.y, z: src.z }, life: 1.2 });
    this.hurtFlash = 1;
  }

  /** Draws the pixelated red edge: `missing` 0..1 of your health gone (0 = full health). */
  private drawHurt(dt: number, missing: number, alive: boolean): void {
    const g = this.hurtCtx;
    const img = this.hurtImg;
    if (!g || !img) return;
    this.hurtTime += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.2);
    // how far in from the edges the red reaches (0..1 of the half-screen)
    const reach = alive ? Math.min(0.85, missing * 0.55 + this.hurtFlash * 0.35) : 0;
    this.hurt.style.display = reach > 0.01 ? '' : 'none';
    if (reach <= 0.01) return;
    // low health pulses like a heartbeat
    const beat = missing > 0.6 ? 0.12 * Math.max(0, Math.sin(this.hurtTime * 7)) : 0;
    const d = img.data;
    for (let y = 0; y < HURT_H; y++) {
      const ey = Math.min(y + 0.5, HURT_H - y - 0.5) / (HURT_H / 2);
      for (let x = 0; x < HURT_W; x++) {
        const ex = Math.min(x + 0.5, HURT_W - x - 0.5) / (HURT_W / 2);
        const edge = 1 - Math.min(ex, ey); // 1 at the border, 0 in the middle
        const i = y * HURT_W + x;
        const v =
          (edge - (1 - reach - beat)) / Math.max(0.05, reach) + (this.hurtNoise[i] - 0.5) * 0.5;
        const a = Math.max(0, Math.min(1, v)) * (0.55 + 0.35 * this.hurtFlash);
        const o = i * 4;
        d[o] = 200 + this.hurtFlash * 55;
        d[o + 1] = 10;
        d[o + 2] = 24;
        d[o + 3] = a * 255;
      }
    }
    g.putImageData(img, 0, 0);
  }

  /** Forget short-lived indicators (respawn, new round). */
  clearTransient(): void {
    this.damageDirs = [];
    this.hurtFlash = 0;
  }

  showBanner(text: string, big = false): void {
    this.banner.textContent = text;
    this.banner.className = `banner show ${big ? 'big' : ''}`;
    this.bannerTimer = 1.8;
  }

  showCenter(text: string, seconds = 2.5, cls = ''): void {
    this.centerMsg.textContent = text;
    this.centerMsg.className = `center-msg show ${cls}`;
    this.centerTimer = seconds;
  }

  addKill(
    killer: string,
    killerTeam: 0 | 1 | undefined,
    victim: string,
    victimTeam: 0 | 1 | undefined,
    kind: KillKind,
    teamKill: boolean,
    mine: boolean,
  ): void {
    const row = h(
      'div',
      { class: `kill-row ${mine ? 'mine' : ''} ${teamKill ? 'teamkill' : ''}` },
      h('span', { style: `color:${teamCss(killerTeam)}` }, killer),
      h('span', { class: 'kill-icon', title: kind }, ` ${KIND_ICON[kind]} `),
      h('span', { style: `color:${teamCss(victimTeam)}` }, victim),
      teamKill ? h('span', { class: 'tk' }, ' TEAM KILL') : null,
    );
    this.feed.prepend(row);
    while (this.feed.children.length > effects.killFeedRows) this.feed.lastChild?.remove();
    window.setTimeout(() => row.classList.add('fade'), 6000);
    window.setTimeout(() => row.remove(), 7000);
  }

  setDeath(text: string | null): void {
    this.death.classList.toggle('hidden', text === null);
    if (text !== null) this.death.textContent = text;
  }

  /** "Spectating …" while you watch someone after dying (null hides it). */
  setSpectate(text: string | null): void {
    this.spectate.classList.toggle('hidden', text === null);
    if (text !== null && this.spectate.textContent !== text) this.spectate.textContent = text;
  }

  setStats(text: string | null): void {
    this.statsEl.classList.toggle('hidden', !text || !this.showStats);
    if (text) this.statsEl.textContent = text;
  }

  /** `angleOf`: screen direction (0 = up, clockwise) of a world point from the current view. */
  update(
    dt: number,
    kit: KitStatus,
    threats: Threat[],
    ownMarker: ScreenMarker | null,
    angleOf: (p: Vec3) => number,
  ): void {
    // health
    const f = Math.max(0, kit.hp / kit.maxHp);
    this.drawHurt(dt, 1 - f, kit.alive);
    this.hpFill.style.width = `${f * 100}%`;
    this.hpFill.classList.toggle('low', f <= 0.5);
    this.hpText.textContent = kit.shield ? `🛡 ${Math.ceil(kit.hp)}` : `${Math.ceil(kit.hp)}`;
    this.hpFill.parentElement?.classList.toggle('shielded', !!kit.shield);
    // kit
    const blast =
      kit.blastIn === undefined
        ? ''
        : kit.blastIn <= 0
          ? ' · ✹ EXPLOSIVE'
          : ` · ✹ in ${kit.blastIn}`;
    const bText =
      kit.boomerang === 'held'
        ? `BOOMERANG READY${blast}`
        : kit.blastFlying
          ? `✹ EXPLOSIVE FLYING · R RECALL`
          : kit.boomerang === 'dropped'
            ? `DROPPED ${Math.round(kit.boomerangDist)} m · R RECALL`
            : kit.boomerang === 'recalling'
              ? 'RECALLING'
              : `FLYING${kit.steer01 > 0 ? ' · RMB STEER' : ''} · R RECALL`;
    const ready = (v: number): string => (v >= 1 ? 'READY' : `${Math.round(v * 100)}%`);
    const laserText =
      kit.laserReload01 > 0
        ? `LASER · RELOADING ${Math.round(kit.laserReload01 * 100)}%`
        : `LASER ${kit.laserCharges} / ${kit.laserReserve}${kit.laserCharges === 0 && kit.laserReserve === 0 ? ' · EMPTY' : ''}`;
    const g = kit.guns;
    const gunRow = (key: 1 | 2, name: 'ak' | 'deagle', label: string) => {
      const a = g![name];
      const active = g!.active === name;
      const text =
        active && g!.reload01 > 0
          ? `${label} · RELOADING ${Math.round(g!.reload01 * 100)}%`
          : `${label} ${a.mag} / ${a.reserve}${a.mag === 0 && a.reserve === 0 ? ' · EMPTY' : ''}`;
      return h('div', { class: `kit-row ${active ? 'active' : ''}` }, `${key} ${text}`);
    };
    if (g)
      this.kit.replaceChildren(
        gunRow(1, 'ak', 'AK'),
        gunRow(2, 'deagle', 'DEAGLE'),
        h(
          'div',
          { class: 'kit-row' },
          `E KNIFE   DASH ${ready(kit.dashReady01)}   JET ${ready(kit.jetReady01)}`,
        ),
      );
    else
      this.kit.replaceChildren(
        h(
          'div',
          {
            class: `kit-row boomerang ${kit.boomerang} ${kit.weapon === 'boomerang' ? 'active' : ''}`,
          },
          `1 ${bText}`,
        ),
        h('div', { class: `kit-row ${kit.weapon === 'laser' ? 'active' : ''}` }, `2 ${laserText}`),
        h(
          'div',
          { class: 'kit-row' },
          `GRENADE ${kit.grenades > 0 ? '◆' : '◇'}   DASH ${ready(kit.dashReady01)}   JET ${ready(kit.jetReady01)}`,
        ),
        ...(kit.powerup ? [this.powerupRow(kit.powerup)] : []),
      );
    // frozen by a Freeze hit
    const frozen = kit.alive && (kit.stun01 ?? 0) > 0;
    this.frost.style.display = frozen ? '' : 'none';
    this.frostText.style.display = frozen ? '' : 'none';
    if (frozen) this.frost.style.opacity = String(0.45 + 0.55 * Math.min(1, kit.stun01! * 2.5));
    // timers
    if (this.bannerTimer > 0 && (this.bannerTimer -= dt) <= 0) this.banner.className = 'banner';
    if (this.centerTimer > 0 && (this.centerTimer -= dt) <= 0)
      this.centerMsg.className = 'center-msg';

    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.canvas.width;
    const hgt = this.canvas.height;
    ctx.clearRect(0, 0, w, hgt);
    const cx = w / 2;
    const cy = hgt / 2;

    // threat arcs around the crosshair (incl. behind you)
    for (const t of threats) {
      const ang = t.angle; // 0 = up on screen
      ctx.strokeStyle = t.color;
      ctx.globalAlpha = 0.25 + 0.75 * t.intensity;
      ctx.lineWidth = 3 + 5 * t.intensity;
      ctx.beginPath();
      const r = 70 - 18 * t.intensity;
      ctx.arc(cx, cy, r, ang - Math.PI / 2 - 0.35, ang - Math.PI / 2 + 0.35);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // damage direction
    this.damageDirs = this.damageDirs.filter((d) => (d.life -= dt) > 0);
    for (const d of this.damageDirs) {
      const angle = angleOf(d.src);
      ctx.strokeStyle = '#ff3b4f';
      ctx.globalAlpha = Math.min(1, d.life);
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(w, hgt) * 0.3, angle - Math.PI / 2 - 0.3, angle - Math.PI / 2 + 0.3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // CS mode: the crosshair opens up with the gun's current spread (moving, jumping, spraying)
    if (g && kit.alive) {
      const gap = Math.max(4, Math.min(Math.min(w, hgt) * 0.3, g.spreadPx));
      ctx.strokeStyle = 'rgba(120,255,160,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        ctx.moveTo(cx + dx * gap, cy + dy * gap);
        ctx.lineTo(cx + dx * (gap + 7), cy + dy * (gap + 7));
      }
      ctx.stroke();
    }

    // Wind-up progress ring
    if (kit.windup01 > 0) {
      ctx.strokeStyle = kit.windupFull ? '#ffffff' : 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * kit.windup01);
      ctx.stroke();
      if (kit.windupFull) {
        ctx.strokeStyle = '#ff5a6a';
        ctx.beginPath();
        ctx.arc(cx, cy, 32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - kit.windupHold01));
        ctx.stroke();
      }
    }
    // on target: red corner brackets around the crosshair
    if (kit.onTarget) {
      const r = 18;
      const k = 7;
      ctx.strokeStyle = '#ff2e44';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        ctx.moveTo(cx + sx * r, cy + sy * (r - k));
        ctx.lineTo(cx + sx * r, cy + sy * r);
        ctx.lineTo(cx + sx * (r - k), cy + sy * r);
      }
      ctx.stroke();
    }
    // tilt meter while your Quick Throw flies out: how hard it's curving right now
    if (kit.aimCurve !== null) {
      const mw = 70;
      const my = cy + 46;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(cx - mw - 2, my - 2, mw * 2 + 4, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(cx - 1, my - 4, 2, 12);
      const v = Math.max(-1, Math.min(1, kit.aimCurve));
      if (v !== 0) {
        ctx.fillStyle = Math.abs(v) >= 1 ? '#ffe45c' : '#19e3ff';
        ctx.fillRect(v > 0 ? cx : cx + v * mw, my, Math.abs(v) * mw, 4);
      }
      ctx.font = 'bold 10px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(232,241,255,0.7)';
      ctx.fillText(v < 0 ? '◀ TILT' : v > 0 ? 'TILT ▶' : 'flick the mouse to tilt', cx, my + 18);
    }
    // steering meter
    if (kit.steer01 > 0 && kit.boomerang !== 'held') {
      ctx.fillStyle = 'rgba(25,227,255,0.8)';
      ctx.fillRect(cx - 30, cy + 40, 60 * kit.steer01, 4);
    }

    // your Boomerang marker
    if (ownMarker && kit.boomerang !== 'held') {
      ctx.fillStyle = '#19e3ff';
      ctx.font = 'bold 12px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      if (ownMarker.onScreen) {
        ctx.save();
        ctx.translate(ownMarker.x, ownMarker.y);
        ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = '#19e3ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(-6, -6, 12, 12);
        ctx.restore();
        ctx.fillText(`${Math.round(ownMarker.dist)} m`, ownMarker.x, ownMarker.y + 22);
      } else {
        // inside the objective markers' ring, so the two never sit on top of each other
        const { x, y } = edgePoint(ownMarker.angle, w, hgt, { x: 150, y: 150 });
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ownMarker.angle);
        // notched dart: the tip reads clearly at any angle
        ctx.beginPath();
        ctx.moveTo(0, -11);
        ctx.lineTo(8, 7);
        ctx.lineTo(0, 2);
        ctx.lineTo(-8, 7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }

  /** The held power-up: icon, name and charges left as pips (● used up ○). */
  private powerupRow(pu: NonNullable<KitStatus['powerup']>): HTMLDivElement {
    const d = POWERUP_HUD[pu.kind];
    const pips = '●'.repeat(Math.max(0, pu.charges)) + '○'.repeat(Math.max(0, pu.max - pu.charges));
    return h(
      'div',
      { class: 'kit-row powerup', style: `color:${d.css};text-shadow:0 0 8px ${d.css}` },
      `${d.icon} ${d.name} ×${pu.charges}  ${pips}`,
    );
  }

  dispose(): void {
    this.root.remove();
  }
}
