// Sound visualizer ("surround indicators"): every sound you would hear appears at the edge of
// the screen in the direction it came from — footsteps, jumps, dashes, throws, lasers,
// grenades, recalls, incoming Boomerangs… — so people can play without sound or headphones.
// Brightness = loudness (closer = brighter), ▲/▼ = above/below you (gravity changes!), enemy
// sounds in the enemy's color, dangers pulse red. Only what you could hear is shown, so it
// gives no advantage over headphones.
import type { SimEvent, Vec3 } from '@space-yz/shared';
import {
  Move,
  isFlying,
  len,
  sub,
  dot,
  normalize,
  v3,
  cross,
  projectOnPlane,
} from '@space-yz/shared';
import type { ClientFeature, GameClient } from './client';
import { h } from '../ui/menus';

export type SoundKind =
  | 'steps'
  | 'jump'
  | 'land'
  | 'slide'
  | 'dash'
  | 'thruster'
  | 'throw'
  | 'windup'
  | 'laserWarn'
  | 'laser'
  | 'grenade'
  | 'pull'
  | 'explosion'
  | 'recall'
  | 'clash'
  | 'wallHit'
  | 'deflect'
  | 'slash'
  | 'boomerang'
  | 'controller';

interface KindInfo {
  label: string;
  range: number; // meters you can hear it from
  life: number; // seconds shown
  danger?: boolean;
  priority: number;
}

export const SOUND_KINDS: Record<SoundKind, KindInfo> = {
  steps: { label: 'Footsteps', range: 28, life: 0.6, priority: 1 },
  jump: { label: 'Jump', range: 22, life: 0.9, priority: 1 },
  land: { label: 'Landing', range: 22, life: 0.9, priority: 1 },
  slide: { label: 'Slide', range: 25, life: 0.9, priority: 1 },
  dash: { label: 'Dash', range: 30, life: 1, priority: 2 },
  thruster: { label: 'Thruster', range: 30, life: 1, priority: 2 },
  throw: { label: 'Throw', range: 40, life: 1.2, priority: 3 },
  windup: { label: 'Wind-up!', range: 55, life: 3, danger: true, priority: 5 },
  laserWarn: { label: 'Laser!', range: 60, life: 0.8, danger: true, priority: 5 },
  laser: { label: 'Laser shot', range: 70, life: 1, priority: 3 },
  grenade: { label: 'Grenade', range: 40, life: 1.4, priority: 3 },
  pull: { label: 'Grenade pull', range: 50, life: 1.5, danger: true, priority: 4 },
  explosion: { label: 'Explosion', range: 60, life: 1.2, priority: 3 },
  recall: { label: 'Recall!', range: 80, life: 1, danger: true, priority: 6 },
  clash: { label: 'Clash', range: 40, life: 1, priority: 2 },
  wallHit: { label: 'Boomerang hit', range: 30, life: 1, priority: 2 },
  deflect: { label: 'Deflect', range: 40, life: 1, priority: 3 },
  slash: { label: 'Slash', range: 20, life: 0.8, priority: 3 },
  boomerang: { label: 'Boomerang incoming', range: 30, life: 0.25, danger: true, priority: 6 },
  controller: { label: 'Controller', range: 80, life: 2, priority: 4 },
};

export interface HeardSound {
  key: string;
  kind: SoundKind;
  pos: Vec3;
  team: 0 | 1 | null;
  born: number;
}

/**
 * Where on screen a sound goes: angle 0 = straight ahead (top edge), 90 = right, 180 = behind
 * (bottom edge); `vertical` = height above (+) / below (−) you along your own up.
 */
export const soundDirection = (
  pos: Vec3,
  eye: Vec3,
  forward: Vec3,
  right: Vec3,
  up: Vec3,
): { angle: number; dist: number; vertical: number } => {
  const d = sub(pos, eye);
  const dist = len(d);
  const vertical = dot(d, up);
  const x = dot(d, right);
  const z = dot(d, forward);
  return { angle: Math.atan2(x, z), dist, vertical };
};

/**
 * The frame sounds are placed in: your body's (forward along the floor, up = your up), not
 * the camera's. Otherwise looking up or down would turn "ahead" into "above"/"below" and
 * swing the indicators around the screen edge.
 */
export const listenerFrame = (
  viewForward: Vec3,
  bodyUp: Vec3,
): { forward: Vec3; right: Vec3; up: Vec3 } => {
  const up = normalize(bodyUp, v3(0, 1, 0));
  // (straight up/down can't happen: pitch stops at 88°)
  const forward = normalize(projectOnPlane(viewForward, up), v3(0, 0, -1));
  return { forward, right: cross(forward, up), up };
};

/** 0..1 loudness (0 = can't hear it). */
export const loudness = (kind: SoundKind, dist: number): number => {
  const r = SOUND_KINDS[kind].range;
  return dist >= r ? 0 : Math.min(1, 1.15 - dist / r);
};

const TEAM_COLOR = ['#19e3ff', '#ff8a1f'];
const MAX_SHOWN = 8;
const CLUSTER_RAD = (15 * Math.PI) / 180;

/** Smallest difference between two angles (radians). */
export const angleGap = (a: number, b: number): number => {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
};

export class SoundRadar implements ClientFeature {
  private root!: HTMLDivElement;
  private items = new Map<string, HTMLDivElement>();
  private sounds = new Map<string, HeardSound>();
  private time = 0;
  private stepPhase = new Map<number, number>();
  enabled: () => boolean;

  constructor(enabled: () => boolean = () => true) {
    this.enabled = enabled;
  }

  init(c: GameClient): void {
    this.root = h('div', { class: 'sound-radar' });
    c.deps.ui.append(this.root);
  }

  /** Record a sound (merging repeats from the same source). */
  hear(kind: SoundKind, pos: Vec3, team: 0 | 1 | null, source: string | number): void {
    const key = `${kind}:${source}`;
    this.sounds.set(key, { key, kind, pos: { ...pos }, team, born: this.time });
  }

  events(c: GameClient, events: SimEvent[]): void {
    const s = c.session;
    const me = s.localId;
    const others = new Map(s.others().map((p) => [p.id, p]));
    const from = (id: number, kind: SoundKind) => {
      if (id === me) return;
      const p = others.get(id);
      if (p) this.hear(kind, p.pos, p.team, id);
    };
    const teamOf = (id: number): 0 | 1 | null => others.get(id)?.team ?? null;
    for (const e of events) {
      switch (e.type) {
        case 'jump':
        case 'wallJump':
        case 'mantle':
          from(e.player, 'jump');
          break;
        case 'land':
          if (e.speed > 4) from(e.player, 'land');
          break;
        case 'slide':
          from(e.player, 'slide');
          break;
        case 'dash':
          from(e.player, 'dash');
          break;
        case 'thruster':
        case 'pushOff':
          from(e.player, 'thruster');
          break;
        case 'throw':
          this.sounds.delete(`windup:${e.player}`); // fired: no longer winding up
          from(e.player, 'throw');
          break;
        case 'windupStart':
          from(e.player, 'windup');
          break;
        case 'windupCancel':
          this.sounds.delete(`windup:${e.player}`);
          break;
        case 'laserWarn':
          from(e.player, 'laserWarn');
          break;
        case 'laserFire':
          if (e.player !== me) this.hear('laser', e.from, teamOf(e.player), e.player);
          break;
        case 'grenadeThrow':
          from(e.player, 'grenade');
          break;
        case 'grenadeActivate':
          this.hear('pull', e.pos, null, e.grenade);
          break;
        case 'grenadePop':
          this.sounds.delete(`pull:${e.grenade}`);
          this.hear('explosion', e.pos, null, e.grenade);
          break;
        case 'recallStart':
          if (e.player !== me) this.hear('recall', e.from, teamOf(e.player), e.player);
          break;
        case 'clash':
          this.hear('clash', e.pos, null, `${e.a}-${e.b}`);
          break;
        case 'wallHit':
          this.hear('wallHit', e.pos, null, e.boomerang);
          break;
        case 'deflect':
          if (e.player !== me) this.hear('deflect', e.pos, teamOf(e.player), e.player);
          break;
        case 'slash':
          from(e.player, 'slash');
          break;
        case 'controllerDrop':
          this.hear('controller', e.pos, e.team, `c${e.team}`);
          break;
      }
    }
  }

  frame(c: GameClient, dt: number): void {
    this.time += dt;
    const on = this.enabled();
    this.root.style.display = on ? '' : 'none';
    if (!on) {
      // keep forgetting old sounds while switched off (they'd pile up otherwise)
      for (const [key, snd] of this.sounds)
        if (this.time - snd.born > SOUND_KINDS[snd.kind].life) this.sounds.delete(key);
      return;
    }
    const s = c.session;
    const local = s.local();
    const myTeam = local?.team ?? 0;
    // continuous sounds: footsteps of running players, Boomerangs flying at you
    const others = s.others();
    for (const id of this.stepPhase.keys())
      if (!others.some((p) => p.id === id)) this.stepPhase.delete(id); // left the game
    for (const p of others) {
      if (!p.alive) continue;
      const planar = len(p.vel);
      const onGround = p.move === Move.Ground || p.move === Move.Slide;
      if (onGround && planar > 2.5) {
        const interval = planar > 7 ? 0.3 : 0.45;
        const last = this.stepPhase.get(p.id) ?? -1;
        if (this.time - last >= interval) {
          this.stepPhase.set(p.id, this.time);
          this.hear('steps', p.pos, p.team, p.id);
        }
      }
    }
    const eye = c.eye();
    for (const b of s.boomerangs()) {
      if (!isFlying(b) || b.controller === s.localId) continue;
      const toMe = sub(eye, b.pos);
      const d = len(toMe);
      if (d > SOUND_KINDS.boomerang.range || d < 0.5) continue;
      const approaching = dot(normalize(b.vel, v3()), normalize(toMe)) > 0.5;
      if (approaching) {
        const owner = others.find((p) => p.id === b.controller);
        this.hear('boomerang', b.pos, owner?.team ?? null, `b${b.id}`);
      }
    }

    // your body's frame (see listenerFrame)
    const { forward: F, right: R, up: U } = listenerFrame(c.fps.forward(), c.fps.up);

    // choose what to show: enemy and neutral sounds you can hear (teammates' own noise is
    // just clutter — except their Controller), most important first
    const heard: { snd: HeardSound; loud: number; dir: ReturnType<typeof soundDirection> }[] = [];
    for (const [key, snd] of this.sounds) {
      const info = SOUND_KINDS[snd.kind];
      if (this.time - snd.born > info.life) {
        this.sounds.delete(key);
        continue;
      }
      if (snd.team === myTeam && snd.kind !== 'controller') continue;
      const dir = soundDirection(snd.pos, eye, F, R, U);
      const loud = loudness(snd.kind, dir.dist);
      if (loud <= 0) continue;
      heard.push({ snd, loud, dir });
    }
    heard.sort(
      (a, b) =>
        SOUND_KINDS[b.snd.kind].priority - SOUND_KINDS[a.snd.kind].priority || b.loud - a.loud,
    );
    // merge sounds from about the same direction into one indicator
    const clusters: (typeof heard)[] = [];
    for (const x of heard) {
      const c = clusters.find((cl) => angleGap(cl[0].dir.angle, x.dir.angle) < CLUSTER_RAD);
      if (c) c.push(x);
      else if (clusters.length < MAX_SHOWN) clusters.push([x]);
    }
    const keep = new Set<string>();
    const w = c.deps.renderer.domElement.clientWidth;
    const hgt = c.deps.renderer.domElement.clientHeight;
    const rx = w * 0.42;
    const ry = hgt * 0.36;
    for (const cl of clusters) {
      const top = cl[0];
      const { snd, dir } = top;
      const key = snd.key;
      keep.add(key);
      let el = this.items.get(key);
      if (!el) {
        el = h(
          'div',
          { class: 'sr-item' },
          h('span', { class: 'sr-arrow' }),
          h('span', { class: 'sr-label' }),
          h('span', { class: 'sr-meta' }),
        );
        this.root.append(el);
        this.items.set(key, el);
      }
      const info = SOUND_KINDS[snd.kind];
      const age = (this.time - snd.born) / info.life;
      const loud = Math.max(...cl.map((x) => x.loud));
      const x = w / 2 + Math.sin(dir.angle) * rx;
      const y = hgt / 2 - Math.cos(dir.angle) * ry;
      const enemy = snd.team !== null && snd.team !== myTeam;
      const color =
        info.danger && (enemy || snd.team === null)
          ? '#ff5b5b'
          : snd.team === null
            ? '#e8f1ff'
            : TEAM_COLOR[snd.team];
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.color = color;
      el.style.opacity = String(Math.max(0.2, loud * (1 - age * 0.6)));
      el.style.transform = `translate(-50%, -50%) scale(${0.85 + loud * 0.35})`;
      el.classList.toggle('danger', !!info.danger);
      const arrow = el.children[0] as HTMLSpanElement;
      arrow.style.transform = `rotate(${(dir.angle * 180) / Math.PI}deg)`;
      // "Throw · Footsteps ×3": the loudest kinds in this direction
      const counts = new Map<SoundKind, number>();
      for (const m of cl) counts.set(m.snd.kind, (counts.get(m.snd.kind) ?? 0) + 1);
      const label = [...counts]
        .slice(0, 2)
        .map(([k, n]) => `${SOUND_KINDS[k].label}${n > 1 ? ` ×${n}` : ''}`)
        .join(' · ');
      (el.children[1] as HTMLSpanElement).textContent = label;
      const nearest = Math.min(...cl.map((m) => m.dir.dist));
      const vert = dir.vertical > 3 ? ' ▲ above' : dir.vertical < -3 ? ' ▼ below' : '';
      (el.children[2] as HTMLSpanElement).textContent = `${Math.round(nearest)} m${vert}`;
    }
    for (const [key, el] of this.items)
      if (!keep.has(key)) {
        el.remove();
        this.items.delete(key);
      }
  }

  /** What is currently shown (for tests / tools). */
  visible(): { kind: SoundKind; label: string }[] {
    return [...this.items.keys()].map((k) => {
      const kind = k.split(':')[0] as SoundKind;
      return { kind, label: SOUND_KINDS[kind].label };
    });
  }

  dispose(): void {
    this.root.remove();
  }
}
