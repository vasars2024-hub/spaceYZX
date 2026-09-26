// Everything drawn over the 3D view at a place in the world, in one screen-space layer:
//   - teammate name tags (every mode with teammates): the same readable size at any distance
//     (a little fainter far away), bright when you can see them, dim when a wall is in the
//     way, ◆ = carries the Controller; dead teammates show nothing; never clamped to the edges
//   - enemies: nothing through walls. While the rules reveal them (carrier pulses, last
//     seconds, sudden death) only the ◇/◆ icon; an enemy carrier you can see gets its ◆;
//     their name only while your crosshair is on them and you can actually see them
//   - match objectives: Tower ATTACK/DEFEND (flips with the half-time side swap) and dropped
//     Controllers with their return countdown; the important ones clamp to the screen edge
// Markers never cover each other: lower-priority ones move up out of the way. Everything
// steps aside while the scoreboard / results cover the screen.
import * as THREE from 'three';
import type { MovementConfig, Vec3 } from '@space-yz/shared';
import { add, madd, v3, len, sub, lineOfSight, closestSegSeg } from '@space-yz/shared';
import type { ClientFeature, GameClient } from './client';
import type { MatchInfo, RenderPlayer } from './session';
import {
  MarkerLayer,
  edgePoint,
  estimateBox,
  layoutMarkers,
  projectMarker,
  type MarkerBox,
  type MarkerView,
} from '../ui/markers';
import {
  TEAM_COLOR,
  towerRole,
  controllerAtHome,
  controllerReturnLeft,
  controllerText,
} from './objectives';

export interface TagPlayer {
  team: 0 | 1;
  alive: boolean;
  carrier: boolean;
  revealed: boolean;
  name: string;
}

/** 'icon': only ◇/◆ (a revealed enemy, or an enemy carrier in sight) — never a name. */
export type TagKind = 'ally' | 'icon' | 'aim';

/**
 * What to show over another player, if anything. `aimedVisible`: your crosshair is on them
 * and nothing blocks the line of sight. `inSight`: nothing blocks the line of sight.
 */
export const playerTag = (
  p: TagPlayer,
  myTeam: 0 | 1,
  aimedVisible: boolean,
  inSight = false,
): { kind: TagKind; text: string } | null => {
  if (!p.alive) return null;
  const carrier = p.carrier ? '◆ ' : '';
  if (p.team === myTeam) return { kind: 'ally', text: `${carrier}${p.name}` };
  if (aimedVisible) return { kind: 'aim', text: `${carrier}${p.name}` };
  if (p.revealed) return { kind: 'icon', text: p.carrier ? '◆' : '◇' };
  // "always clear who has it": the enemy carrier is marked while you can see them
  if (p.carrier && inSight) return { kind: 'icon', text: '◆' };
  return null;
};

/**
 * How far you can really make out a player through the map's fog (it's less than 60 %
 * fogged there). Past that, a clear line of sight doesn't mean you can see them.
 */
export const fogSightRange = (fog: { near: number; far: number } | null): number =>
  fog ? fog.near + (fog.far - fog.near) * 0.6 : Infinity;

/**
 * Teammate name tag opacity (the size never changes): a little fainter far away, much
 * dimmer behind walls.
 */
export const tagOpacity = (dist: number, inView: boolean): number => {
  const far = Math.min(1, Math.max(0, (dist - 10) / 60));
  return inView ? 1 - 0.25 * far : 0.45 - 0.1 * far;
};

/** Body capsule of a rendered player (core segment + radius) from the movement config. */
export const bodyOf = (
  p: Pick<RenderPlayer, 'pos' | 'up' | 'crouched'>,
  m: Pick<MovementConfig, 'standHeight' | 'crouchHeight' | 'radius'>,
): { bottom: Vec3; top: Vec3; head: Vec3; height: number; radius: number } => {
  const height = p.crouched ? m.crouchHeight : m.standHeight;
  const core = Math.max(0, height / 2 - m.radius);
  return {
    bottom: madd(p.pos, p.up, -core),
    top: madd(p.pos, p.up, core),
    head: madd(p.pos, p.up, height / 2 - 0.2),
    height,
    radius: m.radius,
  };
};

/**
 * Does a view ray pass through a body capsule? Returns the distance along the ray where it
 * comes closest to the body's axis (to pick the nearest of several), or null for a miss.
 */
export const rayHitsBody = (
  eye: Vec3,
  dir: Vec3,
  bottom: Vec3,
  top: Vec3,
  radius: number,
  maxDist: number,
): number | null => {
  const c = closestSegSeg(eye, madd(eye, dir, maxDist), bottom, top);
  return c.distSq <= radius * radius ? c.s * maxDist : null;
};

const AIM_RANGE = 70;
const AIM_LINGER = 0.35;
const SIGHT_RECHECK = 0.1;
/** font size (px) and CSS letter-spacing (em) per marker kind, as in the .wm styles */
const TEXT = {
  ally: { font: 13, spacingEm: 0.02 },
  icon: { font: 26, spacingEm: 0.02 },
  aim: { font: 12, spacingEm: 0.02 },
  objective: { font: 12, spacingEm: 0.08 },
} as const;
/** clamped objective markers: the edge arrow (10 px + 6 px gap) and the padding (6 px, 1 px) */
const CLAMPED_PAD = { padX: 16 + 12, padY: 2 };

interface Item {
  box: MarkerBox;
  view: MarkerView;
}

export class WorldMarkers implements ClientFeature {
  private layer!: MarkerLayer;
  /** player id -> cached line-of-sight result (teammates, enemy carriers) */
  private sight = new Map<number, { next: number; inView: boolean }>();
  private aimed: { id: number; until: number } | null = null;
  private time = 0;
  private dir = new THREE.Vector3();

  init(c: GameClient): void {
    this.layer = new MarkerLayer();
    // under every other HUD element (banners, scoreboard, menus)
    c.deps.ui.prepend(this.layer.root);
  }

  frame(c: GameClient, dt: number): void {
    this.time += dt;
    const s = c.session;
    const me = s.local();
    // no idea which team you're on yet (online, before your first snapshot): tagging anyone
    // as a teammate could show an enemy through walls
    if (!me || c.panelOpen) {
      this.layer.render([]);
      this.aimed = null;
      return;
    }
    const myTeam = me.team;
    const w = c.deps.renderer.domElement.clientWidth;
    const hgt = c.deps.renderer.domElement.clientHeight;
    const items: Item[] = [];
    const m = s.match?.() ?? null;
    if (m) this.objectives(c, m, myTeam, w, hgt, items);
    this.playerTags(c, myTeam, w, hgt, items);

    const ys = layoutMarkers(items.map((i) => i.box));
    const views: MarkerView[] = [];
    for (const it of items) {
      const v = it.view;
      v.y = ys.get(v.key) ?? v.y;
      // a tag right on the crosshair turns see-through so it never hides what you aim at
      const b = it.box;
      const top = v.align === 'bottom' ? v.y - b.h : v.y - b.h / 2;
      const onCross =
        Math.abs(v.x - w / 2) < b.w / 2 + 6 && hgt / 2 > top - 6 && hgt / 2 < top + b.h + 6;
      if (onCross && v.arrow === null) v.opacity *= 0.5;
      views.push(v);
    }
    this.layer.render(views);
  }

  private objectives(
    c: GameClient,
    m: MatchInfo,
    myTeam: 0 | 1,
    w: number,
    hgt: number,
    out: Item[],
  ): void {
    if (m.phase !== 'live' && m.phase !== 'spawnLock') return;
    const s = c.session;
    const def = s.level.def;
    // power-ups in the middle: marked for everyone while they're up (held on the screen edge
    // while you hold none, so you know there's one to get)
    const holding = (s.local()?.powerup ?? 0) !== 0;
    for (const u of s.powerups?.() ?? []) {
      this.place(c, w, hgt, out, {
        key: `pu-${u.id}`,
        cls: 'wm-objective wm-powerup',
        text: u.kind === 1 ? 'FREEZE' : 'DOUBLE',
        pin: ' ▼',
        color: u.kind === 1 ? '#8fe6ff' : '#ffc44d',
        at: add(u.pos, v3(0, 0.9, 0)),
        priority: 75,
        clamp: !holding && !!s.local()?.alive,
      });
    }
    // Elimination: nothing to point at but the power-ups (no Towers, Controllers or bomb)
    if (m.objective === 'elim') return;
    if (m.objective === 'bomb') {
      const iAttack = myTeam === m.attackers;
      const b = m.bomb;
      const carrying = b?.carrier === s.localId && !!s.local()?.alive;
      for (const site of def.bombSites ?? []) {
        const at = v3((site.min.x + site.max.x) / 2, site.min.y + 3, (site.min.z + site.max.z) / 2);
        const here = b?.planted?.site === site.name;
        this.place(c, w, hgt, out, {
          key: `site-${site.name}`,
          cls: `wm-objective wm-site ${iAttack ? 'wm-attack' : 'wm-defend'}`,
          text: here ? `${site.name} · BOMB` : site.name,
          pin: ' ▼',
          color: here ? '#ff5a6a' : '#e8f1ff',
          at,
          priority: 85,
          clamp: carrying || here,
        });
      }
      // the bomb: attackers always know where it is; defenders once it's planted
      if (b && b.carrier === null && (iAttack || b.planted)) {
        const now = s.tickNow?.() ?? s.world().tick;
        const left = b.planted ? Math.max(0, Math.ceil((b.planted.explodeAt - now) / 60)) : 0;
        this.place(c, w, hgt, out, {
          key: 'bomb',
          cls: 'wm-objective wm-bomb',
          text: b.planted ? `BOMB ${left}s` : 'BOMB · pick it up',
          pin: ' ▼',
          color: '#ff5a6a',
          at: add(b.pos, v3(0, 0.4, 0)),
          priority: 100,
          clamp: true,
        });
      }
      return;
    }
    // sky duel overtime: the Tower is off and far below, nothing to point at
    if (m.phase === 'live' && m.overtime?.kind === 'sky') return;
    const tick = s.tickNow?.() ?? s.world().tick;
    const carrying = m.carriers.includes(s.localId) && !!s.local()?.alive;
    for (const t of def.towers) {
      const { owner, attack } = towerRole(t.team, m.sideSwapped, myTeam);
      this.place(c, w, hgt, out, {
        key: `tower-${t.team}`,
        cls: `wm-objective wm-tower ${attack ? 'wm-attack' : 'wm-defend'}`,
        text: attack ? 'ATTACK' : 'DEFEND',
        pin: ' ▼',
        color: TEAM_COLOR[owner],
        at: add(t.pos, v3(0, t.height + 1.5, 0)),
        priority: 80,
        // the carrier always sees where to go
        clamp: attack && carrying,
      });
    }
    // Controller carriers: always marked for both teams (the rules reveal them through walls),
    // held on the screen edge when out of view
    if (m.phase === 'live') {
      const names = s.names();
      for (const p of s.others()) {
        if (!p.alive || !p.carrier) continue;
        const mate = p.team === myTeam;
        const name = names[p.id] ?? `Player ${p.id}`;
        const body = bodyOf(p, s.config.movement);
        this.place(c, w, hgt, out, {
          key: `carrier-${p.id}`,
          cls: `wm-objective wm-carrier-mark ${mate ? 'wm-defend' : 'wm-attack'}`,
          text: mate ? `◆ ${name} · YOUR CARRIER` : `◆ ${name} · ENEMY CARRIER`,
          pin: ' ▼',
          color: TEAM_COLOR[p.team],
          at: madd(p.pos, p.up, body.height / 2 + 0.5),
          priority: mate ? 95 : 85,
          clamp: true,
        });
      }
    }
    for (const ctl of m.controllers) {
      if (!ctl.droppedAt) continue;
      const mine = ctl.team === myTeam;
      const home = controllerAtHome(def, ctl.team, m.sideSwapped, ctl.droppedAt);
      const left = controllerReturnLeft(ctl.returnAt, tick, s.config.rules.controllerReturnSec);
      this.place(c, w, hgt, out, {
        key: `ctl-${ctl.team}`,
        cls: 'wm-objective wm-ctl',
        text: controllerText(mine, home, left),
        pin: '',
        color: TEAM_COLOR[ctl.team],
        at: add(ctl.droppedAt, v3(0, 1, 0)),
        priority: mine ? 100 : 90,
        clamp: mine,
      });
    }
  }

  private place(
    c: GameClient,
    w: number,
    hgt: number,
    out: Item[],
    o: {
      key: string;
      cls: string;
      text: string;
      /** suffix while on screen (▼ points at the spot) */
      pin: string;
      color: string;
      at: Vec3;
      priority: number;
      clamp: boolean;
    },
  ): void {
    const pm = projectMarker(o.at, c.camera, w, hgt);
    if (!pm.onScreen && !o.clamp) return;
    const onScreen = pm.onScreen;
    const text = onScreen ? o.text + o.pin : o.text;
    const pos = onScreen ? pm : edgePoint(pm.angle, w, hgt);
    const size = estimateBox(text, TEXT.objective.font, {
      spacingEm: TEXT.objective.spacingEm,
      ...(onScreen ? {} : CLAMPED_PAD),
    });
    const align = onScreen ? 'bottom' : 'center';
    out.push({
      box: { key: o.key, x: pos.x, y: pos.y, w: size.w, h: size.h, align, priority: o.priority },
      view: {
        key: o.key,
        cls: o.cls,
        text,
        color: o.color,
        x: pos.x,
        y: pos.y,
        align,
        opacity: 1,
        arrow: onScreen ? null : pm.angle,
      },
    });
  }

  private playerTags(c: GameClient, myTeam: 0 | 1, w: number, hgt: number, out: Item[]): void {
    const s = c.session;
    const mv = s.config.movement;
    const cam = c.camera;
    const eye = v3(cam.position.x, cam.position.y, cam.position.z);
    const fwd = cam.getWorldDirection(this.dir);
    const dir = v3(fwd.x, fwd.y, fwd.z);
    const others = s.others();
    const visible = (p: RenderPlayer): boolean => {
      const b = bodyOf(p, mv);
      return lineOfSight(s.level, eye, b.head) || lineOfSight(s.level, eye, p.pos);
    };
    const fog = c.scene.fog instanceof THREE.Fog ? c.scene.fog : null;
    const sightRange = fogSightRange(fog);

    // enemy under the crosshair (only if you can see it); lingers a moment against flicker
    let aimId = -1;
    let best = Infinity;
    for (const p of others) {
      if (!p.alive || p.team === myTeam) continue;
      const b = bodyOf(p, mv);
      const t = rayHitsBody(eye, dir, b.bottom, b.top, b.radius + 0.1, AIM_RANGE);
      if (t !== null && t < best) {
        best = t;
        aimId = p.id;
      }
    }
    const aimP = others.find((p) => p.id === aimId);
    if (aimP && visible(aimP)) this.aimed = { id: aimId, until: this.time + AIM_LINGER };
    else if (this.aimed) {
      const prev = others.find((p) => p.id === this.aimed?.id);
      const keep =
        this.time < this.aimed.until &&
        !!prev &&
        prev.alive &&
        prev.team !== myTeam &&
        visible(prev);
      if (!keep) this.aimed = null;
    }

    const live = s.match?.()?.phase === 'live';
    const present = new Set<number>();
    for (const p of others) {
      present.add(p.id);
      // carriers get their own objective marker (see objectives)
      if (live && p.carrier && p.alive) continue;
      const enemy = p.team !== myTeam;
      // only an unrevealed enemy carrier needs this (its ◆ while you can see it: in the
      // clear, and not lost in the fog)
      const inSight =
        enemy &&
        p.alive &&
        p.carrier &&
        !p.revealed &&
        len(sub(p.pos, eye)) <= sightRange &&
        this.inView(p, visible);
      const tag = playerTag(p, myTeam, this.aimed?.id === p.id, inSight);
      if (!tag) continue;
      const body = bodyOf(p, mv);
      const pm = projectMarker(madd(p.pos, p.up, body.height / 2 + 0.3), cam, w, hgt);
      if (!pm.onScreen) continue; // player tags are never clamped to the screen edge
      let opacity = 1;
      let cls = `wm-${tag.kind}`;
      let priority = 40;
      if (tag.kind === 'ally') {
        const inView = this.inView(p, visible);
        opacity = tagOpacity(pm.dist, inView);
        if (!inView) cls += ' wm-occluded';
        if (p.carrier) cls += ' wm-carrier';
        // carriers first, then nearer teammates keep their spot (10 m steps, so two mates at
        // about the same distance don't keep swapping places; ties keep a stable order)
        priority = (p.carrier ? 60 : 50) - Math.min(9, Math.floor(pm.dist / 10));
      } else if (tag.kind === 'aim') {
        opacity = 0.9;
        priority = 70;
      }
      const size = estimateBox(tag.text, TEXT[tag.kind].font, {
        spacingEm: TEXT[tag.kind].spacingEm,
      });
      const key = `${tag.kind === 'ally' ? 'ally' : tag.kind === 'aim' ? 'aim' : 'enemy'}-${p.id}`;
      out.push({
        box: { key, x: pm.x, y: pm.y, w: size.w, h: size.h, align: 'bottom', priority },
        view: {
          key,
          cls,
          text: tag.text,
          color: tag.kind === 'ally' ? TEAM_COLOR[myTeam] : TEAM_COLOR[p.team],
          x: pm.x,
          y: pm.y,
          align: 'bottom',
          opacity,
          arrow: null,
        },
      });
    }
    for (const id of this.sight.keys()) if (!present.has(id)) this.sight.delete(id);
  }

  /** Line of sight to a player, re-checked a few times a second. */
  private inView(p: RenderPlayer, visible: (p: RenderPlayer) => boolean): boolean {
    const st = this.sight.get(p.id);
    if (st && this.time < st.next) return st.inView;
    const inView = visible(p);
    this.sight.set(p.id, { next: this.time + SIGHT_RECHECK, inView });
    return inView;
  }

  dispose(): void {
    this.layer?.dispose();
  }
}
