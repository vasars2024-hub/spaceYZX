// The opening face-off, drawn (the timeline, layout and maths are in game/intro.ts).
//
// When a two-team match starts, a small stage appears high above the middle of the map: every
// player of the match (bots too) jetpacks in from off-screen as the real robot model with team
// colours, flames and sparks; they land in two lines facing each other, seen from the side, with
// name tags and ranks over their heads, each team's chance to win and a "VS" title with the map
// and the mode. Then portals open under their feet, they drop through, and the view cuts hard
// to your own eyes at your spawn for the countdown. Any key or click skips it (for you only);
// Settings → Gameplay → Match intro turns it off. The sim never notices: it plays during round
// 1's longer spawn lock.
import * as THREE from 'three';
import { Move, qFromBasis, v3, type RankDisplay } from '@space-yz/shared';
import type { ClientFeature, GameClient } from './client';
import type { MatchInfo, RenderPlayer } from './session';
import {
  ECHELON_STEP,
  beatAt,
  dropDepth,
  flight,
  introClock,
  introPhase,
  introShot,
  lineLayout,
  lineOrder,
  portalOpen,
  shouldStartIntro,
  teamGap,
  teamReach,
  winPercents,
  type IntroPhase,
} from './intro';
import { PlayerModels } from '../render/players';
import { Fragments } from '../render/combat-view';
import { TEAM_COLOR, TEAM_HEX } from './objectives';
import { modeLabel } from './transitions';
import { announce } from '../ui/transitions';
import { h } from '../ui/menus';

const TEAM_NAME = ['CYAN', 'ORANGE'] as const;

/**
 * The backdrop, drawn once into a small canvas: deep blue, your team's colour glowing from the
 * left, the enemy's from the right, a bright seam in the middle and faint light streaks.
 */
const backdropTexture = (left: number, right: number): THREE.CanvasTexture => {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  const g = cv.getContext('2d');
  const hex = (c: number, a: number) =>
    `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
  if (g) {
    const sky = g.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0, '#03050c');
    sky.addColorStop(0.62, '#0b1426');
    sky.addColorStop(1, '#03050c');
    g.fillStyle = sky;
    g.fillRect(0, 0, 512, 256);
    g.globalCompositeOperation = 'lighter';
    const glow = (x: number, c: number) => {
      const r = g.createRadialGradient(x, 150, 0, x, 150, 230);
      r.addColorStop(0, hex(c, 0.55));
      r.addColorStop(0.5, hex(c, 0.16));
      r.addColorStop(1, hex(c, 0));
      g.fillStyle = r;
      g.fillRect(0, 0, 512, 256);
    };
    glow(40, left);
    glow(472, right);
    const seam = g.createLinearGradient(236, 0, 276, 0);
    seam.addColorStop(0, 'rgba(255,255,255,0)');
    seam.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    seam.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = seam;
    g.fillRect(0, 0, 512, 256);
    // streaks fanning out from the middle
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 3;
    for (let i = -6; i <= 6; i++) {
      g.beginPath();
      g.moveTo(256, 160);
      g.lineTo(256 + i * 70, -10);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};
/** how high above the map's top the stage floats (well below the sky duel's arena) */
const STAGE_ABOVE = 40;
const UP = v3(0, 1, 0);

let playing = false;
/** Is the opening face-off on screen right now? (the match HUD holds its cards back) */
export const introPlaying = (): boolean => playing;

interface Actor {
  id: number;
  team: 0 | 1;
  side: 1 | -1;
  /** place in the line (staggers take-off and portals) */
  k: number;
  spot: { x: number; z: number };
  view: { x: number; y: number; z: number; w: number };
  flames: THREE.Mesh;
  portal: THREE.Group;
  tag: HTMLDivElement;
  landed: boolean;
  sparkAt: number;
}

interface Show {
  /** round 1's spawn lock end (one intro per match start) */
  key: number;
  total: number;
  /** seconds into the intro (advanced by frame time, kept in step with the match clock) */
  t: number;
  origin: THREE.Vector3;
  actors: Actor[];
  /** the bigger team's size (camera distance) */
  n: number;
  beat: IntroPhase | null;
  skipped: boolean;
  /** screenshots / checking a moment: the intro held at this second (URL ?introAt=2.5) */
  pin: number | null;
}

/** `?introAt=<seconds>` holds the intro at that moment (for screenshots); null normally. */
const introPin = (): number | null => {
  const v = new URLSearchParams(window.location.search).get('introAt');
  return v !== null && Number.isFinite(Number(v)) ? Number(v) : null;
};

export class IntroFeature implements ClientFeature {
  private stage = new THREE.Group();
  private models = new PlayerModels();
  private sparks = new Fragments(400);
  private deck: THREE.Mesh | null = null;
  private layer!: HTMLDivElement;
  private title!: HTMLDivElement;
  private heads: [HTMLDivElement, HTMLDivElement] | null = null;
  private show: Show | null = null;
  private done = new Set<number>();
  private disposables: { dispose(): void }[] = [];
  private offKeys: (() => void) | null = null;
  private v = new THREE.Vector3();

  constructor(
    /** ranked: the ladder's name for the mode line ('Premier', 'Duels') */
    private readonly opts: { ladder?: string } = {},
  ) {}

  init(c: GameClient): void {
    this.layer = h('div', { class: 'intro-layer' });
    this.layer.style.display = 'none';
    c.deps.ui.append(this.layer);
    this.stage.visible = false;
    this.stage.add(this.models.group, this.sparks.mesh);
    c.scene.add(this.stage);
    // any key or click skips it (yours only); listened to on the window so it works before the
    // pointer is locked too
    const skip = () => {
      if (this.show && !this.show.skipped) this.show.skipped = true;
    };
    window.addEventListener('keydown', skip, true);
    window.addEventListener('pointerdown', skip, true);
    this.offKeys = () => {
      window.removeEventListener('keydown', skip, true);
      window.removeEventListener('pointerdown', skip, true);
    };
  }

  private clock(c: GameClient, m: MatchInfo): number {
    const s = c.session;
    const tick = s.tickNow?.() ?? s.world().tick;
    return introClock(tick, m.phaseEnds, s.config.rules.spawnLockSec, this.introSec(c));
  }

  private introSec(c: GameClient): number {
    // (an older server's config has no intro: 0)
    return Number((c.session.config.rules as { matchIntroSec?: number }).matchIntroSec) || 0;
  }

  frame(c: GameClient, dt: number): void {
    const m = c.session.match?.() ?? null;
    if (!m) {
      if (this.show) this.end(c);
      return;
    }
    const t = this.clock(c, m);
    if (!this.show && !this.done.has(m.phaseEnds)) {
      const sizes: [number, number] = [0, 0];
      for (const p of m.stats) sizes[p.team]++;
      if (
        shouldStartIntro({
          enabled: c.deps.settings.matchIntro,
          introSec: this.introSec(c),
          phase: m.phase,
          round: m.round,
          teamSizes: sizes,
          ffa: !!c.session.ctx.ffa,
          t,
        })
      ) {
        this.done.add(m.phaseEnds);
        this.start(c, m, t);
      }
    }
    const sh = this.show;
    if (!sh) return;
    if (sh.skipped || m.phase !== 'spawnLock' || m.phaseEnds !== sh.key || sh.t >= sh.total) {
      this.end(c);
      return;
    }
    this.update(c, dt);
  }

  private start(c: GameClient, m: MatchInfo, t: number): void {
    const s = c.session;
    const def = s.level.def;
    const total = this.introSec(c);
    const origin = new THREE.Vector3(
      (def.boundsMin.x + def.boundsMax.x) / 2,
      def.boundsMax.y + STAGE_ABOVE,
      (def.boundsMin.z + def.boundsMax.z) / 2,
    );
    const mine = s.local()?.team ?? 0;
    const names = s.names();
    const ranks = s.ranks?.() ?? {};
    const byTeam: [number[], number[]] = [[], []];
    for (const p of m.stats) byTeam[p.team].push(p.id);
    const n = Math.max(byTeam[0].length, byTeam[1].length);
    const gap = teamGap(n);
    this.buildStage(origin, n, gap, mine);
    const actors: Actor[] = [];
    for (const team of [0, 1] as const) {
      // your team on the left
      const side: 1 | -1 = team === mine ? 1 : -1;
      const ids = lineOrder(byTeam[team], team === mine ? s.localId : null);
      const spots = lineLayout(ids.length, side, gap);
      ids.forEach((id, k) => {
        const fwd = v3(0, 0, -side);
        const q = qFromBasis(fwd, UP);
        const r = ranks[id]?.rank ?? null;
        actors.push({
          id,
          team,
          side,
          k,
          spot: spots[k],
          view: q,
          flames: this.flame(team),
          portal: this.portal(team),
          tag: this.tag(
            // (practice bots' "(ally)" is plain from the team colour here)
            (names[id] ?? (id === s.localId ? 'You' : `Player ${id}`)).replace(/ \(ally\)$/, ''),
            team,
            r,
            id === s.localId,
          ),
          landed: false,
          sparkAt: 0,
        });
      });
    }
    for (const a of actors) {
      this.stage.add(a.flames, a.portal);
      this.layer.append(a.tag);
    }
    // the two team headers (with the chance to win) and the VS title
    const ratings = (team: 0 | 1) => byTeam[team].map((id) => ranks[id]?.rating ?? null);
    const pct = winPercents(ratings(0), ratings(1));
    const head = (team: 0 | 1) =>
      h(
        'div',
        { class: 'intro-head', style: `--team:${TEAM_COLOR[team]}` },
        h(
          'div',
          { class: 'intro-head-name' },
          team === mine ? `${TEAM_NAME[team]} · YOUR TEAM` : TEAM_NAME[team],
        ),
        h('div', { class: 'intro-head-pct' }, `${pct[team]}%`),
        h('div', { class: 'intro-head-sub' }, 'chance to win'),
      );
    this.heads = [head(0), head(1)];
    this.title = h(
      'div',
      { class: 'intro-title' },
      h('div', { class: 'intro-vs' }, 'VS'),
      h('div', { class: 'intro-map' }, def.name),
      h('div', { class: 'intro-mode' }, modeLabel(m, this.opts.ladder)),
    );
    this.layer.append(
      h('div', { class: 'intro-bar top' }),
      h('div', { class: 'intro-bar bottom' }),
      ...this.heads,
      this.title,
      h('div', { class: 'intro-skip' }, 'Press any key to skip'),
    );
    this.layer.style.display = '';
    c.deps.ui.classList.add('intro-on');
    this.models.setCsMode(m.loadout === 'cs');
    this.stage.visible = true;
    this.show = {
      key: m.phaseEnds,
      total,
      t: Math.max(0, t),
      origin,
      actors,
      n,
      beat: null,
      skipped: false,
      pin: introPin(),
    };
    playing = true;
    c.cinematic = (camera, dt) => this.camera(c, camera, dt);
  }

  /** The camera hook (runs before every feature's frame): advance the intro and place the shot. */
  private camera(c: GameClient, camera: THREE.PerspectiveCamera, dt: number): void {
    const sh = this.show;
    if (!sh) return;
    sh.t += dt;
    if (sh.pin !== null) sh.t = sh.pin;
    // stay in step with the match clock (online it is the server's): nudge, never jump back
    const m = c.session.match?.();
    if (m && sh.pin === null) {
      const clock = this.clock(c, m);
      if (Math.abs(clock - sh.t) > 0.25) sh.t = Math.max(sh.t, clock);
    }
    const shot = introShot(sh.t, sh.total, sh.n);
    const o = sh.origin;
    camera.position.set(o.x + shot.pos.x, o.y + shot.pos.y, o.z + shot.pos.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(o.x + shot.target.x, o.y + shot.target.y, o.z + shot.target.z);
    const vfov =
      (2 * Math.atan(Math.tan((shot.hfov * Math.PI) / 360) / camera.aspect) * 180) / Math.PI;
    camera.fov = vfov;
    camera.updateProjectionMatrix();
  }

  private update(c: GameClient, dt: number): void {
    const sh = this.show!;
    const t = sh.t;
    const a = c.deps.audio;
    const beat = introPhase(t, sh.total)?.phase ?? null;
    if (beat !== sh.beat) {
      // the sounds of each beat
      if (beat === 'flyIn') a.play('introWhoosh', { volume: 0.9 });
      if (beat === 'faceOff') {
        a.play('introSting', { volume: 1 });
        announce('lethal-recoil');
      }
      if (beat === 'portal') a.play('introPortal', { volume: 0.9 });
      if (beat === 'drop') a.play('introWhoosh', { volume: 0.6, rate: 1.5 });
      sh.beat = beat;
    }
    const o = sh.origin;
    const stand = c.session.config.movement.standHeight;
    const players: RenderPlayer[] = [];
    const camera = c.camera;
    const W = window.innerWidth;
    const H = window.innerHeight;
    for (const ac of sh.actors) {
      const f = flight(ac.spot, ac.side, ac.k, t);
      const depth = dropDepth(ac.k, t, sh.total);
      const feet = new THREE.Vector3(o.x + f.pos.x, o.y + f.pos.y - depth, o.z + f.pos.z);
      if (f.landed && !ac.landed) {
        ac.landed = true;
        this.sparks.burst(
          v3(feet.x, feet.y + 0.2, feet.z),
          0x9fb0c8,
          6,
          3,
          0.35,
          0.3,
          v3(0, -6, 0),
        );
      }
      const visible = f.started && depth < 2.5;
      players.push({
        id: ac.id,
        team: ac.team,
        name: '',
        pos: v3(feet.x, feet.y + stand / 2, feet.z),
        up: UP,
        view: ac.view,
        vel: f.landed && depth === 0 ? v3() : depth > 0 ? v3(0, -10, 0) : f.vel,
        crouched: false,
        alive: visible,
        move: f.landed && depth === 0 ? Move.Ground : Move.Air,
        hp: 100,
        windup: 0,
        aiming: false,
        laserWarn: 0,
        slashTicks: 0,
        carrier: false,
        revealed: false,
      });
      // jetpack flames on the back, flickering, with a trail of sparks
      const thrust = visible ? f.thrust : 0;
      ac.flames.visible = thrust > 0.02;
      if (ac.flames.visible) {
        const back = new THREE.Vector3(0, 0, ac.side * 0.32); // behind them (they face -side z)
        ac.flames.position.set(feet.x + back.x, feet.y + 0.85, feet.z + back.z);
        const flick = 0.8 + 0.4 * Math.random();
        ac.flames.scale.set(1, thrust * flick, 1);
        ac.sparkAt -= dt;
        if (ac.sparkAt <= 0) {
          ac.sparkAt = 0.05;
          this.sparks.burst(
            v3(feet.x + back.x, feet.y + 0.4, feet.z + back.z),
            0xffb347,
            2,
            3,
            0.3,
            0.3,
            v3(0, -9, 0),
          );
        }
      }
      // the portal under their feet
      const open = portalOpen(ac.k, t, sh.total);
      ac.portal.visible = open > 0.01;
      if (ac.portal.visible) {
        ac.portal.position.set(o.x + ac.spot.x, o.y + 0.012, o.z + ac.spot.z);
        ac.portal.scale.setScalar(open);
        ac.portal.rotation.y += dt * 3;
      }
      // name tag over the head
      this.v.set(feet.x, feet.y + stand + 0.45, feet.z).project(camera);
      const on = visible && depth < 0.3 && this.v.z < 1 && t >= beatAt('flyIn', sh.total) + 0.4;
      ac.tag.style.opacity = on && f.landed ? '1' : on ? '0.6' : '0';
      if (on)
        ac.tag.style.transform = `translate(${((this.v.x + 1) / 2) * W}px, ${((1 - this.v.y) / 2) * H}px) translate(-50%, -100%)`;
    }
    this.models.update(players, dt, t);
    this.sparks.update(dt);
    // team headers over each line's middle; the VS title in the face-off
    const faceOff = t >= beatAt('faceOff', sh.total) && t < beatAt('drop', sh.total);
    if (this.heads) {
      for (const team of [0, 1] as const) {
        const side = sh.actors.find((x) => x.team === team)?.side ?? 1;
        // over the middle of the team's line
        const mid = (teamGap(sh.n) / 2 + teamReach(sh.n)) / 2;
        this.v.set(o.x, o.y + 3.4, o.z + side * mid).project(camera);
        const el = this.heads[team];
        el.style.opacity = faceOff ? '1' : '0';
        el.style.transform = `translate(${((this.v.x + 1) / 2) * W}px, ${((1 - this.v.y) / 2) * H}px) translate(-50%, -100%)`;
      }
    }
    this.title.classList.toggle('show', faceOff);
  }

  private end(c: GameClient): void {
    const sh = this.show;
    this.show = null;
    playing = false;
    c.cinematic = null;
    c.deps.ui.classList.remove('intro-on');
    this.layer.style.display = 'none';
    this.layer.replaceChildren();
    this.heads = null;
    this.stage.visible = false;
    if (sh)
      for (const a of sh.actors) {
        this.stage.remove(a.flames, a.portal);
      }
    this.models.update([], 0, 0);
    if (this.deck) {
      this.stage.remove(this.deck);
      this.deck = null;
    }
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    // the hard cut: your own eyes, looking the way your spawn faces
    c.syncCameraToPlayer();
  }

  // ------------------------------------------------------------------------------ building

  private keep<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  /** The floating deck: dark plates, a glowing edge in each team's colour and a centre line. */
  private buildStage(origin: THREE.Vector3, n: number, gap: number, mine: 0 | 1): void {
    const len = (n - 1) * ECHELON_STEP + 3.5;
    const wide = 2 * teamReach(n, gap) + 3;
    // (lighter top, darker sides: reads as a floating slab)
    const side = this.keep(new THREE.MeshBasicMaterial({ color: 0x0d121b }));
    const top = this.keep(new THREE.MeshBasicMaterial({ color: 0x223047 }));
    const deck = new THREE.Mesh(this.keep(new THREE.BoxGeometry(len, 0.5, wide)), [
      side,
      side,
      top,
      side,
      side,
      side,
    ]);
    deck.position.set(origin.x, origin.y - 0.25, origin.z);
    const glow = (color: number, w: number, d: number, z: number, opacity = 0.9) => {
      const m = new THREE.Mesh(
        this.keep(new THREE.PlaneGeometry(w, d)),
        this.keep(
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        ),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.256, z);
      deck.add(m);
    };
    // each team's end of the deck glows in its colour (yours on the left: +z)
    glow(TEAM_HEX[mine], len, 0.25, wide / 2 - 0.3);
    glow(TEAM_HEX[(1 - mine) as 0 | 1], len, 0.25, -wide / 2 + 0.3);
    glow(0xffffff, len, 0.08, 0, 0.5);
    // the side facing the camera: a thin lit rim
    const rim = new THREE.Mesh(
      this.keep(new THREE.PlaneGeometry(wide, 0.12)),
      this.keep(new THREE.MeshBasicMaterial({ color: 0x8fa6c8 })),
    );
    rim.rotation.y = Math.PI / 2;
    rim.position.set(len / 2 + 0.002, 0.19, 0);
    deck.add(rim);
    this.deck = deck;
    this.stage.add(deck);
    // far behind the stage: a backdrop glowing in both teams' colours (no fog on it)
    const back = new THREE.Mesh(
      this.keep(new THREE.PlaneGeometry(220, 110)),
      this.keep(
        new THREE.MeshBasicMaterial({
          map: this.keep(backdropTexture(TEAM_HEX[mine], TEAM_HEX[(1 - mine) as 0 | 1])),
          fog: false,
          depthWrite: false,
        }),
      ),
    );
    back.rotation.y = Math.PI / 2; // faces +x: the camera
    back.position.set(-60, 0, 0);
    back.renderOrder = -1;
    deck.add(back);
  }

  private flame(team: 0 | 1): THREE.Mesh {
    // a downward cone (tip at the bottom), orange-white with a hint of the team colour
    const geo = this.keep(new THREE.ConeGeometry(0.12, 0.8, 10, 1, true));
    geo.rotateX(Math.PI);
    geo.translate(0, -0.45, 0);
    const color = new THREE.Color(0xff7a1a).lerp(new THREE.Color(TEAM_HEX[team]), 0.2);
    const mesh = new THREE.Mesh(
      geo,
      this.keep(
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.7,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      ),
    );
    mesh.visible = false;
    return mesh;
  }

  private portal(team: 0 | 1): THREE.Group {
    const g = new THREE.Group();
    const flat = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number) => {
      const m = new THREE.Mesh(this.keep(geo), this.keep(mat));
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      g.add(m);
    };
    // the hole: a dark violet disc they sink into, a bright rim in the team colour and a white
    // inner ring
    flat(new THREE.CircleGeometry(0.62, 32), new THREE.MeshBasicMaterial({ color: 0x0b0418 }), 0);
    const add = (color: number, opacity: number) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    flat(new THREE.RingGeometry(0.58, 0.8, 32, 1, 0, Math.PI * 1.7), add(TEAM_HEX[team], 1), 0.004);
    flat(new THREE.RingGeometry(0.4, 0.46, 32, 1, 0, Math.PI * 1.4), add(0xd9b8ff, 0.8), 0.006);
    flat(new THREE.RingGeometry(0.8, 1.15, 32), add(TEAM_HEX[team], 0.25), 0.002);
    g.visible = false;
    return g;
  }

  private tag(name: string, team: 0 | 1, rank: RankDisplay | null, me: boolean): HTMLDivElement {
    return h(
      'div',
      { class: `intro-tag${me ? ' me' : ''}`, style: `--team:${TEAM_COLOR[team]}` },
      // (no rank: the line stays empty so the names line up)
      h(
        'div',
        { class: 'intro-rank', style: rank ? `color:${rank.color}` : '' },
        rank?.label ?? '',
      ),
      h(
        'div',
        { class: 'intro-name' },
        name,
        me && name !== 'You' ? h('span', { class: 'intro-you' }, 'YOU') : null,
      ),
    );
  }

  dispose(c: GameClient): void {
    if (this.show) this.end(c);
    this.offKeys?.();
    this.layer.remove();
    c.scene.remove(this.stage);
    this.models.dispose();
    this.sparks.dispose();
  }
}
