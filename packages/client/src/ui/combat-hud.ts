// Combat HUD: health, kit status, threat arcs, own-Boomerang marker, Wind-up ring, hit
// markers, damage direction, kill feed, multi-kill banners, death screen.
import * as THREE from 'three';
import type { Vec3, KillKind } from '@space-yz/shared';
import { h } from './menus';

export interface Threat {
  dirCam: THREE.Vector3; // direction to threat in camera space
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
  grenades: number;
  dashReady01: number;
  steer01: number;
  windup01: number;
  windupFull: boolean;
  windupHold01: number;
  alive: boolean;
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
  world: '☠',
};

const TEAM_CSS = ['#19e3ff', '#ff8a1f'];

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
  private damageDirs: { angle: number; life: number }[] = [];
  private bannerTimer = 0;
  private centerTimer = 0;
  showStats = false;

  constructor(parent: HTMLElement) {
    this.root = h('div', { class: 'combat-hud' });
    parent.append(this.root);
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
    );
    this.resize();
  }

  resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  hitMarker(head: boolean, kill: boolean): void {
    this.hitmark.className = `hitmark show ${head ? 'head' : ''} ${kill ? 'kill' : ''}`;
    void this.hitmark.offsetWidth; // restart animation
    this.hitmark.className = `hitmark show anim ${head ? 'head' : ''} ${kill ? 'kill' : ''}`;
  }

  damageFrom(angleRad: number): void {
    this.damageDirs.push({ angle: angleRad, life: 1.2 });
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
      h('span', { style: `color:${TEAM_CSS[killerTeam ?? 0]}` }, killer),
      h('span', { class: 'kill-icon', title: kind }, ` ${KIND_ICON[kind]} `),
      h('span', { style: `color:${TEAM_CSS[victimTeam ?? 1]}` }, victim),
      teamKill ? h('span', { class: 'tk' }, ' TEAM KILL') : null,
    );
    this.feed.prepend(row);
    while (this.feed.children.length > 6) this.feed.lastChild?.remove();
    window.setTimeout(() => row.classList.add('fade'), 6000);
    window.setTimeout(() => row.remove(), 7000);
  }

  setDeath(text: string | null): void {
    this.death.classList.toggle('hidden', text === null);
    if (text !== null) this.death.textContent = text;
  }

  setStats(text: string | null): void {
    this.statsEl.classList.toggle('hidden', !text || !this.showStats);
    if (text) this.statsEl.textContent = text;
  }

  update(
    dt: number,
    kit: KitStatus,
    threats: Threat[],
    ownMarker: { x: number; y: number; onScreen: boolean; dist: number; angle: number } | null,
  ): void {
    // health
    const f = Math.max(0, kit.hp / kit.maxHp);
    this.hpFill.style.width = `${f * 100}%`;
    this.hpFill.classList.toggle('low', f <= 0.5);
    this.hpText.textContent = `${Math.ceil(kit.hp)}`;
    // kit
    const bText =
      kit.boomerang === 'held'
        ? 'BOOMERANG READY'
        : kit.boomerang === 'dropped'
          ? `DROPPED ${Math.round(kit.boomerangDist)} m · R RECALL`
          : kit.boomerang === 'recalling'
            ? 'RECALLING'
            : `FLYING${kit.steer01 > 0 ? ' · RMB STEER' : ''} · R RECALL`;
    const pips =
      '▮'.repeat(kit.laserCharges) + '▯'.repeat(Math.max(0, kit.laserMax - kit.laserCharges));
    this.kit.replaceChildren(
      h('div', { class: `kit-row boomerang ${kit.boomerang}` }, bText),
      h('div', { class: 'kit-row' }, `LASER ${pips}`),
      h(
        'div',
        { class: 'kit-row' },
        `GRENADE ${kit.grenades > 0 ? '◆' : '◇'}   DASH ${kit.dashReady01 >= 1 ? 'READY' : Math.round(kit.dashReady01 * 100) + '%'}`,
      ),
    );
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
      const ang = Math.atan2(t.dirCam.x, t.dirCam.y); // 0 = up on screen
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
      ctx.strokeStyle = '#ff3b4f';
      ctx.globalAlpha = Math.min(1, d.life);
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        Math.min(w, hgt) * 0.3,
        d.angle - Math.PI / 2 - 0.3,
        d.angle - Math.PI / 2 + 0.3,
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

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
        const r = Math.min(w, hgt) * 0.42;
        const x = cx + Math.sin(ownMarker.angle) * r;
        const y = cy - Math.cos(ownMarker.angle) * r;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ownMarker.angle);
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(8, 6);
        ctx.lineTo(-8, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }

  dispose(): void {
    this.root.remove();
  }
}

/** Screen-space info for a world point (edge-arrow angle: 0 = up, clockwise). */
export const projectMarker = (
  p: Vec3,
  camera: THREE.PerspectiveCamera,
  w: number,
  hgt: number,
): { x: number; y: number; onScreen: boolean; dist: number; angle: number } => {
  const v = new THREE.Vector3(p.x, p.y, p.z);
  const dist = v.distanceTo(camera.position);
  const local = v.clone().applyMatrix4(camera.matrixWorldInverse);
  const ndc = v.clone().project(camera);
  const onScreen = local.z < 0 && Math.abs(ndc.x) < 0.95 && Math.abs(ndc.y) < 0.95;
  return {
    x: ((ndc.x + 1) / 2) * w,
    y: ((1 - ndc.y) / 2) * hgt,
    onScreen,
    dist,
    angle: Math.atan2(local.x, local.y),
  };
};
