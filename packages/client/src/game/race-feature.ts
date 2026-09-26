// Parkour race presentation (shared rules/race.ts, sim/race.ts): the race HUD, the other racers
// drawn see-through, your personal-best ghost, gate numbers and fuel cells in the world.
// Works offline (the view comes straight from the rules) and online (the server's rules state
// `{ rules: 'race', ... }`); your own gates, falls and surges are predicted, so the clock,
// checkpoint count and splits react instantly.
//
//   top      race clock · position (2/6) · checkpoint (3/7) · split vs your best (green/red)
//   middle   3-2-1-GO, "back to checkpoint" during a penalty, NEW BEST / DNF banners
//   right    live order (names, gates)
//   left     SURGE charges and the jetpack tank (in the movement HUD)
//   results  places, times, gaps, your best
import * as THREE from 'three';
import type { PlayerState, RaceResult, RaceView, SimEvent, Vec3 } from '@space-yz/shared';
import {
  formatRaceTime,
  formatSplitDelta,
  gateCenter,
  qFromYawPitch,
  splitDelta,
  TICK_DT,
  updatePersonalBest,
  v3,
  type RacePersonalBest,
  type RacePersonalBests,
} from '@space-yz/shared';
import type { ClientFeature, GameClient } from './client';
import type { RenderPlayer } from './session';
import { PlayerModels } from '../render/players';
import { h } from '../ui/menus';
import { edgePoint, projectMarker } from '../ui/markers';
import { storage } from '../settings';

/** Other racers' opacity (their team-coloured rim stays brighter). */
export const RACER_OPACITY = 0.4;
/** Your personal-best ghost's opacity. */
export const GHOST_OPACITY = 0.22;
/** A ghost sample every this many ticks (10 per second). */
export const GHOST_EVERY = 6;

const GREEN = '#5dff9a';
const RED = '#ff5b5b';

/** "1st", "2nd", "3rd", "4th"... */
export const ordinal = (n: number): string => {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

/** The race state from a NetCore's rules state (null in other rooms). */
export const raceFromExtra = (extra: unknown): RaceView | null => {
  const x = extra as (RaceView & { rules?: string }) | null;
  return x && x.rules === 'race' ? x : null;
};

/** Your place in the running order (1 = leading; null = not in this race). */
export const racePlace = (v: RaceView, id: number): number | null => {
  const i = v.order.indexOf(id);
  return i < 0 ? null : i + 1;
};

/** Name tags in races: "Name · 2nd" while racing. */
export const raceTag = (name: string, v: RaceView | null, id: number): string => {
  if (!v || (v.phase !== 'racing' && v.phase !== 'results')) return name;
  const place = racePlace(v, id);
  return place ? `${name} · ${ordinal(place)}` : name;
};

// ------------------------------------------------------------------------------------------
// Personal bests and ghosts (kept in this browser)

const PB_KEY = 'lethalrecoil.race.pb.v1';
const GHOST_KEY = (track: string) => `lethalrecoil.race.ghost.v1.${track}`;

export interface GhostRun {
  track: string;
  timeMs: number;
  /** ticks between samples */
  every: number;
  /** x, y, z (body centre), yaw (radians) per sample, rounded */
  samples: number[];
}

export interface RaceStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export const loadPersonalBests = (store: RaceStore = storage): RacePersonalBests => {
  try {
    const raw = store.get(PB_KEY);
    const v = raw ? (JSON.parse(raw) as RacePersonalBests) : {};
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};

export const savePersonalBests = (pbs: RacePersonalBests, store: RaceStore = storage): void =>
  store.set(PB_KEY, JSON.stringify(pbs));

export const loadGhost = (track: string, store: RaceStore = storage): GhostRun | null => {
  try {
    const raw = store.get(GHOST_KEY(track));
    const g = raw ? (JSON.parse(raw) as GhostRun) : null;
    return g && Array.isArray(g.samples) && g.samples.length >= 8 ? g : null;
  } catch {
    return null;
  }
};

export const saveGhost = (g: GhostRun, store: RaceStore = storage): void =>
  store.set(GHOST_KEY(g.track), JSON.stringify(g));

/** Where the ghost is `ticks` after GO (null once its run is over). */
export const ghostAt = (
  g: GhostRun,
  ticks: number,
): { pos: Vec3; yaw: number; vel: Vec3 } | null => {
  const n = g.samples.length / 4;
  const f = ticks / g.every;
  if (f < 0 || f >= n - 1) return null;
  const i = Math.floor(f);
  const t = f - i;
  const s = g.samples;
  const a = i * 4;
  const b = a + 4;
  const lerp = (k: number) => s[a + k] + (s[b + k] - s[a + k]) * t;
  let dy = s[b + 3] - s[a + 3];
  if (dy > Math.PI) dy -= Math.PI * 2;
  if (dy < -Math.PI) dy += Math.PI * 2;
  const perSec = 1 / (g.every * TICK_DT);
  return {
    pos: v3(lerp(0), lerp(1), lerp(2)),
    yaw: s[a + 3] + dy * t,
    vel: v3((s[b] - s[a]) * perSec, (s[b + 1] - s[a + 1]) * perSec, (s[b + 2] - s[a + 2]) * perSec),
  };
};

/** Yaw (radians, the game's convention: 0 = facing -z) of a view. */
const yawOf = (p: PlayerState): number => {
  const q = p.view;
  // forward = q * (0, 0, -1)
  const fx = -2 * (q.x * q.z + q.w * q.y);
  const fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
  return Math.atan2(-fx, -fz);
};

const round2 = (x: number) => Math.round(x * 100) / 100;

// ------------------------------------------------------------------------------------------

export interface RaceFeatureOptions {
  /** the race state now (offline: raceView(st); online: raceFromExtra(core.extra)) */
  view: () => RaceView | null;
  /** map id and name of the track */
  track: string;
  trackName: string;
  /** where personal bests and the ghost are kept (default: this browser's storage) */
  store?: RaceStore;
}

interface GateLabel {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  tex: THREE.CanvasTexture;
}

export class RaceFeature implements ClientFeature {
  private root!: HTMLDivElement;
  private clockEl!: HTMLDivElement;
  private placeEl!: HTMLDivElement;
  private cpEl!: HTMLDivElement;
  private splitEl!: HTMLDivElement;
  private subEl!: HTMLDivElement;
  private bigEl!: HTMLDivElement;
  private bigSubEl!: HTMLDivElement;
  private listEl!: HTMLDivElement;
  private resultsEl!: HTMLDivElement;
  private arrowEl!: HTMLDivElement;
  private models = new PlayerModels();
  private ghostModels = new PlayerModels();
  private group = new THREE.Group();
  private labels: GateLabel[] = [];
  private cells: THREE.Mesh[] = [];
  private cellGeo = new THREE.OctahedronGeometry(0.55);
  private cellMat = new THREE.MeshBasicMaterial({ color: 0x7fe8ff });
  private time = 0;
  private bigUntil = 0;
  private splitUntil = 0;
  private lastCount = -1;
  private lastPhase = '';
  private lastRace = -1;
  /** this race: your split times (ms) and the finish */
  private mySplits: number[] = [];
  private myFinishMs = 0;
  private pbs: RacePersonalBests;
  private ghost: GhostRun | null;
  private recording: number[] = [];
  private recordedTick = -1;
  private resultsShownFor = -1;
  private store: RaceStore;

  constructor(private opts: RaceFeatureOptions) {
    this.store = opts.store ?? storage;
    this.pbs = loadPersonalBests(this.store);
    this.ghost = loadGhost(opts.track, this.store);
    this.models.setOpacity(RACER_OPACITY);
    this.ghostModels.setOpacity(GHOST_OPACITY);
  }

  /** Your personal best on this track (null = none yet). */
  get personalBest(): RacePersonalBest | null {
    return this.pbs[this.opts.track] ?? null;
  }

  init(c: GameClient): void {
    this.clockEl = h('div', { class: 'race-clock' }, '0:00.00');
    this.placeEl = h('div', { class: 'race-stat' });
    this.cpEl = h('div', { class: 'race-stat' });
    this.splitEl = h('div', { class: 'race-split' });
    this.subEl = h('div', { class: 'race-sub' });
    this.bigEl = h('div', { class: 'race-big' });
    this.bigSubEl = h('div', { class: 'race-big-sub' });
    this.listEl = h('div', { class: 'race-list' });
    this.resultsEl = h('div', { class: 'race-results hidden' });
    this.arrowEl = h('div', { class: 'race-next' });
    this.root = h(
      'div',
      { class: 'race-ui' },
      h(
        'div',
        { class: 'race-bar' },
        h('div', { class: 'race-row' }, this.placeEl, this.clockEl, this.cpEl),
        this.splitEl,
        this.subEl,
      ),
      h('div', { class: 'race-center' }, this.bigEl, this.bigSubEl),
      this.listEl,
      this.arrowEl,
      this.resultsEl,
    );
    c.deps.ui.append(this.root);
    c.scene.add(this.models.group, this.ghostModels.group, this.group);
    // SURGE charges and the race tank instead of the dash line
    const m = c.session.config.movement;
    c.hud.dashLine = (p) => {
      const pips =
        '●'.repeat(p.surgeLeft) + '○'.repeat(Math.max(0, m.raceSurgeCharges - p.surgeLeft));
      const k = Math.max(0, Math.min(1, p.jetFuel / m.raceJetpackFuelSec));
      const bars = Math.round(k * 8);
      return [
        `SURGE ${pips}${p.surgeTicks > 0 ? ' ▶' : ''}`,
        `FUEL ${'▮'.repeat(bars)}${'▯'.repeat(8 - bars)} ${p.jetFuel.toFixed(1)}s`,
      ];
    };
    this.buildWorld(c);
  }

  /** Gate numbers (sprites over the gates) and the fuel cells. */
  private buildWorld(c: GameClient): void {
    const race = c.session.level.def.race;
    if (!race) return;
    const gates = [...race.checkpoints, race.finish];
    gates.forEach((g, i) => {
      const last = i === gates.length - 1;
      const tex = labelTexture(last ? 'FINISH' : String(i + 1), last);
      const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
      const sprite = new THREE.Sprite(mat);
      const p = gateCenter(g);
      sprite.position.set(p.x, g.min.y + 1.5 + 6.2, p.z);
      sprite.scale.set(last ? 7 : 3.2, last ? 1.75 : 3.2, 1);
      this.group.add(sprite);
      this.labels.push({ sprite, mat, tex });
    });
    for (const f of race.fuelCells ?? []) {
      const mesh = new THREE.Mesh(this.cellGeo, this.cellMat);
      mesh.position.set(f.x, f.y, f.z);
      this.group.add(mesh);
      this.cells.push(mesh);
    }
  }

  private big(text: string, sub: string, sec: number, color = '#fff'): void {
    this.bigEl.textContent = text;
    this.bigEl.style.color = color;
    this.bigSubEl.textContent = sub;
    this.bigUntil = this.time + sec;
  }

  private name(c: GameClient, id: number): string {
    return id === c.session.localId ? 'You' : (c.session.names()[id] ?? `Racer ${id}`);
  }

  events(c: GameClient, events: SimEvent[]): void {
    const me = c.session.localId;
    const a = c.deps.audio;
    const v = this.opts.view();
    for (const e of events) {
      if (!('player' in e) || e.player !== me) continue;
      switch (e.type) {
        case 'surge':
          a.play('dash', { volume: 0.9, rate: 0.85 });
          break;
        case 'raceFuel':
          a.play('powerupPickup', { volume: 0.7 });
          break;
        case 'raceRespawn':
          a.play('revealPulse', { volume: 0.6, rate: 0.8 });
          c.syncCameraToPlayer();
          break;
        case 'raceCp':
          if (v && v.phase === 'racing') this.onGate(c, v, e.cp, e.finish);
          break;
      }
    }
  }

  /** You passed gate `cp` (1-based): split, sounds, and at the finish your time and best. */
  private onGate(c: GameClient, v: RaceView, cp: number, finish: boolean): void {
    const ms = Math.round((c.session.world().tick - v.startTick) * TICK_DT * 1000);
    this.mySplits[cp - 1] = ms;
    const pb = this.personalBest;
    const d = splitDelta(pb, cp - 1, ms);
    this.splitEl.textContent =
      d === null ? formatRaceTime(ms) : `${formatRaceTime(ms)}  ${formatSplitDelta(d)}`;
    this.splitEl.style.color = d === null ? '#fff' : d <= 0 ? GREEN : RED;
    this.splitUntil = this.time + 2.8;
    const a = c.deps.audio;
    if (!finish) {
      a.play('controllerPickup', { volume: 0.7 });
      return;
    }
    this.myFinishMs = ms;
    const up = updatePersonalBest(this.pbs, this.opts.track, ms, this.mySplits, Date.now());
    if (up.improved) {
      this.pbs = up.pbs;
      savePersonalBests(this.pbs, this.store);
      if (this.recording.length >= 8) {
        this.ghost = {
          track: this.opts.track,
          timeMs: ms,
          every: GHOST_EVERY,
          samples: this.recording,
        };
        saveGhost(this.ghost, this.store);
      }
      a.play('roundWin');
      this.big(
        'NEW PERSONAL BEST',
        `${formatRaceTime(ms)}${up.previous ? `  (${formatSplitDelta(ms - up.previous.timeMs)})` : ''}`,
        4,
        GREEN,
      );
    } else {
      a.play('roundStart', { volume: 0.7 });
      this.big(
        'FINISHED',
        `${formatRaceTime(ms)}${pb ? `  · best ${formatRaceTime(pb.timeMs)}` : ''}`,
        4,
      );
    }
  }

  frame(c: GameClient, dt: number): void {
    this.time += dt;
    const s = c.session;
    const v = this.opts.view();
    const me = s.local();
    const race = s.level.def.race;
    if (!race) return;
    const serverTick = s.tickNow?.() ?? s.world().tick;
    const myTick = s.world().tick;
    const nGates = race.checkpoints.length + 1;
    const others = s.others();
    this.models.update(others, dt, this.time);

    // a new race: fresh splits and ghost recording
    if (v && v.race !== this.lastRace && (v.phase === 'countdown' || v.phase === 'racing')) {
      this.lastRace = v.race;
      this.mySplits = [];
      this.myFinishMs = 0;
      this.recording = [];
      this.recordedTick = -1;
    }
    const racingNow = !!v && v.phase === 'racing' && !!me && me.raceCp >= 0 && me.raceCp < nGates;
    if (racingNow && me && myTick - this.recordedTick >= GHOST_EVERY) {
      this.recordedTick = myTick;
      this.recording.push(round2(me.pos.x), round2(me.pos.y), round2(me.pos.z), round2(yawOf(me)));
    }

    // your personal-best ghost runs alongside
    const ghostTicks = v && v.phase === 'racing' ? myTick - v.startTick : -1;
    const g = this.ghost && ghostTicks >= 0 ? ghostAt(this.ghost, ghostTicks) : null;
    this.ghostModels.update(g ? [ghostPlayer(g)] : [], dt, this.time);

    // countdown 3-2-1-GO
    const phase = v?.phase ?? 'lobby';
    if (v && phase === 'countdown') {
      const left = Math.max(0, Math.ceil((v.phaseEnds - serverTick) * TICK_DT - 1e-6));
      if (left !== this.lastCount && left > 0) {
        c.deps.audio.play('countdownTick');
        this.big(String(left), this.opts.trackName, 1.1, '#ffe9a8');
      }
      this.lastCount = left;
    } else if (phase === 'racing' && this.lastPhase === 'countdown') {
      c.deps.audio.play('roundStart');
      this.big('GO!', '', 0.9, GREEN);
      this.lastCount = -1;
    }
    if (v && phase === 'results' && this.lastPhase === 'racing') {
      const mine = v.result?.standings.find((x) => x.id === s.localId);
      if (mine?.dnf) {
        c.deps.audio.play('roundLose');
        this.big('DNF', 'out of time', 3, RED);
      }
    }
    this.lastPhase = phase;

    // top bar
    const clockMs =
      v && (phase === 'racing' || phase === 'results')
        ? this.myFinishMs || Math.max(0, (myTick - v.startTick) * TICK_DT * 1000)
        : 0;
    this.clockEl.textContent = formatRaceTime(phase === 'racing' || this.myFinishMs ? clockMs : 0);
    const place = v ? racePlace(v, s.localId) : null;
    const field = v?.racers.length ?? 0;
    this.placeEl.textContent =
      place && (phase === 'racing' || phase === 'results') ? `${place}/${field}` : '–';
    const cp = Math.max(0, Math.min(race.checkpoints.length, me?.raceCp ?? 0));
    this.cpEl.textContent =
      me && me.raceCp > race.checkpoints.length ? 'FINISH' : `CP ${cp}/${race.checkpoints.length}`;
    if (this.time > this.splitUntil) this.splitEl.textContent = '';
    this.subEl.textContent = this.subText(v, serverTick, me);

    // penalty: frozen at the checkpoint for a moment
    if (me && me.racePenalty > 0 && phase === 'racing') {
      this.bigEl.textContent = 'BACK TO CHECKPOINT';
      this.bigEl.style.color = '#ffb347';
      this.bigSubEl.textContent = (me.racePenalty * TICK_DT).toFixed(1);
      this.bigUntil = this.time + 0.05;
    }
    const showBig = this.time < this.bigUntil;
    this.bigEl.style.opacity = showBig ? '1' : '0';
    this.bigSubEl.style.opacity = showBig ? '1' : '0';

    // live order
    if (v && (phase === 'racing' || phase === 'results')) {
      const names = s.names();
      this.listEl.replaceChildren(
        ...v.order.map((id, i) => {
          const r = v.racers.find((x) => x.id === id);
          const done = r?.finishTicks
            ? formatRaceTime(r.finishTicks * TICK_DT * 1000)
            : r?.dnf
              ? 'DNF'
              : r?.left
                ? 'left'
                : `CP ${Math.min(r?.cp ?? 0, nGates - 1)}`;
          return h(
            'div',
            { class: `race-li${id === s.localId ? ' me' : ''}` },
            h('span', { class: 'race-li-pos' }, String(i + 1)),
            h(
              'span',
              { class: 'race-li-name' },
              id === s.localId ? 'You' : (names[id] ?? `Racer ${id}`),
            ),
            h('span', { class: 'race-li-t' }, done),
          );
        }),
      );
    } else this.listEl.replaceChildren();

    // gate labels: the next one big and bright, passed ones faint
    const next = me && me.raceCp >= 0 && me.raceCp < nGates ? me.raceCp : -1;
    this.labels.forEach((l, i) => {
      const passed = me ? i < me.raceCp : false;
      l.mat.opacity = i === next ? 1 : passed ? 0.25 : 0.7;
      const k = i === next ? 1.35 + 0.08 * Math.sin(this.time * 5) : 1;
      const base = i === this.labels.length - 1 ? [7, 1.75] : [3.2, 3.2];
      l.sprite.scale.set(base[0] * k, base[1] * k, 1);
    });
    // fuel cells: spinning; yours used this race are gone
    this.cells.forEach((m, i) => {
      m.visible = !me || !(me.raceFuel & (1 << i));
      m.rotation.y = this.time * 2 + i;
      m.position.y = (race.fuelCells ?? [])[i].y + Math.sin(this.time * 2.5 + i) * 0.15;
    });
    this.updateArrow(c, next);
    this.updateResults(c, v);
  }

  private subText(v: RaceView | null, tick: number, me: PlayerState | undefined): string {
    const pb = this.personalBest;
    const best = pb ? `Best ${formatRaceTime(pb.timeMs)}` : 'No best yet';
    if (!v) return best;
    const secs = (t: number) => Math.max(0, Math.ceil((t - tick) * TICK_DT));
    switch (v.phase) {
      case 'lobby':
        return v.startAt
          ? `Free run · race starts in ${secs(v.startAt)} s · ${best}`
          : `Free run · waiting for racers · ${best}`;
      case 'countdown':
        return `${this.opts.trackName} · ${best}`;
      case 'racing': {
        const left = secs(v.phaseEnds);
        const racing = me && me.raceCp >= 0;
        if (!racing) return `Race on — you're in the next one · ${best}`;
        return left <= 30 ? `DNF in ${left} s · ${best}` : best;
      }
      case 'results':
        return `Next race in ${secs(v.phaseEnds)} s · ${best}`;
    }
  }

  /** A marker toward the next gate (clamped to the screen edge when it's behind you). */
  private updateArrow(c: GameClient, next: number): void {
    const race = c.session.level.def.race!;
    const gates = [...race.checkpoints, race.finish];
    if (next < 0 || next >= gates.length || c.panelOpen) {
      this.arrowEl.style.display = 'none';
      return;
    }
    const g = gates[next];
    const p = gateCenter(g);
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    const pm = projectMarker(v3(p.x, g.min.y + 3, p.z), c.camera, w, hgt);
    const label = next === gates.length - 1 ? 'FINISH' : String(next + 1);
    this.arrowEl.style.display = '';
    if (pm.onScreen) {
      this.arrowEl.textContent = `◆ ${label} · ${Math.round(pm.dist)} m`;
      this.arrowEl.style.transform = `translate(${pm.x}px, ${pm.y}px) translate(-50%, -100%)`;
    } else {
      const e = edgePoint(pm.angle, w, hgt);
      const arrow = '➤';
      this.arrowEl.textContent = `${arrow} ${label}`;
      this.arrowEl.style.transform = `translate(${e.x}px, ${e.y}px) translate(-50%, -50%)`;
    }
  }

  private updateResults(c: GameClient, v: RaceView | null): void {
    const res: RaceResult | null = v && v.phase === 'results' ? v.result : null;
    c.panelOpen = !!res;
    if (!res) {
      this.resultsEl.classList.add('hidden');
      this.resultsShownFor = -1;
      return;
    }
    this.resultsEl.classList.remove('hidden');
    if (this.resultsShownFor === res.race) return;
    this.resultsShownFor = res.race;
    const win = res.standings[0]?.timeMs ?? null;
    const pb = this.personalBest;
    this.resultsEl.replaceChildren(
      h('h2', {}, `${this.opts.trackName} — results`),
      h(
        'table',
        {},
        h(
          'tr',
          {},
          h('th', {}, '#'),
          h('th', {}, 'Racer'),
          h('th', {}, 'Time'),
          h('th', {}, 'Gap'),
        ),
        ...res.standings.map((st) =>
          h(
            'tr',
            { class: st.id === c.session.localId ? 'me' : '' },
            h('td', {}, st.dnf || st.left ? '–' : String(st.place)),
            h('td', {}, this.name(c, st.id)),
            h('td', {}, st.timeMs !== null ? formatRaceTime(st.timeMs) : st.left ? 'left' : 'DNF'),
            h(
              'td',
              {},
              st.timeMs !== null && win !== null && st.timeMs > win
                ? `+${((st.timeMs - win) / 1000).toFixed(2)}`
                : '',
            ),
          ),
        ),
      ),
      h(
        'p',
        { class: 'race-results-pb' },
        pb ? `Your best on ${this.opts.trackName}: ${formatRaceTime(pb.timeMs)}` : '',
      ),
    );
  }

  dispose(c: GameClient): void {
    this.root.remove();
    c.hud.dashLine = null;
    c.panelOpen = false;
    this.models.dispose();
    this.ghostModels.dispose();
    for (const l of this.labels) {
      l.mat.dispose();
      l.tex.dispose();
    }
    this.cellGeo.dispose();
    this.cellMat.dispose();
    c.scene.remove(this.group, this.models.group, this.ghostModels.group);
  }
}

/** The ghost as a player to draw (orange, so it never looks like a real racer). */
const ghostPlayer = (g: { pos: Vec3; yaw: number; vel: Vec3 }): RenderPlayer => ({
  id: -100,
  team: 1,
  name: 'Best',
  pos: g.pos,
  up: v3(0, 1, 0),
  view: qFromYawPitch(g.yaw, 0, v3(0, 1, 0), v3(0, 0, -1)),
  vel: g.vel,
  crouched: false,
  alive: true,
  move: 0,
  hp: 100,
  windup: 0,
  aiming: false,
  laserWarn: 0,
  slashTicks: 0,
  carrier: false,
  revealed: false,
});

/** A gate number (or FINISH) drawn on a small canvas. */
const labelTexture = (text: string, wide: boolean): THREE.CanvasTexture => {
  const cv = document.createElement('canvas');
  cv.width = wide ? 256 : 128;
  cv.height = wide ? 64 : 128;
  const g = cv.getContext('2d');
  if (g) {
    g.fillStyle = 'rgba(20, 16, 8, 0.55)';
    g.beginPath();
    g.roundRect?.(4, 4, cv.width - 8, cv.height - 8, 18);
    g.fill();
    g.fillStyle = '#ffe9a8';
    g.font = `800 ${wide ? 44 : 84}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, cv.width / 2, cv.height / 2 + 4);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};
