// The minimap (top-left) and the big map (hold M), drawn from the level you're playing — any
// map works as it is, Map Maker edits and player-made maps too (minimap-model / minimap-nav).
//   - the map sliced at your height: your floor bright, floors below fading, walls dark, what's
//     above you left out; turns with you (or north up); zooms out when you move fast
//   - you (arrow + view cone), teammates (arrows, ▲/▼ when on another level, ✕ where one fell),
//     carriers of either team (pulsing ◆, the rules reveal them), enemies only while you can see
//     them or the rules reveal them, with a fading ghost where you last saw them
//   - objectives: bomb sites, Towers (attack / defend), dropped Controllers and the bomb (a
//     planted one pulses with its timer), power-ups, launch pads, portals, zip-rails, deadly
//     voids; off-map objectives sit on the rim pointing the way
//   - the route to your objective: a red-and-white guide line on the map and chevrons along the
//     floor in the world, re-planned as you move (X switches the bomb site you're routed to)
import * as THREE from 'three';
import type { MatchInfo, RenderPlayer } from './session';
import type { Level, SimEvent, Vec3 } from '@space-yz/shared';
import {
  cross,
  dot,
  len,
  lineOfSight,
  madd,
  normalize,
  qForward,
  raycast,
  sub,
  v3,
} from '@space-yz/shared';
import type { ClientFeature, GameClient } from './client';
import type { Settings } from '../settings';
import { h } from '../ui/menus';
import { keyLabel } from '../ui/settings-screen';
import { TEAM_COLOR, towerRole } from './objectives';
import { fogSightRange } from './world-markers';
import {
  enemyShown,
  goalFor,
  heightOver,
  siteCenter,
  sliceMap,
  type Goal,
  type Slice,
} from './minimap-model';
import { findRoute, upAt, type Route } from './minimap-nav';

const SIZES = { small: 170, medium: 214, large: 270 } as const;
/** metres from the middle to the rim (grows with your speed) */
const RADIUS_MIN = 34;
const RADIUS_MAX = 58;
const ROUTE_EVERY = 0.3;
const SIGHT_EVERY = 0.1;
const GHOST_SEC = 3;
const MARK_SEC = 5;
const CHEVRONS = 36;
const CHEVRON_STEP = 1.7;

interface View {
  cx: number;
  cy: number;
  /** px per metre */
  k: number;
  /** rim (px from the middle) */
  rim: number;
  round: boolean;
  /** the middle of the view, at your height (the map is cut there) */
  me: Vec3;
  /** where you stand (your arrow) */
  you: Vec3;
  sign: 1 | -1;
  /** screen axes in the world (x right, y up on screen) */
  right: Vec3;
  fwd: Vec3;
}

export class Minimap implements ClientFeature {
  private root!: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private label!: HTMLElement;
  private big!: HTMLElement;
  private bigCanvas!: HTMLCanvasElement;
  private bigLegend!: HTMLElement;
  private bigHeld = false;
  private site: 'A' | 'B' | null = null;
  private unsub: (() => void) | null = null;
  private time = 0;
  private radius = RADIUS_MIN;
  private sign: 1 | -1 = 1;
  private goal: Goal | null = null;
  private route: Route | null = null;
  private routeAt = -1;
  private routeKey = '';
  private sight = new Map<number, { next: number; seen: boolean }>();
  private ghosts = new Map<number, { pos: Vec3; team: 0 | 1; at: number }>();
  private marks: { pos: Vec3; team: 0 | 1; at: number }[] = [];
  private level: Level | null = null;
  private chevrons: THREE.InstancedMesh | null = null;
  private red = new THREE.Color(0xff3b4e);
  private white = new THREE.Color(0xf6f8ff);

  constructor(private settings: () => Settings) {}

  init(c: GameClient): void {
    this.canvas = h('canvas', { class: 'minimap-canvas' }) as HTMLCanvasElement;
    this.label = h('div', { class: 'minimap-label' });
    this.root = h('div', { class: 'minimap' }, this.canvas, this.label);
    this.bigCanvas = h('canvas', { class: 'bigmap-canvas' }) as HTMLCanvasElement;
    this.bigLegend = h('div', { class: 'bigmap-legend' });
    this.big = h('div', { class: 'bigmap' }, this.bigCanvas, this.bigLegend);
    this.big.style.display = 'none';
    c.deps.ui.append(this.root, this.big);
    this.unsub = c.deps.input.onAction((a) => {
      if (a === 'bigMap') this.bigHeld = true;
      if (a === 'bigMap:up') this.bigHeld = false;
      if (a === 'routeSite') this.site = this.site === 'A' ? 'B' : 'A';
    });
    // chevrons along the route in the world (a flat arrow head, pointing along +z)
    const shape = new THREE.Shape();
    shape.moveTo(-0.55, -0.25);
    shape.lineTo(0, 0.35);
    shape.lineTo(0.55, -0.25);
    shape.lineTo(0.55, -0.05);
    shape.lineTo(0, 0.55);
    shape.lineTo(-0.55, -0.05);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(Math.PI / 2); // lie flat, pointing along +z
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.chevrons = new THREE.InstancedMesh(geo, mat, CHEVRONS);
    this.chevrons.count = 0;
    this.chevrons.frustumCulled = false;
    this.chevrons.renderOrder = 5;
    c.scene.add(this.chevrons);
  }

  events(c: GameClient, events: SimEvent[]): void {
    for (const e of events) {
      if (e.type !== 'kill') continue;
      const team =
        c.session.teams?.()[e.victim] ?? c.session.others().find((p) => p.id === e.victim)?.team;
      const t = team ?? c.session.local()?.team;
      if (t !== undefined) this.marks.push({ pos: e.pos, team: t, at: this.time });
      this.ghosts.delete(e.victim);
    }
  }

  frame(c: GameClient, dt: number): void {
    this.time += dt;
    const st = this.settings();
    const s = c.session;
    const me = s.local();
    const show = st.minimap && !c.panelOpen && !!me;
    this.root.style.display = show ? '' : 'none';
    const big = !!me && this.bigHeld && !c.panelOpen;
    this.big.style.display = big ? '' : 'none';
    if (this.level !== s.level) {
      // a new map (a Brawl rotation, a Map Maker test): nothing of the old one carries over
      this.level = s.level;
      this.route = null;
      this.routeKey = '';
      this.ghosts.clear();
      this.marks = [];
      this.sight.clear();
    }
    this.marks = this.marks.filter((m) => this.time - m.at < MARK_SEC);
    if (!me) {
      if (this.chevrons) this.chevrons.count = 0;
      return;
    }
    const mv = s.config.movement;
    const up = s.localUp() ?? me.up;
    // which way is "up" on the map: your floor's side (a wall walker keeps the last one)
    if (Math.abs(up.y) > 0.6) this.sign = up.y > 0 ? 1 : -1;
    const feet = madd(me.pos, up, -mv.standHeight / 2);
    const center = me.alive
      ? feet
      : v3(c.camera.position.x, c.camera.position.y - 1.6, c.camera.position.z);

    // what to go for, and the way there (re-planned a few times a second)
    const m = s.match?.() ?? null;
    const others = s.others();
    this.goal = goalFor({
      def: s.level.def,
      match: m,
      myTeam: me.team,
      localId: s.localId,
      me: feet,
      alive: me.alive,
      players: [
        {
          id: s.localId,
          team: me.team,
          pos: feet,
          alive: me.alive,
          carrier: !!m?.carriers.includes(s.localId),
        },
        ...others.map((p) => ({
          id: p.id,
          team: p.team,
          pos: madd(p.pos, p.up, -mv.standHeight / 2),
          alive: p.alive,
          carrier: p.carrier,
        })),
      ],
      powerups: (s.powerups?.() ?? []).map((u) => u.pos),
      site: this.site,
      raceCp: me.raceCp,
      holding: (me.powerup ?? 0) !== 0,
    });
    const wantRoute = st.routeGuide !== 'off' && !!this.goal;
    if (!wantRoute) this.route = null;
    else if (this.goal!.key !== this.routeKey || this.time - this.routeAt > ROUTE_EVERY) {
      this.routeKey = this.goal!.key;
      this.routeAt = this.time;
      this.route = findRoute(s.level, feet, this.goal!.pos);
    }
    this.placeChevrons(c, st.routeGuide === 'world' ? this.route : null, feet);

    // enemies in sight (checked a few times a second), ghosts where you last saw them
    const eye = s.localEye() ?? v3(c.camera.position.x, c.camera.position.y, c.camera.position.z);
    const fog = c.scene.fog instanceof THREE.Fog ? c.scene.fog : null;
    const range = fogSightRange(fog);
    const seen = new Set<number>();
    for (const p of others) {
      if (p.team === me.team || !p.alive) continue;
      let st2 = this.sight.get(p.id);
      if (!st2 || this.time >= st2.next) {
        const ok =
          len(sub(p.pos, eye)) <= range &&
          (lineOfSight(s.level, eye, madd(p.pos, p.up, 0.6)) || lineOfSight(s.level, eye, p.pos));
        st2 = { next: this.time + SIGHT_EVERY, seen: ok };
        this.sight.set(p.id, st2);
      }
      if (enemyShown(p, st2.seen)) {
        seen.add(p.id);
        this.ghosts.set(p.id, { pos: p.pos, team: p.team, at: this.time });
      }
    }
    for (const [id, g] of this.ghosts) if (this.time - g.at > GHOST_SEC) this.ghosts.delete(id);

    // zoom out with speed (up to a point), smoothly
    const speed = Math.hypot(me.vel.x, me.vel.z);
    const want =
      RADIUS_MIN + Math.min(1, Math.max(0, (speed - 8) / 14)) * (RADIUS_MAX - RADIUS_MIN);
    this.radius += (want - this.radius) * Math.min(1, dt * 2);

    if (show) {
      const size = SIZES[st.minimapSize] ?? SIZES.medium;
      const fwd3 = qForward(me.view);
      const view = this.viewFor(
        center,
        center,
        fwd3,
        st.minimapRotate,
        size / 2,
        size / 2,
        size / 2 - 4,
        this.radius,
        true,
      );
      this.draw(c, this.canvas, size, size, view, m, others, seen, false);
      const g = this.goal;
      const dist = this.route ? this.route.length : g ? len(sub(g.pos, feet)) : 0;
      const hints: string[] = [];
      if (m?.objective === 'bomb') hints.push(`${keyLabel(st.keybinds.routeSite?.[0])} site`);
      hints.push(`${keyLabel(st.keybinds.bigMap?.[0])} map`);
      this.label.innerHTML = '';
      if (g) {
        const t = h('span', { class: 'minimap-goal' }, `${g.label} · ${Math.round(dist)} m`);
        t.style.color = g.color;
        this.label.append(t);
      }
      this.label.append(h('span', { class: 'minimap-keys' }, hints.join('  ·  ')));
    }
    if (big) this.drawBig(c, center, m, others, seen);
  }

  // ------------------------------------------------------------------------------------------

  /** The map's screen frame around `me` (rotating with your view, or north up). */
  private viewFor(
    me: Vec3,
    you: Vec3,
    look: Vec3,
    rotate: boolean,
    cx: number,
    cy: number,
    rim: number,
    radius: number,
    round: boolean,
  ): View {
    const sign = this.sign;
    const worldUp = v3(0, sign, 0);
    let fwd: Vec3;
    if (rotate) {
      fwd = v3(look.x, 0, look.z);
      if (len(fwd) < 1e-3) fwd = v3(0, 0, -1);
      fwd = normalize(fwd);
    } else fwd = v3(0, 0, -1); // north (−z) up
    // x to the right as you'd see it standing on your floor (mirrored on a ceiling deck)
    const right = normalize(cross(fwd, worldUp));
    return { cx, cy, k: rim / radius, rim, round, me, you, sign, right, fwd };
  }

  private toScreen(v: View, p: Vec3): [number, number] {
    const d = sub(p, v.me);
    return [v.cx + dot(d, v.right) * v.k, v.cy - dot(d, v.fwd) * v.k];
  }

  private draw(
    c: GameClient,
    canvas: HTMLCanvasElement,
    w: number,
    hgt: number,
    v: View,
    m: MatchInfo | null,
    others: RenderPlayer[],
    seen: Set<number>,
    isBig: boolean,
  ): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${hgt}px`;
    }
    const g = canvas.getContext('2d');
    if (!g) return;
    const s = c.session;
    const def = s.level.def;
    const me = s.local()!;
    const mv = s.config.movement;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hgt);
    g.save();
    // the frame: a rounded square, the void inside it dark
    const r = isBig ? 12 : 16;
    g.beginPath();
    g.roundRect(1, 1, w - 2, hgt - 2, r);
    g.fillStyle = 'rgba(5, 9, 18, 0.82)';
    g.fill();
    g.clip();

    // ---- the level, sliced at your height ----
    const reach = (Math.hypot(w, hgt) / 2 / v.k) * 1.05;
    const slices = sliceMap(s.level, v.me, v.sign, reach);
    for (const sl of slices) this.fillSlice(g, v, sl);
    // deadly volumes near your level (the void you fall into): red wash
    for (const k of def.killVolumes ?? []) {
      const top = v.sign > 0 ? k.max.y : -k.min.y;
      const feet = v.me.y * v.sign;
      if (top < feet - 30 || top > feet + 2) continue;
      this.poly(g, v, [
        [k.min.x, k.min.z],
        [k.max.x, k.min.z],
        [k.max.x, k.max.z],
        [k.min.x, k.max.z],
      ]);
      g.fillStyle = 'rgba(255, 50, 70, 0.10)';
      g.fill();
    }
    // zip-rails (green), launch pads (amber chevrons), portals (rings)
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(61, 255, 154, 0.8)';
    for (const rail of def.rails) {
      if (!rail.points.some((p) => this.nearLevel(v, p, 8))) continue;
      g.beginPath();
      rail.points.forEach((p, i) => {
        const [x, y] = this.toScreen(v, p);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.stroke();
    }
    for (const pad of def.launchPads ?? []) {
      const at = v3((pad.min.x + pad.max.x) / 2, pad.min.y, (pad.min.z + pad.max.z) / 2);
      if (!this.nearLevel(v, at, 4)) continue;
      const [x, y] = this.toScreen(v, at);
      const dir = this.screenDir(v, pad.vel);
      this.chevronIcon(g, x, y, dir, '#ffb347', 5);
    }
    for (const pt of def.portals ?? []) {
      const at = v3((pt.min.x + pt.max.x) / 2, pt.min.y, (pt.min.z + pt.max.z) / 2);
      if (!this.nearLevel(v, at, 4)) continue;
      const [x, y] = this.toScreen(v, at);
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.strokeStyle = `#${pt.color.toString(16).padStart(6, '0')}`;
      g.lineWidth = 2;
      g.stroke();
    }

    // ---- the route: a dark casing, white under, red dashes marching toward the goal ----
    const route = this.route;
    const goal = this.goal;
    if (route && goal) {
      const pts = route.points.map((p) => this.toScreen(v, p));
      const path = () => {
        g.beginPath();
        pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
      };
      g.lineJoin = 'round';
      g.lineCap = 'round';
      path();
      g.setLineDash([]);
      g.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      g.lineWidth = 7;
      g.stroke();
      path();
      g.strokeStyle = '#f6f8ff';
      g.lineWidth = 4;
      g.stroke();
      path();
      g.setLineDash([6, 6]);
      g.lineDashOffset = -this.time * 18;
      g.strokeStyle = '#ff3b4e';
      g.stroke();
      g.setLineDash([]);
    } else if (goal) {
      // no walking route known: a faint straight hint
      const [x0, y0] = this.toScreen(v, v.you);
      const [x1, y1] = this.toScreen(v, goal.pos);
      g.setLineDash([3, 5]);
      g.strokeStyle = 'rgba(255, 90, 106, 0.6)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      g.setLineDash([]);
    }

    // ---- objectives ----
    const myTeam = me.team;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
    const rim = (p: Vec3) => this.clampToRim(v, this.toScreen(v, p), w, hgt);
    for (const site of def.bombSites ?? []) {
      const planted = m?.bomb?.planted?.site === site.name;
      const [x, y, out] = rim(siteCenter(site));
      this.badge(g, x, y, site.name, planted ? '#ff3b4e' : '#ff8b98', out, planted ? pulse : 0);
    }
    if (m && m.objective === 'tower' && m.overtime?.kind !== 'sky')
      for (const t of def.towers) {
        const { owner, attack } = towerRole(t.team, m.sideSwapped, myTeam);
        const [x, y, out] = rim(t.pos);
        this.diamond(g, x, y, 6, TEAM_COLOR[owner], attack ? '#ff3b4e' : '#f6f8ff', out);
      }
    if (m)
      for (const ctl of m.controllers) {
        if (!ctl.droppedAt) continue;
        const [x, y, out] = rim(ctl.droppedAt);
        this.diamond(g, x, y, 5, 'rgba(0,0,0,0)', TEAM_COLOR[ctl.team], out);
      }
    const b = m?.bomb;
    if (b && b.carrier === null && (myTeam === m?.attackers || b.planted)) {
      const [x, y, out] = rim(b.pos);
      g.beginPath();
      g.arc(x, y, 4 + (b.planted ? pulse * 4 : 0), 0, Math.PI * 2);
      g.fillStyle = '#ff3b4e';
      g.fill();
      if (b.planted && !out) {
        const now = s.tickNow?.() ?? s.world().tick;
        g.fillStyle = '#ffd0d5';
        g.font = '700 10px Segoe UI, sans-serif';
        g.textAlign = 'center';
        g.fillText(`${Math.max(0, Math.ceil((b.planted.explodeAt - now) / 60))}s`, x, y - 9);
      }
    }
    for (const u of s.powerups?.() ?? []) {
      const [x, y, out] = rim(u.pos);
      this.star(g, x, y, out ? 4 : 5, u.kind === 1 ? '#8fe6ff' : '#ffc44d');
    }
    // the goal: a ring round it, on the rim when off the map
    if (goal) {
      const [x, y, out] = rim(goal.pos);
      g.beginPath();
      g.arc(x, y, 7 + pulse * 2, 0, Math.PI * 2);
      g.strokeStyle = goal.color;
      g.lineWidth = 2;
      g.stroke();
      if (out) this.rimArrow(g, v, x, y, goal.color);
    }

    // ---- where people fell (✕ for a few seconds) ----
    for (const mk of this.marks) {
      const [x, y] = this.toScreen(v, mk.pos);
      const a = 1 - (this.time - mk.at) / MARK_SEC;
      g.globalAlpha = Math.max(0, a);
      g.strokeStyle = TEAM_COLOR[mk.team];
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x - 4, y - 4);
      g.lineTo(x + 4, y + 4);
      g.moveTo(x + 4, y - 4);
      g.lineTo(x - 4, y + 4);
      g.stroke();
      g.globalAlpha = 1;
    }

    // ---- players ----
    const upNow = s.localUp() ?? me.up;
    for (const [id, gh] of this.ghosts) {
      if (seen.has(id)) continue;
      const [x, y] = this.toScreen(v, gh.pos);
      g.globalAlpha = Math.max(0, 1 - (this.time - gh.at) / GHOST_SEC) * 0.7;
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.strokeStyle = TEAM_COLOR[gh.team];
      g.lineWidth = 1.5;
      g.stroke();
      g.globalAlpha = 1;
    }
    for (const p of others) {
      if (!p.alive) continue;
      const mate = p.team === myTeam;
      if (!mate && !seen.has(p.id)) continue;
      const feet = madd(p.pos, p.up, -mv.standHeight / 2);
      let [x, y] = this.toScreen(v, feet);
      let out = false;
      if (p.carrier) [x, y, out] = rim(feet);
      else if (this.outside(v, x, y, w, hgt)) continue;
      const col = TEAM_COLOR[p.team];
      if (p.carrier) {
        g.beginPath();
        g.arc(x, y, 8 + pulse * 3, 0, Math.PI * 2);
        g.strokeStyle = col;
        g.globalAlpha = 0.6;
        g.lineWidth = 2;
        g.stroke();
        g.globalAlpha = 1;
        this.diamond(g, x, y, 5, col, '#ffffff', out);
      } else this.arrow(g, x, y, this.screenDir(v, qForward(p.view)), mate ? 5 : 4.5, col, !mate);
      const dh = heightOver(feet, madd(me.pos, upNow, -mv.standHeight / 2), upNow);
      if (Math.abs(dh) > 2.5 && !out) {
        g.fillStyle = col;
        g.font = '700 8px Segoe UI, sans-serif';
        g.textAlign = 'left';
        g.fillText(dh > 0 ? '▲' : '▼', x + 5, y - 3);
      }
    }
    // you: the view cone and a white arrow in the middle of it
    const [mx, my] = this.toScreen(v, v.you);
    const look = this.screenDir(v, qForward(me.view));
    const half = ((this.settings().fov ?? 100) * Math.PI) / 360;
    const ang = Math.atan2(look[1], look[0]);
    const cone = g.createRadialGradient(mx, my, 2, mx, my, 42);
    cone.addColorStop(0, 'rgba(255,255,255,0.22)');
    cone.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cone;
    g.beginPath();
    g.moveTo(mx, my);
    g.arc(mx, my, 42, ang - half, ang + half);
    g.closePath();
    g.fill();
    if (me.alive) this.arrow(g, mx, my, look, 6.5, '#ffffff', false);
    g.restore();
    // the rim
    g.beginPath();
    g.roundRect(1, 1, w - 2, hgt - 2, r);
    g.strokeStyle = 'rgba(160, 200, 255, 0.35)';
    g.lineWidth = 1.5;
    g.stroke();
  }

  /** The big map: the whole level, north up, sliced at your height, with a legend. */
  private drawBig(
    c: GameClient,
    me: Vec3,
    m: MatchInfo | null,
    others: RenderPlayer[],
    seen: Set<number>,
  ): void {
    const def = c.session.level.def;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(vw - 60, 900);
    const hgt = Math.min(vh - 120, 640);
    // fit the level's floor (its bounds, less the empty margin) into the box, north up
    const lo = def.boundsMin;
    const hi = def.boundsMax;
    const span = Math.max(20, Math.max((hi.x - lo.x) / w, (hi.z - lo.z) / hgt) * Math.max(w, hgt));
    const radius = span / 2;
    const mid = v3((lo.x + hi.x) / 2, me.y, (lo.z + hi.z) / 2);
    // (cut at your height, framed on the level's middle, your arrow where you are)
    const view = this.viewFor(
      mid,
      me,
      v3(0, 0, -1),
      false,
      w / 2,
      hgt / 2,
      Math.max(w, hgt) / 2,
      radius,
      false,
    );
    this.draw(c, this.bigCanvas, w, hgt, view, m, others, seen, true);
    this.bigLegend.innerHTML =
      `<span><b style="color:#fff">▲</b> you</span>` +
      `<span><b style="color:${TEAM_COLOR[0]}">◆</b> carrier</span>` +
      `<span><b style="color:#ff8b98">A B</b> sites</span>` +
      `<span><b style="color:#ff3b4e">━</b><b style="color:#fff">━</b> route</span>` +
      `<span><b style="color:#ffc44d">★</b> power-up</span>` +
      `<span><b style="color:#3dff9a">━</b> zip-rail</span>` +
      `<span><b style="color:#ffb347">⌃</b> launch pad</span>` +
      `<span>brighter = your level · faded = below</span>`;
  }

  // ------------------------------------------------------------------------------------------
  // drawing helpers

  private fillSlice(g: CanvasRenderingContext2D, v: View, sl: Slice): void {
    this.poly(g, v, sl.poly);
    if (sl.kind === 'wall') {
      g.fillStyle = '#0c1628';
      g.fill();
      g.strokeStyle = 'rgba(150, 190, 255, 0.45)';
      g.lineWidth = 1;
      g.stroke();
    } else if (sl.kind === 'level') {
      g.fillStyle = 'rgba(64, 98, 150, 0.95)';
      g.fill();
    } else {
      const a = Math.max(0.12, 0.55 - sl.depth / 30);
      g.fillStyle = `rgba(38, 58, 96, ${a.toFixed(2)})`;
      g.fill();
    }
  }

  private poly(g: CanvasRenderingContext2D, v: View, pts: [number, number][]): void {
    g.beginPath();
    pts.forEach(([x, z], i) => {
      const [sx, sy] = this.toScreen(v, v3(x, v.me.y, z));
      if (i === 0) g.moveTo(sx, sy);
      else g.lineTo(sx, sy);
    });
    g.closePath();
  }

  /** A world direction as a screen direction (unit, y down). */
  private screenDir(v: View, d: Vec3): [number, number] {
    const x = dot(d, v.right);
    const y = -dot(d, v.fwd);
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  }

  /** Near your level (within `slack` m along your up)? */
  private nearLevel(v: View, p: Vec3, slack: number): boolean {
    const dy = (p.y - v.me.y) * v.sign;
    return dy > -slack * 2 && dy < slack;
  }

  private outside(v: View, x: number, y: number, w: number, hgt: number): boolean {
    return x < 4 || y < 4 || x > w - 4 || y > hgt - 4;
  }

  /** A screen point pulled onto the rim when it's off the map: [x, y, clamped]. */
  private clampToRim(
    v: View,
    [x, y]: [number, number],
    w: number,
    hgt: number,
  ): [number, number, boolean] {
    const pad = 9;
    if (x >= pad && y >= pad && x <= w - pad && y <= hgt - pad) return [x, y, false];
    const dx = x - v.cx;
    const dy = y - v.cy;
    const t = Math.min(
      (w / 2 - pad) / Math.max(1e-6, Math.abs(dx)),
      (hgt / 2 - pad) / Math.max(1e-6, Math.abs(dy)),
    );
    return [v.cx + dx * t, v.cy + dy * t, true];
  }

  private rimArrow(
    g: CanvasRenderingContext2D,
    v: View,
    x: number,
    y: number,
    color: string,
  ): void {
    const a = Math.atan2(y - v.cy, x - v.cx);
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.beginPath();
    g.moveTo(6, 0);
    g.lineTo(-2, -5);
    g.lineTo(-2, 5);
    g.closePath();
    g.fillStyle = color;
    g.fill();
    g.restore();
  }

  private arrow(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    [dx, dy]: [number, number],
    size: number,
    color: string,
    enemy: boolean,
  ): void {
    const a = Math.atan2(dy, dx);
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.beginPath();
    g.moveTo(size * 1.3, 0);
    g.lineTo(-size * 0.8, -size * 0.8);
    g.lineTo(-size * 0.35, 0);
    g.lineTo(-size * 0.8, size * 0.8);
    g.closePath();
    g.fillStyle = color;
    g.fill();
    g.strokeStyle = enemy ? '#2a0008' : 'rgba(0,0,0,0.7)';
    g.lineWidth = 1.2;
    g.stroke();
    g.restore();
  }

  private diamond(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    fill: string,
    stroke: string,
    faded: boolean,
  ): void {
    g.globalAlpha = faded ? 0.8 : 1;
    g.beginPath();
    g.moveTo(x, y - r);
    g.lineTo(x + r, y);
    g.lineTo(x, y + r);
    g.lineTo(x - r, y);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = stroke;
    g.lineWidth = 1.8;
    g.stroke();
    g.globalAlpha = 1;
  }

  private badge(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    color: string,
    faded: boolean,
    glow: number,
  ): void {
    g.globalAlpha = faded ? 0.8 : 1;
    g.fillStyle = 'rgba(40, 6, 12, 0.85)';
    g.strokeStyle = color;
    g.lineWidth = 1.5 + glow * 1.5;
    g.beginPath();
    g.roundRect(x - 7, y - 7, 14, 14, 3);
    g.fill();
    g.stroke();
    g.fillStyle = color;
    g.font = '800 10px Segoe UI, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x, y + 0.5);
    g.textBaseline = 'alphabetic';
    g.globalAlpha = 1;
  }

  private star(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = color;
    g.fill();
  }

  private chevronIcon(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    [dx, dy]: [number, number],
    color: string,
    r: number,
  ): void {
    const a = Math.atan2(dy, dx);
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.beginPath();
    g.moveTo(-r * 0.6, -r);
    g.lineTo(r * 0.6, 0);
    g.lineTo(-r * 0.6, r);
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.stroke();
    g.restore();
  }

  // ------------------------------------------------------------------------------------------
  // the route in the world: chevrons along the floor, red and white, marching ahead of you

  private placeChevrons(c: GameClient, route: Route | null, feet: Vec3): void {
    const mesh = this.chevrons;
    if (!mesh) return;
    if (!route || route.points.length < 2 || route.length < 3) {
      mesh.count = 0;
      return;
    }
    const level = c.session.level;
    const mtx = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const basis = new THREE.Matrix4();
    // walk the route from where you stand, a chevron every CHEVRON_STEP (shifting as time goes)
    const phase = (this.time * 2.2) % CHEVRON_STEP;
    let n = 0;
    let along = 1.2 + phase;
    let seg = 0;
    let segStart = 0;
    const pts = route.points;
    void feet;
    while (n < CHEVRONS && seg < pts.length - 1) {
      const a = pts[seg];
      const b = pts[seg + 1];
      const l = len(sub(b, a));
      if (along > segStart + l) {
        segStart += l;
        seg++;
        continue;
      }
      const t = l > 1e-6 ? (along - segStart) / l : 0;
      const p = v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
      const up = upAt(level, madd(p, v3(0, 1, 0), 0.9));
      // sit on the floor under it (stairs and ramps between waypoints)
      const hit = raycast(level, madd(p, up, 1.2), v3(-up.x, -up.y, -up.z), 3);
      const on = hit ? madd(hit.point, up, 0.06) : madd(p, up, 0.06);
      let dir = sub(b, a);
      dir = sub(dir, v3(up.x * dot(dir, up), up.y * dot(dir, up), up.z * dot(dir, up)));
      if (len(dir) < 1e-4) {
        along += CHEVRON_STEP;
        continue;
      }
      dir = normalize(dir);
      const right = normalize(cross(up, dir));
      basis.makeBasis(
        new THREE.Vector3(right.x, right.y, right.z),
        new THREE.Vector3(up.x, up.y, up.z),
        new THREE.Vector3(dir.x, dir.y, dir.z),
      );
      quat.setFromRotationMatrix(basis);
      // the last few shrink away (the line fades out ahead of you)
      const fade = Math.min(1, (CHEVRONS - n) / 8);
      pos.set(on.x, on.y, on.z);
      scl.setScalar(0.9 * fade);
      mtx.compose(pos, quat, scl);
      mesh.setMatrixAt(n, mtx);
      // red and white by the marching index (the colours flow along with the chevrons)
      const k = Math.floor((along - phase) / CHEVRON_STEP);
      mesh.setColorAt(n, k % 2 === 0 ? this.red : this.white);
      n++;
      along += CHEVRON_STEP;
    }
    // near the goal: nothing more to show
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  dispose(c: GameClient): void {
    this.unsub?.();
    this.root?.remove();
    this.big?.remove();
    if (this.chevrons) {
      c.scene.remove(this.chevrons);
      this.chevrons.geometry.dispose();
      (this.chevrons.material as THREE.Material).dispose();
    }
  }
}
