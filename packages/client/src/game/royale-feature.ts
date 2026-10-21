// Royale HUD (shared/rules/royale.ts): on top the players alive, the zone's state and timer and
// your round wins; under it a compass strip (north, the zone, and during a location flash every
// player's direction and distance) with the countdown to the next flash; a blue wall in the
// world where the zone ends and a warning while you're outside it; "ELIMINATED · #4 of 8"
// while you watch the others (LMB / RMB switch who); the standings on Tab; between rounds the
// round's placings and everyone's round wins; at the end the match results. Works offline (the
// state comes straight from the rules) and online (the server's `{ rules: 'royale', ... }`).
// Reuses the match HUD's styles (.match-bar, .scoreboard, .match-results, ...).
import * as THREE from 'three';
import type { RoyaleRow, RoyaleView, RoyaleZoneNow, Vec3 } from '@space-yz/shared';
import { TICK_DT, getMap, royaleZoneAt, royaleZoneGrace } from '@space-yz/shared';
import type { ClientFeature, GameClient } from './client';
import type { CombatFeature } from './combat-feature';
import type { ZoneDraw } from './session';
import { h } from '../ui/menus';
import { setSidesSwapped } from '../render/team-palette';
import { showTransition } from '../ui/transitions';

const WIN = '#5dff9a';
const ZONE = '#6cc4ff';

const fmt = (sec: number): string => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The Royale state from a NetCore's rules state (null in other rooms). */
export const royaleFromExtra = (extra: unknown): (RoyaleView & { startAt?: number }) | null => {
  const x = extra as (RoyaleView & { rules?: string; startAt?: number }) | null;
  return x && x.rules === 'royale' ? x : null;
};

/** The zone now, if a round is on (countdown, live, between rounds). */
export const royaleZoneNow = (v: RoyaleView | null, tick: number): RoyaleZoneNow | null =>
  v?.zone && v.phase !== 'lobby' && v.phase !== 'end' ? royaleZoneAt(v.zone, tick) : null;

/** The zone as the minimap draws it (Session.zone). */
export const royaleZoneDraw = (v: RoyaleView | null, tick: number): ZoneDraw | null => {
  const z = royaleZoneNow(v, tick);
  return z ? { center: z.center, radius: z.radius, next: z.next } : null;
};

/** The zone line on the top bar: "ZONE CLOSES IN 0:42", "ZONE CLOSING 0:12", "ZONE CLOSED". */
export const zoneStatusText = (z: RoyaleZoneNow, tick: number): string =>
  z.state === 'closed'
    ? 'ZONE CLOSED'
    : z.state === 'wait'
      ? `ZONE CLOSES IN ${fmt((z.until - tick) * TICK_DT)}`
      : `ZONE CLOSING ${fmt((z.until - tick) * TICK_DT)}`;

/** The flash line: "LOCATIONS REVEALED" during a flash, else "Next flash in 12 s". */
export const flashText = (v: RoyaleView, tick: number): string =>
  v.revealed.length && tick < v.flashUntil
    ? 'LOCATIONS REVEALED'
    : v.nextFlash > 0
      ? `Next location flash in ${Math.max(0, Math.ceil((v.nextFlash - tick) * TICK_DT))} s`
      : '';

/** "#3 of 8" */
export const placeText = (place: number, of: number): string => `#${place} of ${of}`;

/** Round wins as stars: ★★☆ (first to 3). */
export const winStars = (wins: number, of: number): string =>
  '★'.repeat(Math.min(wins, of)) + '☆'.repeat(Math.max(0, of - wins));

/** The round-end / match-end headline from your point of view. */
export const royaleResultTitle = (
  v: RoyaleView,
  me: number,
  name: (id: number) => string,
): { text: string; color: string; won: boolean } => {
  if (v.phase === 'end') {
    const won = v.winner === me;
    const place = v.table.findIndex((r) => r.id === me) + 1;
    return {
      text: won
        ? 'YOU WIN THE MATCH'
        : place > 0
          ? `PLACE ${place} OF ${v.table.length}`
          : 'MATCH OVER',
      color: won ? WIN : '#fff',
      won,
    };
  }
  const won = v.roundWinner === me;
  return {
    text: won
      ? 'YOU WIN THE ROUND'
      : v.roundWinner === null
        ? `ROUND ${v.round} OVER`
        : `${name(v.roundWinner).toUpperCase()} WINS ROUND ${v.round}`,
    color: won ? WIN : '#fff',
    won,
  };
};

/** Compass heading of a flat direction, degrees (0 = north = −z, 90 = east = +x). */
const heading = (dx: number, dz: number): number => (Math.atan2(dx, -dz) * 180) / Math.PI;
const wrap = (deg: number): number => ((((deg + 180) % 360) + 360) % 360) - 180;

export class RoyaleFeature implements ClientFeature {
  private root!: HTMLDivElement;
  private left!: HTMLDivElement;
  private center!: HTMLDivElement;
  private right!: HTMLDivElement;
  private sub!: HTMLDivElement;
  private compass!: HTMLDivElement;
  private compassHtml = '';
  private outside!: HTMLDivElement;
  private banner!: HTMLDivElement;
  private bannerSub!: HTMLDivElement;
  private board!: HTMLDivElement;
  private results!: HTMLDivElement;
  private resBoard!: HTMLDivElement;
  private resNext!: HTMLDivElement;
  private boardHeld = false;
  private unsub: (() => void) | null = null;
  private time = 0;
  private lastBoard = -1;
  /** the round / match end we already showed (matchNo * 100 + round) */
  private shownStart = -1;
  private shownEnd = -1;
  private wall: THREE.Mesh | null = null;

  constructor(
    private opts: {
      /** the Royale state now (offline: royaleView(...); online: royaleFromExtra(core.extra)) */
      view: () => (RoyaleView & { startAt?: number }) | null;
      /** its "ELIMINATED" line gets your place */
      combat?: CombatFeature;
      /** the results' Back to menu button */
      onBack?: () => void;
      /** what follows the match results ("Next match", "Back to the lobby") */
      afterMatch?: string;
      /** online: you are the host of a room in its lobby (Esc → Start match now) */
      canStart?: () => boolean;
    },
  ) {}

  init(c: GameClient): void {
    this.left = h('div', { class: 'mb-score royale-alive' });
    this.center = h('div', { class: 'mb-center royale-zone' });
    this.right = h('div', { class: 'mb-score royale-wins' });
    this.sub = h('div', { class: 'mb-sub' });
    this.compass = h('div', { class: 'royale-compass' });
    this.outside = h('div', { class: 'royale-outside' });
    this.banner = h('div', { class: 'match-banner' });
    this.bannerSub = h('div', { class: 'match-banner-sub' });
    this.board = h('div', { class: 'scoreboard' });
    this.results = h('div', { class: 'match-results brawl-results royale-results' });
    this.root = h(
      'div',
      { class: 'match-ui royale-ui' },
      h(
        'div',
        { class: 'match-bar' },
        h('div', { class: 'mb-row' }, this.left, this.center, this.right),
        this.sub,
        this.compass,
      ),
      this.outside,
      h('div', { class: 'match-banner-wrap' }, this.banner, this.bannerSub),
      this.board,
      this.results,
    );
    for (const el of [this.root, this.board, this.results, this.outside]) el.style.display = 'none';
    c.deps.ui.append(this.root);
    this.unsub = c.deps.input.onAction((a) => {
      if (a === 'scoreboard') this.boardHeld = true;
      if (a === 'scoreboard:up') this.boardHeld = false;
    });
    // the zone's edge in the world: a tall see-through blue wall
    const geo = new THREE.CylinderGeometry(1, 1, 1, 128, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x3aa8ff,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.wall = new THREE.Mesh(geo, mat);
    this.wall.visible = false;
    this.wall.frustumCulled = false;
    this.wall.renderOrder = 4;
    c.scene.add(this.wall);
  }

  private name(c: GameClient, id: number): string {
    return id === c.session.localId ? 'You' : (c.session.names()[id] ?? `Player ${id}`);
  }

  frame(c: GameClient, dt: number): void {
    this.time += dt;
    const v = this.opts.view();
    if (!v) {
      this.root.style.display = 'none';
      if (this.wall) this.wall.visible = false;
      return;
    }
    this.root.style.display = '';
    // free-for-all: no sides (a match before may have swapped the team colours)
    setSidesSwapped(false);
    const s = c.session;
    const me = s.localId;
    const local = s.local();
    const tick = s.tickNow?.() ?? s.world().tick;
    const secs = (until: number) => (until - tick) * TICK_DT;
    const mine = v.table.find((r) => r.id === me);
    const z = royaleZoneNow(v, tick);
    const playing = v.phase === 'countdown' || v.phase === 'live';

    // ---- top bar: alive · zone · your round wins ----
    this.left.textContent = playing ? `${v.alive.length}` : '';
    this.left.style.display = playing ? '' : 'none';
    this.left.title = 'players alive';
    this.right.textContent = winStars(mine?.wins ?? 0, v.winsToWin);
    this.right.style.color = '#ffd24a';
    if (v.phase === 'lobby') {
      const n = v.table.length;
      this.center.textContent = 'ROYALE LOBBY';
      const start =
        v.startAt && v.startAt > tick ? `Match starts in ${Math.ceil(secs(v.startAt))} s` : '';
      this.sub.textContent = [
        `${n} player${n === 1 ? '' : 's'} · free play until the match starts`,
        start || (this.opts.canStart?.() ? 'Esc → Start match now' : 'Waiting for players'),
      ].join(' · ');
    } else if (v.phase === 'countdown') {
      this.center.textContent = `ROUND ${v.round} · ${Math.max(1, Math.ceil(secs(v.phaseEnds)))}`;
      this.sub.textContent = `Royale · first to ${v.winsToWin} round wins · ${v.entrants} players`;
    } else if (v.phase === 'live' && z) {
      this.center.textContent = zoneStatusText(z, tick);
      this.sub.textContent = [`Round ${v.round}`, `${v.alive.length} alive`, flashText(v, tick)]
        .filter(Boolean)
        .join(' · ');
    } else {
      this.center.textContent = v.phase === 'end' ? 'MATCH OVER' : `ROUND ${v.round} OVER`;
      this.sub.textContent = `First to ${v.winsToWin} round wins`;
    }
    this.center.classList.toggle(
      'urgent',
      !!z && v.phase === 'live' && (z.state === 'shrink' || z.state === 'closed'),
    );
    this.center.classList.toggle(
      'royale-flash',
      v.phase === 'live' && v.revealed.length > 0 && tick < v.flashUntil,
    );

    // ---- the zone in the world, and you outside it ----
    this.updateWall(z, playing);
    const out = !!z && v.phase === 'live' && !!local?.alive && this.outsideOf(z, local.pos);
    this.outside.style.display = out ? '' : 'none';
    if (out && z) {
      const to = z.next && z.state !== 'closed' ? z.next.center : z.center;
      const d = Math.round(Math.max(0, Math.hypot(local!.pos.x - to.x, local!.pos.z - to.z)));
      this.outside.textContent = royaleZoneGrace(z)
        ? `OUTSIDE THE ZONE · get in before it closes (${d} m)`
        : `OUTSIDE THE ZONE · −${z.dps} HP/s · get in (${d} m)`;
    }

    // ---- the compass strip ----
    this.updateCompass(c, v, z, tick);

    // ---- banners and cards: a round starts, a round / the match ends ----
    const key = v.matchNo * 100 + v.round;
    if (v.phase === 'countdown' && this.shownStart !== key) {
      this.shownStart = key;
      const map = getMap(v.map).name;
      if (v.round === 1) showTransition('matchStart', { map, mode: 'ROYALE' });
      else showTransition('round', { round: v.round, sub: `First to ${v.winsToWin} round wins` });
    }
    if ((v.phase === 'roundEnd' || v.phase === 'end') && this.shownEnd !== key) {
      this.shownEnd = key;
      const r = royaleResultTitle(v, me, (id) => this.name(c, id));
      c.deps.audio.play(r.won ? 'roundWin' : 'roundLose');
      if (v.phase === 'end') showTransition(r.won ? 'victory' : 'defeat', { sub: r.text });
      this.buildResults(c, v);
    }
    const bannerOn = v.phase === 'countdown';
    this.banner.style.opacity = bannerOn ? '1' : '0';
    this.bannerSub.style.opacity = bannerOn ? '1' : '0';
    if (bannerOn) {
      this.banner.textContent = String(Math.max(1, Math.ceil(secs(v.phaseEnds))));
      this.banner.style.color = ZONE;
      this.bannerSub.textContent = `Round ${v.round} · last one standing wins`;
    }

    // ---- out of the round: your place, then watch the others ----
    const combat = this.opts.combat;
    if (combat?.hud && local && !local.alive && !c.panelOpen && v.phase === 'live') {
      const placing = v.out.find((o) => o.id === me);
      combat.hud.setDeath(
        placing
          ? `ELIMINATED · ${placeText(placing.place, v.entrants)}`
          : 'WATCHING · you play from the next round',
      );
    }

    // ---- standings (Tab), the round / match results ----
    const showBoard = this.boardHeld && (playing || v.phase === 'lobby') && v.table.length > 0;
    const showRes = v.phase === 'roundEnd' || v.phase === 'end';
    this.board.style.display = showBoard ? '' : 'none';
    this.results.style.display = showRes ? '' : 'none';
    c.panelOpen = showBoard || showRes;
    if (this.time - this.lastBoard > 0.25) {
      this.lastBoard = this.time;
      if (showBoard) this.board.replaceChildren(this.standings(c, v));
      if (showRes && this.resBoard) {
        this.resBoard.replaceChildren(this.standings(c, v));
        const left = Math.max(0, Math.ceil(secs(v.phaseEnds)));
        this.resNext.textContent =
          v.phase === 'end'
            ? `${this.opts.afterMatch ?? 'Back to the lobby'} in ${left} s`
            : `Round ${v.round + 1} in ${left} s`;
      }
    }
  }

  private outsideOf(z: RoyaleZoneNow, p: Vec3): boolean {
    return Math.hypot(p.x - z.center.x, p.z - z.center.z) > z.radius;
  }

  private updateWall(z: RoyaleZoneNow | null, playing: boolean): void {
    const w = this.wall;
    if (!w) return;
    w.visible = !!z && playing && z.radius > 0.5;
    if (!w.visible || !z) return;
    const height = 240;
    w.scale.set(z.radius, height, z.radius);
    w.position.set(z.center.x, z.center.y + height / 2 - 60, z.center.z);
  }

  /**
   * The compass strip: what lies within 75° either side of where you look — N / E / S / W, the
   * zone (◎, the circle it closes in to), and during a flash every other player (◆ + metres).
   */
  private updateCompass(c: GameClient, v: RoyaleView, z: RoyaleZoneNow | null, tick: number): void {
    const show = v.phase === 'live' || v.phase === 'countdown';
    this.compass.style.display = show ? '' : 'none';
    if (!show) return;
    const cam = new THREE.Vector3();
    c.camera.getWorldDirection(cam);
    const look = heading(cam.x, cam.z);
    const eye = c.camera.position;
    const items: string[] = [];
    const put = (deg: number, html: string, cls: string) => {
      const rel = wrap(deg - look);
      if (Math.abs(rel) > 75) return;
      items.push(
        `<span class="rc-mark ${cls}" style="left:${(50 + (rel / 150) * 100).toFixed(1)}%">${html}</span>`,
      );
    };
    for (const [d, t] of [
      [0, 'N'],
      [90, 'E'],
      [180, 'S'],
      [270, 'W'],
    ] as const)
      put(d, t, 'rc-dir');
    for (const d of [45, 135, 225, 315]) put(d, '·', 'rc-tick');
    if (z) {
      const to = z.next ?? z;
      const dist = Math.hypot(to.center.x - eye.x, to.center.z - eye.z);
      if (dist > 2) put(heading(to.center.x - eye.x, to.center.z - eye.z), '◎', 'rc-zone');
    }
    if (v.revealed.length && tick < v.flashUntil) {
      for (const p of c.session.others()) {
        if (!p.alive || !v.revealed.includes(p.id)) continue;
        const dx = p.pos.x - eye.x;
        const dz = p.pos.z - eye.z;
        put(heading(dx, dz), `◆<small>${Math.round(Math.hypot(dx, dz))}</small>`, 'rc-foe');
      }
    }
    const html = items.join('');
    if (html !== this.compassHtml) {
      this.compassHtml = html;
      this.compass.innerHTML = html;
    }
  }

  /** The results panel (built once per round end: its button must survive the updates). */
  private buildResults(c: GameClient, v: RoyaleView): void {
    const r = royaleResultTitle(v, c.session.localId, (id) => this.name(c, id));
    const winner = v.phase === 'end' ? v.winner : v.roundWinner;
    const wins = winner !== null ? (v.table.find((x) => x.id === winner)?.wins ?? 0) : 0;
    const reason =
      v.phase === 'end'
        ? winner !== null
          ? `${this.name(c, winner)} ${winner === c.session.localId ? 'win' : 'wins'} ${wins} rounds · first to ${v.winsToWin}`
          : ''
        : `Round ${v.round} · first to ${v.winsToWin} round wins`;
    this.resBoard = h('div', {});
    this.resNext = h('div', { class: 'mr-next' });
    const back = h('button', { class: 'btn secondary brawl-back', type: 'button' }, 'Back to menu');
    back.addEventListener('click', () => this.opts.onBack?.());
    this.results.replaceChildren(
      h(
        'div',
        { class: 'mr' },
        h('div', { class: 'mr-title', style: `color:${r.color}` }, r.text),
        h('div', { class: 'mr-reason' }, reason),
        this.resBoard,
        this.resNext,
        this.opts.onBack && v.phase === 'end' ? back : null,
        h('div', { class: 'mr-hint' }, 'Esc for the menu'),
      ),
    );
  }

  /** The standings: place, player, round wins, kills, this round, ping. */
  standings(c: GameClient, v: RoyaleView): HTMLElement {
    const me = c.session.localId;
    const pings = c.session.pings?.() ?? {};
    const status = (r: RoyaleRow) =>
      v.phase === 'lobby'
        ? '—'
        : !r.playing
          ? 'next round'
          : r.place !== null
            ? r.place === 1
              ? 'won'
              : `out #${r.place}`
            : r.alive
              ? 'alive'
              : 'out';
    return h(
      'div',
      { class: 'sb' },
      h('div', { class: 'sb-title' }, `ROYALE · ${getMap(v.map).name}`),
      h(
        'table',
        {},
        h(
          'tr',
          {},
          ...[
            '#',
            'Player',
            'Round wins',
            'Kills',
            v.phase === 'lobby' ? '' : 'This round',
            'Ping',
          ].map((x) => h('th', {}, x)),
        ),
        ...v.table.map((r, i) =>
          h(
            'tr',
            { class: r.id === me ? 'me' : '' },
            h('td', {}, String(i + 1)),
            h('td', {}, this.name(c, r.id)),
            h('td', { class: 'royale-stars' }, winStars(r.wins, v.winsToWin)),
            h('td', {}, String(r.kills)),
            h('td', { style: r.alive && v.phase !== 'lobby' ? `color:${WIN}` : '' }, status(r)),
            h('td', {}, pings[r.id] ? `${pings[r.id]} ms` : '—'),
          ),
        ),
      ),
    );
  }

  dispose(c: GameClient): void {
    this.unsub?.();
    this.root.remove();
    if (this.wall) {
      c.scene.remove(this.wall);
      this.wall.geometry.dispose();
      (this.wall.material as THREE.Material).dispose();
    }
  }
}
